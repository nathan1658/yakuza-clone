/**
 * Grabs: the player's grab → punches → throw, and 烏鴉's phase-3 grab that
 * the player escapes by mashing. A session owns both bodies' motion.
 */
import { Vector3 } from 'three';
import { yawTo, wrapAngle } from '../core/math';
import type { ICharacter } from '../core/types';
import type { CombatHub } from './hub';
import { canAct, fighterOf, setState, slide, type AttackInput, type Fighter } from './Fighter';
import { STANDING } from './hitTest';
import { MOVES, selectPlayerMove, type MoveDef } from './moves';

const GRAB_REACH = 1.0;
const GRAB_HALF_ARC = (60 * Math.PI) / 180;
/** A hold with nothing happening breaks after this long. */
const HOLD_LIMIT = 3;
const HOLD_GAP = 0.1;
const HOLD_SPRING = 10;
const HOLD_MAX_SPEED = 6;
/** How long a thrown body keeps bowling over anyone it slides into. */
const BOWL_TIME = 0.6;
const BOWL_SLACK = 0.2;
/** Presses needed to wriggle out of 烏鴉's grip. */
export const MASH_TO_ESCAPE = 6;
/** Seconds between the boss's punches while it holds the player. */
const BOSS_PUNCH_EVERY = 0.9;
const BOSS_PUNCHES = 3;

interface Session {
  holder: Fighter;
  victim: Fighter;
  /** Time since the last action, for the hold limit and the boss's rhythm. */
  idle: number;
  action: MoveDef | null;
  actT: number;
  actDur: number;
  hitAt: number;
  hitDone: boolean;
  punches: number;
  mash: number;
  /** The victim has been thrown; the holder is only finishing the clip. */
  released: boolean;
}

interface Thrown {
  victim: Fighter;
  by: ICharacter;
  t: number;
  bowled: Set<ICharacter>;
}

const v = new Vector3();

export class Grabs {
  private readonly sessions: Session[] = [];
  private readonly thrown: Thrown[] = [];

  constructor(private readonly hub: CombatHub) {}

  /** The player pressed grab: take hold of whoever is right in front. */
  tryGrab(f: Fighter): boolean {
    if (!canAct(f.c) || f.c.heldWeapon) return false;
    const victim = this.grabbable(f.c);
    if (!victim) return false;
    this.begin(f, fighterOf(victim));
    return true;
  }

  /** A grab that connected (the boss's lunge). */
  begin(holder: Fighter, victim: Fighter): void {
    this.hub.motor.interrupt(victim);
    this.hub.motor.interrupt(holder);
    setState(holder, 'grabbing');
    setState(victim, 'grabbed');
    holder.grabbing = victim.c;
    victim.grabbedBy = holder.c;
    holder.grabPunches = 0;
    holder.c.rig.play('grabHold', { loop: true });
    victim.c.rig.play('grabbed', { loop: true });
    victim.c.faceTowards(holder.c.position);
    this.sessions.push({ holder, victim, idle: 0, action: null, actT: 0, actDur: 0, hitAt: 0, hitDone: false, punches: 0, mash: 0, released: false });
    this.hub.ctx.audio.playSfx('grab', { position: victim.c.position });
    if (victim.isPlayer) this.hub.ctx.ui.toast(`狂撳 [${this.hub.ctx.input.getLabel('lightAttack')}] 掙脫！`, 'warning');
  }

  /** Light/heavy from the player while holding (punch / throw) or while held (mash). */
  playerInput(f: Fighter, input: AttackInput): boolean {
    const s = this.sessionOf(f);
    if (!s) return false;
    if (s.victim === f) return this.mash(s);
    if (s.action) return false;
    const id = selectPlayerMove(input, {
      grabbing: true, grabPunches: s.punches, weapon: false, weaponSwings: 0,
      targetDowned: false, sprinting: false, chain: 0,
    });
    this.act(s, MOVES[id]);
    return true;
  }

  /** End any grab `f` takes part in (it got hit, knocked out, the fight ended...). */
  release(f: Fighter): void {
    const s = this.sessionOf(f);
    if (s) this.end(s, f);
  }

  isHolding(holder: ICharacter, victim: ICharacter): boolean {
    const s = this.sessionOf(fighterOf(holder));
    return s !== null && !s.released && s.holder.c === holder && s.victim.c === victim;
  }

  update(dt: number): void {
    for (let i = this.sessions.length - 1; i >= 0; i--) this.tick(this.sessions[i], dt);
    for (let i = this.thrown.length - 1; i >= 0; i--) this.bowl(i, dt);
  }

  clear(): void {
    while (this.sessions.length > 0) this.end(this.sessions[0], null);
    this.thrown.length = 0;
  }

  // -------------------------------------------------------------------------

  private grabbable(p: ICharacter): ICharacter | null {
    for (const e of this.hub.director.activeEnemies) {
      if (!e.isAlive() || !STANDING.has(e.combatState) || e.combatState === 'grabbed') continue;
      if (e.role === 'boss' && e.combatState !== 'staggered') continue;
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
      const angle = Math.abs(wrapAngle(yawTo(p.position, e.position) - p.facing));
      if (d - p.radius - e.radius <= GRAB_REACH && angle <= GRAB_HALF_ARC) return e;
    }
    return null;
  }

  private sessionOf(f: Fighter): Session | null {
    for (const s of this.sessions) {
      if (s.holder === f || (!s.released && s.victim === f)) return s;
    }
    return null;
  }

