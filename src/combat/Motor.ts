/**
 * The combat state machine of a character: attacks (telegraph, lunge, hit
 * timing, combo buffer), hit reactions, knockdowns, dodges and guard.
 * While a character can't move, this is the only code driving its velocity,
 * facing and animation (see MOTION OWNERSHIP in core/types).
 */
import { Vector3 } from 'three';
import { clamp } from '../core/math';
import type { AnimClip, AnimClipDef, CombatState, ICharacter } from '../core/types';
import type { CombatHub } from './hub';
import { KO_DOWN } from './clips';
import { canAct, setState, slide, type AttackInput, type Fighter } from './Fighter';
import { isHittable } from './hitTest';
import { MOVES, continuesChain, selectPlayerMove, type MoveDef, type MoveId } from './moves';
import { dodgeClipFor, type ReactionResult } from './rules';
import { BLOCK_STUN, BREAKOUT, CHAIN_GRACE, DODGE, DOWNED_TIME, GETUP_TIME, SPRINT_SPEED_MIN, STAGGER_TIME } from './tables';

/** A telegraphed move plays its extra windup over this share of the time before the first hit. */
const WINDUP_SHARE = 0.6;
/** Tracking while winding up, rad/s. */
const ATTACK_TURN = 10;
/** Instant snap towards the target when an attack starts (auto-aim), radians. */
const ATTACK_SNAP = 1.0;
/** Stop lunging once this deep inside the move's reach. */
const LUNGE_STOP = 0.8;
/** The player's auto-approach may go this fast to make a strike land (Yakuza's generous homing). */
const PLAYER_LUNGE_MAX = 6;
/** An attack without a target still steps forward a little. */
const FREE_STEP = 0.4;
/** An enemy string only continues if the target is still about this close. */
const PATTERN_SLACK = 1.0;
const DODGE_TIME = 0.45;
const LAUNCH_UP = 4.5;
const KO_SLIDE = { dist: 1.0, dur: 0.5 } as const;
const BLOCK_SLIDE = { dist: 0.25, dur: 0.2 } as const;

interface ReactionSpec {
  state: CombatState;
  clip: AnimClip;
  dur: number;
  slide: number;
  slideDur: number;
  /** Uses the move's knockback distance when that is bigger. */
  carry: boolean;
}

const REACTIONS: Readonly<Record<Exclude<ReactionResult, 'none' | 'block'>, ReactionSpec>> = {
  guardBreak: { state: 'staggered', clip: 'stagger', dur: STAGGER_TIME, slide: 0.5, slideDur: 0.3, carry: false },
  hitLight: { state: 'hitstun', clip: 'hitLight', dur: 0.45, slide: 0.15, slideDur: 0.15, carry: false },
  hitHeavy: { state: 'hitstun', clip: 'hitHeavy', dur: 0.55, slide: 0.4, slideDur: 0.25, carry: false },
  hitBack: { state: 'hitstun', clip: 'hitBack', dur: 0.5, slide: 0.35, slideDur: 0.25, carry: false },
  stagger: { state: 'staggered', clip: 'stagger', dur: STAGGER_TIME, slide: 0.35, slideDur: 0.3, carry: false },
  knockback: { state: 'hitstun', clip: 'hitHeavy', dur: 0.55, slide: 1.2, slideDur: 0.45, carry: true },
  knockdown: { state: 'knockdown', clip: 'knockdown', dur: 0.8, slide: 0.8, slideDur: 0.5, carry: true },
  launch: { state: 'airborne', clip: 'knockdown', dur: 0.8, slide: 0.6, slideDur: 0.6, carry: true },
};

/** States whose velocity the motor drives every frame. Grabs drive their own; in a heat action it only runs the slides. */
const MOTOR_OWNED: ReadonlySet<CombatState> = new Set<CombatState>([
  'attacking', 'guarding', 'dodging', 'hitstun', 'staggered', 'airborne', 'knockdown', 'downed', 'gettingUp', 'ko',
  'heatLocked',
]);

