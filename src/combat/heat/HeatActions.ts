/**
 * Heat actions: which one is on offer (the HUD's prompt) and performing it.
 * A performance puts the game in 'heatAction', locks both bodies, plays a
 * script from heatTable.ts against a camera sequence built around the pair,
 * and freezes time for a beat on every big blow. The boss finisher stops
 * halfway for a button prompt that the UI runs.
 */
import { Vector3 } from 'three';
import { wrapAngle, yawTo } from '../../core/math';
import { CG } from '../../core/types';
import type { AnimClip, CameraShot, CombatState, ICharacter, IWeaponProp, InputAction } from '../../core/types';
import type { CombatHub } from '../hub';
import { fighterOf, setState, slide, type Fighter } from '../Fighter';
import {
  selectHeatAction, type HeatActionDef, type HeatCue, type HeatQte, type HeatQuery, type HeatReaction, type HeatShot,
  type HitCue, type V3,
} from '../heatTable';

/** How close, and how square-on, the victim has to be. */
const REACH = 2.2;
const HALF_ARC = (75 * Math.PI) / 180;
/** Space left between the two bodies once the player steps in. */
const SPACING = 0.25;
/** A wall this close behind the victim's back is there to be used. */
const WALL_REACH = 1.4;
/** The wall probe is a raycast; ten a second is plenty for a prompt. */
const WALL_EVERY = 0.1;
const CHEST = 1.0;
/** Every big blow: a near-freeze, then time eases back. */
const BIG_BEAT = { scale: 0.05, realSec: 0.12 } as const;
const KNOCK_SLIDE = 1.2;
const SLIDE_DUR = 0.5;
const WALL_SLIDE_DUR = 0.12;
/** A camera spot with a wall in front of it stops this far short of the wall... */
const LENS_PAD = 0.3;
/** ...but never closer than this to what it films. */
const LENS_MIN = 0.6;
/** Bystanders this close to a camera spot are hidden for the action. */
const LENS_CLEAR = 1.2;
/** What the player can be doing when F cuts in. */
const READY: ReadonlySet<CombatState> = new Set<CombatState>(['idle', 'moving', 'attacking', 'guarding', 'grabbing']);
const REACTION_CLIP: Readonly<Record<Exclude<HeatReaction, 'keep'>, AnimClip>> = {
  hitHeavy: 'hitHeavy', stagger: 'stagger', knockdown: 'knockdown', downed: 'downed',
};

interface Run {
  readonly def: HeatActionDef;
  readonly player: Fighter;
  readonly target: Fighter;
  /** The script being played: the action's own, or the finisher's miss. */
  cues: readonly HeatCue[];
  next: number;
  t: number;
  duration: number;
  /** The finisher's prompt is up and the script holds. */
  waiting: boolean;
  qteDone: boolean;
  /** Who is on the floor after the last blow decides how each body is handed back. */
  playerLying: boolean;
  targetLying: boolean;
  /** Metres between the victim's back and the wall behind it. */
  readonly wallGap: number;
  /** The traffic cone jammed on the victim's head. */
  crown: IWeaponProp | null;
  /** Bystanders hidden because they stood by the lens. */
  readonly hidden: ICharacter[];
  /** The action frame: ground midpoint of the pair, the player's facing and right. */
  readonly mid: Vector3;
  readonly fwd: Vector3;
  readonly right: Vector3;
}

const dir = new Vector3();
const origin = new Vector3();
const foot = new Vector3();
const wallAt = new Vector3();
/** Asked every frame near a foe, so it's filled in place rather than rebuilt. */
const query: { -readonly [K in keyof HeatQuery]: HeatQuery[K] } = {
  heat: 0, finisher: false, isBoss: false, targetState: 'idle', grabbing: false, weapon: null, wallBehind: false,
};

export class HeatActions {
  /** The finisher's button prompt is up: the UI owns the buttons. */
  qtePending = false;
  private run: Run | null = null;
  private offer: HeatActionDef | null = null;
  private offerTarget: ICharacter | null = null;
  private wallTarget: ICharacter | null = null;
  private wallTimer = 0;
  private wall = false;

  constructor(private readonly hub: CombatHub) {}

  get running(): boolean {
    return this.run !== null;
  }

  /** What F would do right now. */
  get available(): HeatActionDef | null {
    return this.offer;
  }

  /** F pressed: perform whatever is on offer. */
  tryStart(pf: Fighter): boolean {
    this.refreshOffer(0);
    const def = this.offer;
    const t = this.offerTarget;
    if (!def || !t) return false;
    if (!this.hub.ctx.state.transition('heatAction', { actionId: def.id, targetId: t.id })) return false;
    this.begin(def, pf, fighterOf(t));
    return true;
  }

