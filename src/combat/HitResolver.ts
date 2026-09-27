/**
 * Everything that happens when a strike connects: who it reaches, dodges,
 * guard, damage, reaction, KO, and the feedback that sells the weight
 * (hitstop, flash, shake, sparks, sound).
 */
import { Vector3 } from 'three';
import type { ICharacter, SfxId } from '../core/types';
import type { CombatHub } from './hub';
import { fighterOf, type Fighter } from './Fighter';
import { isHittable, strikeScore } from './hitTest';
import type { MoveDef } from './moves';
import {
  applyBackHit, clampBossHp, computeDamage, dodgeOutcome, isFrontal, reactionForHit, resolveReaction, splitDamage,
  type ReactionResult,
} from './rules';
import { HEAT, HITSTOP, PERFECT_DODGE_SLOWMO, POISE_RESET } from './tables';
import type { ImpactKind } from './vfx/ImpactVfx';
import { WEAPONS } from './weapons/weaponData';

export interface HitOptions {
  /** Ignore the boss's phase floors (the finisher). */
  lethal?: boolean;
  /** Override the damage entirely (heat action scripts). */
  damage?: number;
  /** Force this reaction instead of resolving one (heat action scripts). */
  reaction?: ReactionResult;
  /** Extra damage multiplier (weapon kind). */
  mul?: number;
  /** Impact sound instead of the move's. */
  sfx?: SfxId;
}

const HEAVY_REACTIONS: ReadonlySet<ReactionResult> = new Set<ReactionResult>(['hitHeavy', 'stagger', 'knockback', 'knockdown', 'launch', 'guardBreak']);
const FLOORED: ReadonlySet<ReactionResult> = new Set<ReactionResult>(['knockdown', 'launch']);
const HIT_HEIGHT = 1.25;
const NO_OPTS: HitOptions = {};
/** Reused per strike: weapon swings are the only per-hit options that vary. */
const weaponOpts: { mul: number; sfx: SfxId } = { mul: 1, sfx: 'chair_hit' };

const at = new Vector3();

export class HitResolver {
  constructor(private readonly hub: CombatHub) {}

  /** The active frame of `f`'s move: find who it reaches and hit them. */
  strike(f: Fighter, m: MoveDef, index: number, count: number): void {
    const a = f.c;
    if (m.projectile) {
      this.hub.weapons.launch(a, f.focus);
      return;
    }
    const o = this.weaponOptions(a, m);
    const landed = !f.isPlayer ? this.strikePlayer(a, m, index, count, o)
      : m.multi ? this.strikeAll(a, m, index, count, o)
        : this.strikeBest(a, m, index, count, o);
    if (landed && m.wear > 0) this.hub.weapons.wear(a, m.wear);
  }

  private strikePlayer(a: ICharacter, m: MoveDef, index: number, count: number, o: HitOptions): boolean {
    const p = this.hub.ctx.entities.player;
    return this.reach(a, p, m) < Infinity && this.applyHit(a, p, m, index, count, o);
  }

  private strikeAll(a: ICharacter, m: MoveDef, index: number, count: number, o: HitOptions): boolean {
    let landed = false;
    for (const e of this.hub.director.activeEnemies) {
      if (this.reach(a, e, m) < Infinity) landed = this.applyHit(a, e, m, index, count, o) || landed;
    }
    return landed;
  }