type Expire = (m: Motor, f: Fighter) => void;
const ON_EXPIRE: Partial<Record<CombatState, Expire>> = {
  hitstun: (m, f) => m.toIdle(f),
  staggered: (m, f) => m.toIdle(f),
  dodging: (m, f) => m.toIdle(f),
  gettingUp: (m, f) => m.toIdle(f),
  knockdown: (m, f) => m.lieDown(f),
  airborne: (m, f) => m.lieDown(f),
  downed: (m, f) => m.getUp(f),
};

/** Reactions that leave the victim on its feet within reach: the ones a breakout counts. */
const FLINCHES: ReadonlySet<ReactionResult> = new Set<ReactionResult>(['hitLight', 'hitHeavy', 'hitBack', 'stagger']);

const ZERO = new Vector3();
const vel = new Vector3();
const hitTimesCache = new Map<MoveId, readonly number[]>();

function hitTimesOf(m: MoveDef, def: AnimClipDef): readonly number[] {
  let t = hitTimesCache.get(m.id);
  if (!t) {
    t = m.hits ?? [def.impactAt ?? 0.5];
    hitTimesCache.set(m.id, t);
  }
  return t;
}

export class Motor {
  constructor(private readonly hub: CombatHub) {}

  update(f: Fighter, dt: number): void {
    f.t += dt;
    f.sinceHurt += dt;
    f.c.stateTime = f.t;
    if (f.poiseTimer > 0) {
      f.poiseTimer -= dt;
      if (f.poiseTimer <= 0) f.poiseAccum = 0;
    }
    const s = f.c.combatState;
    let lunge = 0;
    if (s === 'attacking') lunge = this.tickAttack(f, dt);
    else if (s === 'guarding') this.tickGuard(f, dt);
    else if (s === 'idle' || s === 'moving') this.tickFree(f, dt);
    else if (f.t >= f.stateDur) ON_EXPIRE[s]?.(this, f);
    if (MOTOR_OWNED.has(f.c.combatState)) this.drive(f, dt, lunge);
  }

  // -------------------------------------------------------------------------
  // Attacks

  /** A light/heavy press from the player; buffered during the end of an attack. */
  playerAttack(f: Fighter, input: AttackInput): boolean {
    if (f.c.combatState === 'attacking') return this.buffer(f, input);
    if (f.c.combatState === 'grabbing') return this.hub.grabs.playerInput(f, input);
    if (!canAct(f.c) && f.c.combatState !== 'guarding') return false;
    const focus = this.hub.lock.attackFocus(f.c);
    const dv = f.c.desiredVelocity;
    const id = selectPlayerMove(input, {
      grabbing: false,
      grabPunches: 0,
      weapon: f.c.heldWeapon !== null,
      weaponSwings: f.weaponSwings,
      targetDowned: focus !== null && focus.combatState === 'downed',
      sprinting: Math.hypot(dv.x, dv.z) >= SPRINT_SPEED_MIN,
      chain: f.chain,
    });
    f.chain = continuesChain(id) ? f.chain + 1 : 0;
    if (f.c.heldWeapon) f.weaponSwings++;
    this.startAttack(f, MOVES[id], focus);
    return true;
  }

  /** An enemy commits to a string of moves against `target`. */
  enemyAttack(f: Fighter, pattern: readonly MoveId[], target: ICharacter): void {
    f.pattern = pattern;
    f.patternIndex = 0;
    this.startAttack(f, MOVES[pattern[0]], target);
  }