  update(dt: number): void {
    const r = this.run;
    if (!r) this.refreshOffer(dt);
    else if (!this.present(r.target.c)) this.finish(r);
    else if (!r.waiting) this.advance(r, dt);
  }

  /** Game over, load, new game: drop the performance where it stands. */
  abort(): void {
    const r = this.run;
    this.run = null;
    this.qtePending = false;
    this.offer = null;
    this.offerTarget = null;
    if (!r) return;
    if (r.crown) this.hub.weapons.smash(r.crown);
    this.unhide(r);
    this.hub.timeFx.suppressed = false;
    this.hub.ctx.cameraRig.stopSequence();
  }

  // -------------------------------------------------------------------------
  // The offer

  private refreshOffer(dt: number): void {
    this.offer = null;
    this.offerTarget = null;
    const { ctx, director } = this.hub;
    const p = ctx.entities.player;
    if (this.run || !director.fighting || !ctx.state.is('combat') || !p.isAlive() || !READY.has(p.combatState)) return;
    const pf = fighterOf(p);
    const t = pf.grabbing ?? this.pick(p);
    if (!t) return;
    query.heat = this.hub.gauge.value;
    query.finisher = fighterOf(t).kneeling;
    query.isBoss = t.role === 'boss';
    query.targetState = t.combatState;
    query.grabbing = pf.grabbing === t;
    query.weapon = p.heldWeapon?.weaponKind ?? null;
    query.wallBehind = this.wallBehind(p, t, dt);
    this.offer = selectHeatAction(query);
    this.offerTarget = this.offer ? t : null;
  }

  /** The lock target if it's in reach, else the nearest foe in front. */
  private pick(p: ICharacter): ICharacter | null {
    const lock = this.hub.lock.target;
    if (lock && this.inReach(p, lock)) return lock;
    let best: ICharacter | null = null;
    let bestD = Infinity;
    for (const e of this.hub.director.activeEnemies) {
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
      if (d >= bestD || !this.inReach(p, e)) continue;
      bestD = d;
      best = e;
    }
    return best;
  }

  private inReach(p: ICharacter, e: ICharacter): boolean {
    const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
    return e.isAlive() && d <= REACH && Math.abs(wrapAngle(yawTo(p.position, e.position) - p.facing)) <= HALF_ARC;
  }

  private wallBehind(p: ICharacter, t: ICharacter, dt: number): boolean {
    this.wallTimer -= dt;
    if (t === this.wallTarget && this.wallTimer > 0) return this.wall;
    this.wallTarget = t;
    this.wallTimer = WALL_EVERY;
    this.wall = this.wallGap(p, t) < WALL_REACH;
    return this.wall;
  }

  /** Metres from `t`'s back to the wall behind it, seen from `from`. The arena ring doesn't count. */
  private wallGap(from: ICharacter, t: ICharacter): number {
    dir.set(t.position.x - from.position.x, 0, t.position.z - from.position.z);
    if (dir.lengthSq() < 1e-6) dir.set(Math.sin(from.facing), 0, Math.cos(from.facing));
    dir.normalize();
    origin.set(t.position.x, t.position.y + CHEST, t.position.z);
    const hit = this.hub.ctx.physics.raycast(origin, dir, t.radius + WALL_REACH, CG.STATIC);
    return hit ? Math.max(0, hit.distance - t.radius) : Infinity;
  }

  // -------------------------------------------------------------------------
  // The performance

  private begin(def: HeatActionDef, pf: Fighter, tf: Fighter): void {
    const { ctx, motor } = this.hub;
    const p = pf.c;
    const t = tf.c;
    const wasDown = t.combatState === 'downed';
    const wallGap = this.wallGap(p, t);
    motor.interrupt(pf);
    motor.interrupt(tf);
    setState(pf, 'heatLocked');
    setState(tf, 'heatLocked');
    pf.slideDur = 0;
    tf.slideDur = 0;
    this.hub.gauge.add(-def.cost);
    // The player steps in; the victim keeps its spot (and the wall behind it).
    p.faceTowards(t.position);
    const fwd = new Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
    foot.copy(t.position).addScaledVector(fwd, -(p.radius + t.radius + SPACING));
    foot.y = p.position.y;
    p.teleport(foot, p.facing);
    t.faceTowards(p.position);
    const r: Run = {
      def, player: pf, target: tf, cues: def.cues, next: 0, t: 0, duration: def.duration,
      waiting: false, qteDone: false, playerLying: false, targetLying: wasDown, wallGap, crown: null, hidden: [],
      mid: new Vector3().addVectors(p.position, t.position).multiplyScalar(0.5).setY(p.position.y),
      fwd,
      right: new Vector3(-fwd.z, 0, fwd.x),
    };
    this.run = r;
    this.offer = null;
    this.offerTarget = null;
    this.hub.timeFx.suppressed = true;
    this.pickSide(r, def.shots);
    void ctx.cameraRig.playSequence(this.shots(r, def.shots));
    ctx.ui.showHeatActionName(def.nameZh, def.nameEn);
    ctx.audio.playSfx('heat_action');
    ctx.events.emit('heat:action', { actionId: def.id, nameZh: def.nameZh, nameEn: def.nameEn, targetId: t.id });
  }