  private strikeBest(a: ICharacter, m: MoveDef, index: number, count: number, o: HitOptions): boolean {
    let best: ICharacter | null = null;
    let bestScore = Infinity;
    for (const e of this.hub.director.activeEnemies) {
      const score = this.reach(a, e, m);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best !== null && this.applyHit(a, best, m, index, count, o);
  }

  /** A swing with a held weapon hits as hard and sounds like what's in the hand. */
  private weaponOptions(a: ICharacter, m: MoveDef): HitOptions {
    const w = m.kind === 'weapon' ? a.heldWeapon : null;
    if (!w) return NO_OPTS;
    const spec = WEAPONS[w.weaponKind];
    weaponOpts.mul = spec.damageMul;
    weaponOpts.sfx = spec.hitSfx;
    return weaponOpts;
  }

  private reach(a: ICharacter, t: ICharacter, m: MoveDef): number {
    if (!t.isAlive() || !isHittable(t.combatState, m.hitsDowned)) return Infinity;
    return strikeScore(a.position, a.facing, t.position, t.radius, m.reach, m.arc);
  }

  /** Resolve one connecting hit. Returns false if it was dodged or ignored. */
  applyHit(a: ICharacter, t: ICharacter, m: MoveDef, index: number, count: number, o: HitOptions = NO_OPTS): boolean {
    const tf = fighterOf(t);
    if (!t.isAlive() || t.invulnerable) return false;
    if (t.combatState === 'dodging' && this.dodged(tf)) return false;
    const wasDown = t.combatState === 'downed';
    const frontal = isFrontal(t.position, t.facing, a.position);
    const guarding = t.combatState === 'guarding';
    const base = o.damage ?? splitDamage(m.damage, index, count) * (o.mul ?? 1);
    const raw = o.damage ?? computeDamage(base, a.stats.power, t.stats.defense, guarding && frontal);
    const damage = tf.isPlayer && this.hub.ctx.debug.god ? 0 : raw;
    const result = o.reaction ?? this.reaction(a, t, tf, m, index, count, damage, frontal, guarding);
    this.dealDamage(t, tf, damage, o.lethal === true);
    const blocked = result === 'block' || result === 'guardBreak';
    this.feedback(a, t, m.kind, result, damage, o.sfx ?? m.sfx);
    this.hub.ctx.events.emit('combat:hit', {
      attackerId: a.id, targetId: t.id, damage, position: at.clone(), kind: m.kind, blocked, knockdown: FLOORED.has(result),
    });
    this.heatFor(a, t, m, blocked, damage);
    if (!t.isAlive()) this.knockOut(tf, a, wasDown);
    else this.hub.motor.react(tf, result, a, m);
    this.hub.boss.afterHit(tf);
    return true;
  }

  /** A blow in a heat action: fixed damage, no stats or guard, no reaction (the script animates the victim). */
  scriptedHit(a: ICharacter, t: ICharacter, damage: number, lethal: boolean, sfx: SfxId, big: boolean): void {
    const tf = fighterOf(t);
    const dealt = tf.isPlayer && this.hub.ctx.debug.god ? 0 : damage;
    const result: ReactionResult = big ? 'knockdown' : 'hitHeavy';
    this.dealDamage(t, tf, dealt, lethal);
    this.feedback(a, t, 'heat', result, dealt, sfx);
    this.hub.ctx.events.emit('combat:hit', {
      attackerId: a.id, targetId: t.id, damage: dealt, position: at.clone(), kind: 'heat', blocked: false, knockdown: big,
    });
  }

  private reaction(
    a: ICharacter, t: ICharacter, tf: Fighter, m: MoveDef, index: number, count: number,
    damage: number, frontal: boolean, guarding: boolean,
  ): ReactionResult {
    // A victim held by the attacker only flinches in place (the grab owns its motion).
    if (t.combatState === 'grabbed' && this.hub.grabs.isHolding(a, t)) return 'none';
    tf.poiseAccum += damage;
    tf.poiseTimer = POISE_RESET;
    const r = resolveReaction({
      reaction: reactionForHit(m, index, count), kind: m.kind, guarded: guarding, frontal,
      guardBreak: m.guardBreak, isBoss: t.role === 'boss', hyperArmor: t.hyperArmor,
      poise: t.stats.poise, poiseAccum: tf.poiseAccum,
    });
    if (r.poiseBroken) tf.poiseAccum = 0;
    return applyBackHit(r.result, !frontal);
  }

  private dealDamage(t: ICharacter, tf: Fighter, damage: number, lethal: boolean): void {
    const boss = tf.phase > 0;
    t.hp = boss && !lethal ? clampBossHp(t.hp, damage, t.maxHp, tf.phase) : Math.max(0, t.hp - damage);
    if (boss) this.hub.ctx.events.emit('boss:hp', { bossId: t.id, hp: t.hp, maxHp: t.maxHp });
  }

  /** Inside the i-frames: no hit. Early in them: a perfect dodge, once per dodge. */
  private dodged(tf: Fighter): boolean {
    const o = dodgeOutcome(tf.t);
    if (o === 'hit') return false;
    if (o === 'perfect' && tf.isPlayer && !tf.perfectDodged) {
      tf.perfectDodged = true;
      this.hub.timeFx.slowmo(PERFECT_DODGE_SLOWMO.scale, PERFECT_DODGE_SLOWMO.dur);
      this.hub.gauge.add(HEAT.perfectDodge);
      this.hub.ctx.audio.playSfx('slowmo_in', { volume: 0.7 });
    }
    return true;
  }

  private heatFor(a: ICharacter, t: ICharacter, m: MoveDef, blocked: boolean, damage: number): void {
    const player = this.hub.ctx.entities.player;
    if (a === player && !blocked) this.hub.gauge.add(m.heat);
    if (t === player && !blocked && damage > 0) this.hub.gauge.add(HEAT.takeHit);
  }

  /** Out cold: the KO, its sound and 'combat:ko' (and game over, for the player). */
  knockOut(tf: Fighter, by: ICharacter, lying = false): void {
    this.hub.motor.ko(tf, by, lying);
    this.hub.ctx.audio.playSfx('ko', { position: tf.c.position });
    this.hub.ctx.events.emit('combat:ko', { characterId: tf.c.id, byId: by.id });
    if (tf.isPlayer) this.hub.playerDown();
  }

  private feedback(
    a: ICharacter, t: ICharacter, hitKind: MoveDef['kind'], result: ReactionResult, damage: number, sfx: SfxId,
  ): void {
    const { ctx, vfx } = this.hub;
    const player = ctx.entities.player;
    const blocked = result === 'block';
    const heavy = HEAVY_REACTIONS.has(result) || hitKind !== 'light';
    const kind: ImpactKind = blocked ? 'blocked' : FLOORED.has(result) && hitKind === 'heat' ? 'big' : heavy ? 'heavy' : 'light';
    const d = Math.max(1e-3, Math.hypot(a.position.x - t.position.x, a.position.z - t.position.z));
    at.set(
      t.position.x + ((a.position.x - t.position.x) / d) * t.radius,
      t.position.y + Math.min(HIT_HEIGHT, t.height * 0.7),
      t.position.z + ((a.position.z - t.position.z) / d) * t.radius,
    );
    vfx.impact(at, kind);
    ctx.audio.playSfx(blocked ? 'block' : sfx, { position: at, pitch: 0.92 + Math.random() * 0.16 });
    if (!blocked) t.rig.flash(t === player ? 0xff4040 : 0xffffff, 0.08);
    if (a !== player && t !== player) return;
    this.hub.timeFx.hitstop(blocked ? HITSTOP.blocked : heavy ? HITSTOP.heavy : HITSTOP.light);
    if (t === player && damage > 0) {
      ctx.cameraRig.shake(heavy ? 0.45 : 0.25, heavy ? 0.3 : 0.18);
      this.hub.renderFx.pulse('damage', Math.min(1, 0.35 + damage / 40));
      return;
    }
    if (heavy && !blocked) {
      ctx.cameraRig.shake(FLOORED.has(result) ? 0.35 : 0.2, 0.2);
      ctx.cameraRig.punch(-3, 0.18);
    }
  }
}