  startAttack(f: Fighter, m: MoveDef, focus: ICharacter | null): void {
    const def = f.c.rig.getClipDef(m.clip);
    f.move = m;
    f.focus = focus;
    f.norm = 0;
    f.hitIndex = 0;
    f.queued = null;
    f.hitTimes = hitTimesOf(m, def);
    f.clipDur = def.duration;
    f.windupTo = m.telegraph > 0 ? WINDUP_SHARE * f.hitTimes[0] : 0;
    // The windup covers norm 0..w at the stretched duration, adding exactly `telegraph` seconds.
    f.curDur = f.windupTo > 0 ? def.duration + m.telegraph / f.windupTo : def.duration;
    f.slideDur = 0;
    f.attackSerial++;
    setState(f, 'attacking');
    f.c.hyperArmor = m.hyperArmor || f.armored;
    f.c.rig.play(def, { duration: f.curDur, restart: true });
    if (focus) f.c.faceTowards(focus.position, ATTACK_SNAP);
    if (f.windupTo === 0) this.whoosh(f, m);
  }

  /** One press anywhere in the attack queues the next; a hit (interrupt) clears it. */
  private buffer(f: Fighter, input: AttackInput): boolean {
    if (!f.move || f.queued) return false;
    f.queued = input;
    return true;
  }

  /** Advances the current move; returns the lunge speed for this frame. */
  private tickAttack(f: Fighter, dt: number): number {
    const m = f.move;
    if (!m) {
      this.toIdle(f);
      return 0;
    }
    f.norm += dt / f.curDur;
    if (f.windupTo > 0 && f.norm >= f.windupTo) this.endWindup(f, m);
    const lunge = f.hitIndex < f.hitTimes.length ? this.approach(f, m, dt) : 0;
    while (f.hitIndex < f.hitTimes.length && f.norm >= f.hitTimes[f.hitIndex]) {
      const index = f.hitIndex++;
      this.hub.hits.strike(f, m, index, f.hitTimes.length);
      if (f.c.combatState !== 'attacking' || f.move !== m) return 0;
    }
    if (f.norm >= 1) this.finishAttack(f);
    return lunge;
  }

  private endWindup(f: Fighter, m: MoveDef): void {
    f.windupTo = 0;
    f.curDur = f.clipDur;
    // Same def object + restart:false: the animator only rescales, the pose keeps going.
    f.c.rig.play(f.c.rig.getClipDef(m.clip), { duration: f.clipDur, restart: false });
    this.whoosh(f, m);
  }

  /** Track the target and close the distance until the strike lands. */
  private approach(f: Fighter, m: MoveDef, dt: number): number {
    const t = f.focus;
    if (!t || !t.isAlive()) return m.lunge * FREE_STEP;
    f.c.faceTowards(t.position, ATTACK_TURN * dt);
    if (m.lunge === 0) return 0;
    const gap = Math.hypot(t.position.x - f.c.position.x, t.position.z - f.c.position.z) - t.radius;
    const short = gap - m.reach * LUNGE_STOP;
    if (short <= 0) return 0;
    if (!f.isPlayer) return m.lunge;
    // Enemies lunge at a fixed pace so backing off is a real defence; the player homes in on time.
    const untilHit = Math.max((f.hitTimes[f.hitIndex] - f.norm) * f.curDur, dt);
    return clamp(short / untilHit, m.lunge, PLAYER_LUNGE_MAX);
  }

  private finishAttack(f: Fighter): void {
    f.move = null;
    f.c.hyperArmor = false;
    if (f.isPlayer) {
      const q = f.queued;
      this.toIdle(f);
      f.chainTimer = CHAIN_GRACE;
      if (q) this.playerAttack(f, q);
      return;
    }
    if (this.continuePattern(f)) return;
    this.hub.tokens.release(f.c.id);
    this.toIdle(f);
  }

  private continuePattern(f: Fighter): boolean {
    const p = f.pattern;
    const t = f.focus;
    if (!p || !t || f.patternIndex + 1 >= p.length || !isHittable(t.combatState, false)) return false;
    const next = MOVES[p[f.patternIndex + 1]];
    const gap = Math.hypot(t.position.x - f.c.position.x, t.position.z - f.c.position.z) - t.radius;
    if (gap > next.reach + PATTERN_SLACK) return false;
    f.patternIndex++;
    this.startAttack(f, next, t);
    return true;
  }