  private advance(r: Run, dt: number): void {
    const q = r.qteDone ? undefined : r.def.qte;
    // The finisher holds at its prompt until the player answers it.
    r.t = q ? Math.min(r.t + dt, q.at) : r.t + dt;
    while (r.next < r.cues.length && r.cues[r.next].at <= r.t) this.fire(r, r.cues[r.next++]);
    if (q && r.t >= q.at) this.prompt(r, q);
    else if (r.t >= r.duration) this.finish(r);
  }

  private fire(r: Run, cue: HeatCue): void {
    if (cue.do === 'hit') {
      this.blow(r, cue);
      return;
    }
    const f = cue.do === 'player' ? r.player : r.target;
    f.c.rig.play(cue.clip, { restart: true });
    if (f === r.target) r.targetLying = cue.clip === 'thrown';
  }

  private blow(r: Run, h: HitCue): void {
    const { ctx, hits } = this.hub;
    const onPlayer = h.on === 'player';
    const victim = onPlayer ? r.player : r.target;
    const attacker = onPlayer ? r.target : r.player;
    const damage = h.lethal ? Math.max(h.damage, victim.c.hp) : h.damage;
    hits.scriptedHit(attacker.c, victim.c, damage, h.lethal === true, h.sfx[0], h.big === true);
    for (let i = 1; i < h.sfx.length; i++) ctx.audio.playSfx(h.sfx[i], { position: victim.c.position });
    if (h.reaction !== 'keep') {
      victim.c.rig.play(REACTION_CLIP[h.reaction], { restart: true });
      const lying = h.reaction === 'knockdown' || h.reaction === 'downed';
      if (onPlayer) r.playerLying = lying;
      else r.targetLying = lying;
    }
    this.weaponCue(r, h);
    this.push(r, victim, h, onPlayer ? -1 : 1);
    if (h.big) this.bigBeat();
  }

  /** Where a blow sends its victim: into the wall, along the ground, or nowhere. */
  private push(r: Run, victim: Fighter, h: HitCue, sign: number): void {
    const c = victim.c;
    if (h.toWall) {
      const gap = Number.isFinite(r.wallGap) ? r.wallGap : KNOCK_SLIDE;
      slide(victim, r.fwd.x, r.fwd.z, gap, WALL_SLIDE_DUR);
      wallAt.copy(c.position).addScaledVector(r.fwd, c.radius + gap).setY(c.position.y + CHEST);
      this.hub.vfx.dust(wallAt);
      return;
    }
    const dist = h.slide ?? (h.reaction === 'knockdown' ? KNOCK_SLIDE : 0);
    slide(victim, r.fwd.x * sign, r.fwd.z * sign, dist, SLIDE_DUR);
  }

  private weaponCue(r: Run, h: HitCue): void {
    const { weapons } = this.hub;
    if (h.weapon === 'break') weapons.breakHeld(r.player.c);
    else if (h.weapon === 'coneOn') {
      r.crown = weapons.crown(r.player.c, r.target.c);
      // No head to put it on: it bursts on impact instead.
      if (!r.crown) weapons.breakHeld(r.player.c);
    } else if (h.weapon === 'coneOff' && r.crown) {
      weapons.smash(r.crown);
      r.crown = null;
    }
  }

  private bigBeat(): void {
    this.hub.timeFx.slowmo(BIG_BEAT.scale, BIG_BEAT.realSec);
    this.hub.renderFx.pulse('flash', 0.5);
  }

  private prompt(r: Run, q: HeatQte): void {
    r.waiting = true;
    this.qtePending = true;
    const n = q.count[0] + Math.floor(Math.random() * (q.count[1] - q.count[0] + 1));
    const keys: InputAction[] = [];
    for (let i = 0; i < n; i++) keys.push(q.pool[Math.floor(Math.random() * q.pool.length)]);
    this.hub.ctx.ui.runQTE(keys, q.windowSec).then(
      (ok) => this.answered(r, q, ok),
      () => this.answered(r, q, false),
    );
  }

  private answered(r: Run, q: HeatQte, ok: boolean): void {
    if (this.run !== r) return;
    this.qtePending = false;
    r.waiting = false;
    r.qteDone = true;
    if (ok) {
      void this.hub.ctx.cameraRig.playSequence(this.shots(r, q.successShots));
      return;
    }
    // Missed: he finds a second wind and hits back.
    r.cues = q.fail;
    r.next = 0;
    r.t = 0;
    r.duration = q.failDuration;
    this.hub.boss.recover(r.target);
    void this.hub.ctx.cameraRig.playSequence(this.shots(r, q.failShots));
  }