  private act(s: Session, m: MoveDef): void {
    const def = s.holder.c.rig.getClipDef(m.clip);
    s.action = m;
    s.actT = 0;
    s.actDur = def.duration;
    s.hitAt = def.duration * (def.impactAt ?? 0.5);
    s.hitDone = false;
    s.idle = 0;
    s.holder.c.rig.play(def, { restart: true });
    if (m.whoosh) this.hub.ctx.audio.playSfx(m.whoosh, { position: s.holder.c.position, volume: 0.5 });
  }

  private tick(s: Session, dt: number): void {
    s.idle += dt;
    this.hold(s);
    if (s.action) this.tickAction(s, dt);
    else if (!s.holder.isPlayer && s.idle >= BOSS_PUNCH_EVERY) this.act(s, s.punches < BOSS_PUNCHES ? MOVES.b_grabPunch : MOVES.b_throw);
    else if (s.idle >= HOLD_LIMIT) this.breakFree(s);
  }

  private tickAction(s: Session, dt: number): void {
    const m = s.action as MoveDef;
    s.actT += dt;
    if (!s.hitDone && s.actT >= s.hitAt) {
      s.hitDone = true;
      if (m.kind === 'throw') {
        this.throwVictim(s, m);
        return;
      }
      this.punch(s, m);
    }
    if (s.actT < s.actDur || !this.sessions.includes(s)) return;
    if (s.released) {
      this.end(s, null);
      return;
    }
    s.action = null;
    s.idle = 0;
    s.holder.c.rig.play('grabHold', { loop: true });
    if (s.victim.c.isAlive()) s.victim.c.rig.play('grabbed', { loop: true });
  }

  private punch(s: Session, m: MoveDef): void {
    s.punches++;
    s.holder.grabPunches = s.punches;
    s.victim.c.rig.play('hitLight', { restart: true });
    this.hub.hits.applyHit(s.holder.c, s.victim.c, m, 0, 1);
  }

  /** Let go mid-clip: the victim flies off, the holder keeps 'grabbing' until the clip ends. */
  private throwVictim(s: Session, m: MoveDef): void {
    s.released = true;
    s.holder.grabbing = null;
    s.victim.grabbedBy = null;
    this.hub.hits.applyHit(s.holder.c, s.victim.c, m, 0, 1);
    this.thrown.push({ victim: s.victim, by: s.holder.c, t: 0, bowled: new Set([s.holder.c, s.victim.c]) });
  }

  /** A thrown body knocks over whoever it slides into. */
  private bowl(i: number, dt: number): void {
    const th = this.thrown[i];
    th.t += dt;
    if (th.t > BOWL_TIME) {
      this.thrown.splice(i, 1);
      return;
    }
    const b = th.victim.c;
    for (const e of this.hub.director.activeEnemies) {
      if (th.bowled.has(e) || !e.isAlive() || !STANDING.has(e.combatState)) continue;
      const d = Math.hypot(e.position.x - b.position.x, e.position.z - b.position.z);
      if (d > e.radius + b.radius + BOWL_SLACK) continue;
      th.bowled.add(e);
      this.hub.hits.applyHit(th.by, e, MOVES.bowl, 0, 1);
    }
  }

  private mash(s: Session): boolean {
    s.mash++;
    s.victim.c.rig.flash(0xffffff, 0.08);
    if (s.mash < MASH_TO_ESCAPE) return true;
    const { holder, victim } = s;
    this.end(s, null);
    // Shoved off: the holder reels (a punish window), the player hops back with i-frames.
    this.hub.motor.react(holder, 'stagger', victim.c, MOVES.jab);
    setState(victim, 'dodging', 0.45);
    victim.c.rig.play('dodgeB', { restart: true });
    slide(victim, victim.c.position.x - holder.c.position.x, victim.c.position.z - holder.c.position.z, 1.2, 0.35);
    return true;
  }

  private breakFree(s: Session): void {
    const { holder, victim } = s;
    this.end(s, null);
    victim.c.rig.play('hitLight', { restart: true });
    setState(victim, 'hitstun', 0.35);
    slide(victim, victim.c.position.x - holder.c.position.x, victim.c.position.z - holder.c.position.z, 0.6, 0.25);
  }

  /** Close the session; `cause` is the party being interrupted (its caller sets its state). */
  private end(s: Session, cause: Fighter | null): void {
    const k = this.sessions.indexOf(s);
    if (k >= 0) this.sessions.splice(k, 1);
    s.holder.grabbing = null;
    s.victim.grabbedBy = null;
    if (s.holder !== cause && s.holder.c.isAlive()) this.hub.motor.toIdle(s.holder);
    if (!s.released && s.victim !== cause && s.victim.c.isAlive()) this.hub.motor.toIdle(s.victim);
  }

  /** Keep the victim pinned in front of the holder, both standing still. */
  private hold(s: Session): void {
    const h = s.holder.c;
    const c = s.victim.c;
    if (s.released) {
      h.setDesiredVelocity(v.set(0, 0, 0));
      return;
    }
    const gap = h.radius + c.radius + HOLD_GAP;
    const tx = h.position.x + Math.sin(h.facing) * gap;
    const tz = h.position.z + Math.cos(h.facing) * gap;
    v.set((tx - c.position.x) * HOLD_SPRING, 0, (tz - c.position.z) * HOLD_SPRING);
    if (v.length() > HOLD_MAX_SPEED) v.setLength(HOLD_MAX_SPEED);
    c.setDesiredVelocity(v);
    c.faceTowards(h.position);
    h.setDesiredVelocity(v.set(0, 0, 0));
  }
}