  private whoosh(f: Fighter, m: MoveDef): void {
    if (m.whoosh) this.hub.ctx.audio.playSfx(m.whoosh, { position: f.c.position, volume: 0.55 });
  }

  // -------------------------------------------------------------------------
  // Defence

  guardStart(f: Fighter): boolean {
    f.guardHeld = true;
    if (canAct(f.c)) this.enterGuard(f, Infinity);
    return true;
  }

  guardEnd(f: Fighter): boolean {
    f.guardHeld = false;
    return true;
  }

  /** Enemies raise the guard for a fixed time. */
  enemyGuard(f: Fighter, dur: number): void {
    f.guardHeld = true;
    this.enterGuard(f, dur);
  }

  private enterGuard(f: Fighter, dur: number): void {
    setState(f, 'guarding', dur);
    f.blockStun = 0;
    f.c.rig.play('guard', { loop: true });
  }

  private tickGuard(f: Fighter, dt: number): void {
    if (f.blockStun > 0) {
      f.blockStun -= dt;
      if (f.blockStun <= 0) f.c.rig.play('guard', { loop: true });
      return;
    }
    if (!f.isPlayer && f.t >= f.stateDur) f.guardHeld = false;
    if (!f.guardHeld) this.toIdle(f);
    else this.faceFoe(f, dt);
  }

  private faceFoe(f: Fighter, dt: number): void {
    const t = f.isPlayer ? this.hub.lock.target : this.hub.ctx.entities.player;
    if (t) f.c.faceTowards(t.position, ATTACK_TURN * dt);
  }

  dodge(f: Fighter): boolean {
    const s = f.c.combatState;
    const recovering = s === 'attacking' && f.hitIndex >= f.hitTimes.length;
    if (!canAct(f.c) && s !== 'guarding' && !recovering) return false;
    const dv = f.c.desiredVelocity;
    const moving = dv.x * dv.x + dv.z * dv.z > 0.01;
    const dx = moving ? dv.x : -Math.sin(f.c.facing);
    const dz = moving ? dv.z : -Math.cos(f.c.facing);
    this.interrupt(f);
    f.perfectDodged = false;
    setState(f, 'dodging', DODGE_TIME);
    f.c.rig.play(dodgeClipFor(f.c.facing, moving ? dv.x : 0, moving ? dv.z : 0), { restart: true });
    slide(f, dx, dz, DODGE.distance, DODGE.slideDur);
    this.hub.ctx.audio.playSfx('dodge', { position: f.c.position, volume: 0.6 });
    return true;
  }

  // -------------------------------------------------------------------------
  // Reactions

  react(f: Fighter, result: ReactionResult, from: ICharacter, m: MoveDef): void {
    if (result === 'none') return;
    if (result === 'block') {
      this.blocked(f, from);
      return;
    }
    if (this.breaksOut(f, result, from)) return;
    this.interrupt(f);
    f.hitSerial++;
    f.sinceHurt = 0;
    const spec = REACTIONS[result];
    setState(f, spec.state, spec.dur);
    // Hit from behind: stumble forward without turning round.
    if (result !== 'hitBack') f.c.faceTowards(from.position);
    // The clip spans the whole stun so a chain's next hit lands before the victim recovers.
    f.c.rig.play(spec.clip, { restart: true, duration: spec.dur });
    const dist = spec.carry ? Math.max(spec.slide, m.knockback) : spec.slide;
    slide(f, f.c.position.x - from.position.x, f.c.position.z - from.position.z, dist, spec.slideDur);
    if (result === 'launch') f.c.addImpulse(vel.set(0, LAUNCH_UP, 0));
  }