  private finish(r: Run): void {
    const { ctx } = this.hub;
    this.run = null;
    this.qtePending = false;
    this.hub.timeFx.suppressed = false;
    if (r.crown) this.hub.weapons.smash(r.crown);
    this.unhide(r);
    ctx.cameraRig.stopSequence();
    if (this.present(r.target.c)) this.settle(r.target, r.player.c, r.targetLying);
    this.settle(r.player, r.target.c, r.playerLying);
    ctx.state.transition('combat');
    // Script damage crosses the boss's thresholds too: the roar (or the kneel) comes once he's free.
    this.hub.boss.afterHit(r.target);
  }

  /** Hand a body back to the motor: out cold, on the floor, or on its feet. */
  private settle(f: Fighter, by: ICharacter, lying: boolean): void {
    if (!f.c.isAlive()) this.hub.hits.knockOut(f, by, lying);
    else if (lying) this.hub.motor.lieDown(f);
    else this.hub.motor.toIdle(f);
  }

  private present(c: ICharacter): boolean {
    return this.hub.ctx.entities.getCharacter(c.id) === c;
  }

  // -------------------------------------------------------------------------
  // The camera

  /**
   * Heat-table shots placed in this performance's frame, timed in game time so
   * bullet time slows them too. Camera spots stay clear of walls and
   * bystanders; the gaze rides along with the pair.
   */
  private shots(r: Run, list: readonly HeatShot[]): CameraShot[] {
    return list.map((s) => ({
      position: this.lens(r, s.from, s.look),
      lookAt: this.gaze(r, s.look),
      toPosition: s.to ? this.lens(r, s.to, s.toLook ?? s.look) : undefined,
      toLookAt: s.toLook ? this.gaze(r, s.toLook) : undefined,
      fov: s.fov,
      duration: s.dur,
      ease: s.ease,
      realTime: false,
    }));
  }

  /** Film from whichever side has fewer walls and stalls in the way (the pull-in handles the rest). */
  private pickSide(r: Run, list: readonly HeatShot[]): void {
    const here = this.blockedSpots(r, list);
    if (here === 0) return;
    r.right.negate();
    if (this.blockedSpots(r, list) >= here) r.right.negate();
  }

  private blockedSpots(r: Run, list: readonly HeatShot[]): number {
    let n = 0;
    for (const s of list) {
      if (this.clearance(r, s.from, s.look) < Infinity) n++;
      if (s.to && this.clearance(r, s.to, s.toLook ?? s.look) < Infinity) n++;
    }
    return n;
  }

  /**
   * Metres of open line from the look point out to the camera spot (Infinity if
   * nothing is in the way). Leaves `origin` on the look point and `dir` pointing
   * at the camera spot.
   */
  private clearance(r: Run, spot: V3, look: V3): number {
    this.place(r, look, origin);
    const len = this.place(r, spot, dir).sub(origin).length();
    if (len < 1e-3) return Infinity;
    dir.divideScalar(len);
    const hit = this.hub.ctx.physics.raycast(origin, dir, len, CG.STATIC);
    return hit ? hit.distance : Infinity;
  }

  /** A camera spot, pulled in front of any wall between it and what it films. */
  private lens(r: Run, spot: V3, look: V3): Vector3 {
    const gap = this.clearance(r, spot, look);
    const cam = gap < Infinity ? origin.clone().addScaledVector(dir, Math.max(LENS_MIN, gap - LENS_PAD)) : this.place(r, spot);
    this.hideNear(r, cam);
    return cam;
  }

  /** A look point that follows the pair's live midpoint: a floored victim slides out of any fixed frame. */
  private gaze(r: Run, v: V3): () => Vector3 {
    const out = new Vector3();
    const a = r.player.c.position;
    const b = r.target.c.position;
    return () => out.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2)
      .addScaledVector(r.right, v[0]).addScaledVector(r.fwd, v[2]).setY(r.mid.y + v[1]);
  }

  /** Nobody else stands between the lens and the action. */
  private hideNear(r: Run, spot: Vector3): void {
    for (const c of this.hub.ctx.entities.queryRadius(spot, LENS_CLEAR)) {
      if (c === r.player.c || c === r.target.c || r.hidden.includes(c)) continue;
      c.setVisible(false);
      r.hidden.push(c);
    }
  }

  private unhide(r: Run): void {
    for (const c of r.hidden) if (this.present(c)) c.setVisible(true);
    r.hidden.length = 0;
  }

  private place(r: Run, v: V3, out = new Vector3()): Vector3 {
    return out.copy(r.mid).addScaledVector(r.right, v[0]).addScaledVector(r.fwd, v[2]).setY(r.mid.y + v[1]);
  }
}