  /** The Nth flinch in a row: a thug takes it on hyper armour and shoves the attacker off instead. */
  private breaksOut(f: Fighter, result: ReactionResult, from: ICharacter): boolean {
    const flinch = FLINCHES.has(result);
    f.combo = !flinch ? 0 : f.sinceHurt <= BREAKOUT.gap ? f.combo + 1 : 1;
    if (!flinch || f.isPlayer || f.c.role === 'boss' || f.combo < BREAKOUT.flinches) return false;
    f.combo = 0;
    f.hitSerial++;
    f.sinceHurt = 0;
    this.interrupt(f);
    this.startAttack(f, MOVES.g_shove, from);
    return true;
  }

  private blocked(f: Fighter, from: ICharacter): void {
    f.blockStun = BLOCK_STUN;
    f.c.faceTowards(from.position);
    f.c.rig.play('guardHit', { restart: true });
    slide(f, f.c.position.x - from.position.x, f.c.position.z - from.position.z, BLOCK_SLIDE.dist, BLOCK_SLIDE.dur);
  }

  /** Out cold. `lying`: already on the floor, so go limp there instead of standing up to fall again. */
  ko(f: Fighter, from: ICharacter | null, lying = false): void {
    this.interrupt(f);
    f.guardHeld = false;
    setState(f, 'ko');
    f.c.rig.play(lying ? KO_DOWN : 'ko', { restart: true });
    if (!from || lying) return;
    f.c.faceTowards(from.position);
    slide(f, f.c.position.x - from.position.x, f.c.position.z - from.position.z, KO_SLIDE.dist, KO_SLIDE.dur);
  }

  /** Put a character on the floor (after a knockdown, a throw or a heat action). */
  lieDown(f: Fighter): void {
    setState(f, 'downed', f.isPlayer ? DOWNED_TIME.player : DOWNED_TIME.enemy);
    f.c.rig.play('downed', { loop: true });
  }

  getUp(f: Fighter): void {
    setState(f, 'gettingUp', GETUP_TIME);
    f.c.invulnerable = true;
    f.c.rig.play('getUp', { restart: true });
  }

  toIdle(f: Fighter): void {
    f.move = null;
    f.windupTo = 0;
    f.slideDur = 0;
    f.c.hyperArmor = false;
    f.c.invulnerable = false;
    setState(f, 'idle');
    f.c.setDesiredVelocity(ZERO);
  }

  /** Drop whatever the character was doing (it got hit, grabbed, knocked out...). */
  interrupt(f: Fighter): void {
    if (!f.isPlayer) this.hub.tokens.release(f.c.id);
    if (f.isPlayer) f.chain = 0;
    this.hub.grabs.release(f);
    f.move = null;
    f.pattern = null;
    f.queued = null;
    f.windupTo = 0;
    f.blockStun = 0;
    f.c.hyperArmor = false;
    f.c.invulnerable = false;
  }

  /** Back to a clean standing state (load, new game, leaving game over). */
  reset(f: Fighter): void {
    this.interrupt(f);
    f.guardHeld = false;
    f.poiseAccum = 0;
    f.chainTimer = 0;
    f.weaponSwings = 0;
    if (f.c.isAlive()) this.toIdle(f);
  }

  // -------------------------------------------------------------------------

  private tickFree(f: Fighter, dt: number): void {
    if (f.chainTimer > 0) {
      f.chainTimer -= dt;
      if (f.chainTimer <= 0) f.chain = 0;
    }
    if (f.isPlayer && f.guardHeld && this.hub.director.fighting) this.enterGuard(f, Infinity);
  }

  /** Motor-owned velocity: the decaying slide plus the attack lunge along facing. */
  private drive(f: Fighter, dt: number, lunge: number): void {
    let vx = Math.sin(f.c.facing) * lunge;
    let vz = Math.cos(f.c.facing) * lunge;
    if (f.slideDur > 0) {
      const k = Math.max(0, 1 - f.slideT / f.slideDur);
      vx += f.slideVx * k;
      vz += f.slideVz * k;
      f.slideT += dt;
      if (f.slideT >= f.slideDur) f.slideDur = 0;
    }
    f.c.setDesiredVelocity(vel.set(vx, 0, vz));
  }
}
