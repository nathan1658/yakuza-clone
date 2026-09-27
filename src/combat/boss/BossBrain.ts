/**
 * 烏鴉 (東星 ・ 瘋狗烏鴉)'s fighting AI. Combat's BossPhases owns his phases
 * (f.phase / f.armored, 'boss:phase', the roar line) and the kneel
 * (f.kneeling, the finisher prompt); this brain reads them and picks his moves:
 *  - Phase 1: a boxer. PATTERNS.boss1 strings, guards, counters (b_counter) a
 *    blocked hit, rushes (b_rush) to close a gap.
 *  - Phase 2: PATTERNS.boss2 heavies, and the 掀桌 table flip whenever a table
 *    is within walking distance and the flip cooldown allows.
 *  - Phase 3: faster, shorter cooldowns, and the grab: now and then up close,
 *    always against a player who turtles.
 * On each phase change he stops to roar and shoves a close player back.
 * Every big move is telegraphed (b_heavy/b_rush/b_tableFlip by the move's
 * telegraph, the grab by an arms-wide windup) and all damage goes through the
 * Motor/HitResolver. Ticked only while he can move; does nothing while kneeling.
 */
import { Vector3 } from 'three';
import { clamp, wrapAngle, yawTo } from '../../core/math';
import type { CombatState, GameTime, HitEvent, ICharacter, ICharacterBrain } from '../../core/types';
import type { CombatHub } from '../hub';
import { fighterOf, type Fighter } from '../Fighter';
import { isHittable } from '../hitTest';
import { MOVES, type MoveDef } from '../moves';
import { GUARD_HALF_ARC } from '../rules';
import { COMBAT_MOVE_SPEED } from '../tables';
import { DaiPaiDongTables } from './DaiPaiDongTables';
import {
  FLIP_REACH, GRAB_RANGE, TABLE_WALK, choosePlan, patternFor, phaseDef, type BossPlan, type Pattern, type XZ,
} from './bossRules';
import { GRAB_REACH, ROAR } from './clips';

const RING = { min: 2.2, max: 3.4 } as const;
const CIRCLE_SPEED = 0.6;
const BACK_OFF = 0.3;
const RUN_FROM = 8;
const RUN_SPEED = 5;
const TURN_RATE = 9;
/** Start a string a little before the first strike is in range: the lunge covers it. */
const ATTACK_SLACK = 0.3;
const CHASE_LIMIT = 3.5;
const STRAFE_FLIP: readonly [number, number] = [1.5, 3.5];
const GUARD_TIME: readonly [number, number] = [0.5, 0.9];
const GUARD_RANGE = 3;
/** A flinch costs him less than it costs a thug. */
const HIT_HESITATE = 0.4;
/** Seconds after the player was last hurt before he starts anything new. */
const BREATHER = 0.8;
/** The phase-change roar pose, shoving back a player this close. */
const ROAR_TIME = 1.2;
const ROAR_SHOVE = 3;
/** The first flip comes this soon after a phase change; with no table near he looks again after FLIP_RETRY. */
const FIRST_FLIP = 3;
const FLIP_RETRY = 2;
/** He gives up walking to a table after this long. */
const FETCH_LIMIT = 3;
/** Riposte after a blocked hit if the player is still this close. */
const COUNTER_RANGE = 2.4;
/** The grab: arms-wide windup (the tell), a short lunge, then a punishable whiff. */
const GRAB = { windup: 0.5, lunge: 0.25, speed: 4.5, reach: 0.9, halfArc: (60 * Math.PI) / 180, whiff: 0.9 } as const;
/** Dodging (i-frames) beats the grab; so does being down. */
const GRABBABLE: ReadonlySet<CombatState> = new Set<CombatState>(['idle', 'moving', 'attacking', 'guarding']);
/** He jeers at a floored player now and then: a beat to get back up. */
const TAUNT_CHANCE = 0.5;
const TAUNT_TIME = 1.2;
/** Flooring the player: extra weight on top of the resolver's feedback. */
const SLAM_HITSTOP = 0.12;
/** The roar's shove: no damage, only distance. */
const SHOVE: MoveDef = { ...MOVES.b_heavy, knockback: 1.6 };

const vel = new Vector3();
const ZERO = new Vector3();
const between = (r: readonly [number, number]): number => r[0] + (r[1] - r[0]) * Math.random();
const flat = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);

export class BossBrain implements ICharacterBrain {
  private readonly f: Fighter;
  private readonly unsubscribe: () => void;
  private cooldown: number;
  private plan: BossPlan | null = null;
  private pattern: Pattern = [];
  private table = -1;
  private chase = 0;
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private strafeTimer = between(STRAFE_FLIP);
  private ringDist = between([RING.min, RING.max]);
  private seenSerial: number;
  private seenHits: number;
  private seenPhase: number;
  /** f.t at the last tick: if it went back, he was busy (attacking, reeling, held, kneeling) in between. */
  private lastT = 0;
  private flipTimer = FIRST_FLIP;
  /** Seconds the player has been guarding. */
  private turtle = 0;
  /** He blocked a hit: riposte as soon as the guard drops. */
  private counter = false;
  /** Seconds into the grab (windup, then lunge); -1 = not grabbing. */
  private grabT = -1;
  /** Standing still: roaring, jeering, or caught out by a whiffed grab. */
  private still = 0;
  private playerWasDown = false;
  private halted = false;

  constructor(
    private readonly hub: CombatHub,
    private readonly c: ICharacter,
  ) {
    this.f = fighterOf(c);
    this.seenSerial = fighterOf(hub.ctx.entities.player).attackSerial;
    this.seenHits = this.f.hitSerial;
    this.seenPhase = Math.max(1, this.f.phase);
    this.cooldown = between(phaseDef(this.f.phase).cooldown) * 0.5;
    this.unsubscribe = hub.ctx.events.on('combat:hit', (e) => this.onHit(e));
  }

  update(time: GameTime): void {
    const dt = time.dt;
    if (dt <= 0 || this.f.kneeling) return;
    if (!this.hub.director.fighting || !this.hub.ctx.state.is('combat')) {
      this.halt();
      return;
    }
    this.halted = false;
    if (this.f.t < this.lastT) this.forget();
    this.lastT = this.f.t;
    const p = this.hub.ctx.entities.player;
    this.tick(p, dt);
    if (this.roaring(p)) return;
    this.c.faceTowards(p.position, TURN_RATE * dt);
    if (this.grabbing(p, dt) || this.resting(p, dt) || this.countering(p) || this.guarding(p)) return;
    const dist = flat(this.c.position, p.position);
    if (this.attackTurn(p, dist)) this.press(p, dist, dt);
    else this.circle(p, dist, dt);
  }

  dispose(): void {
    this.unsubscribe();
    this.hub.tokens.release(this.c.id);
  }

  /** Brains keep no velocity when switched off: desiredVelocity persists. */
  private halt(): void {
    if (this.halted) return;
    this.halted = true;
    this.hub.tokens.release(this.c.id);
    this.forget();
    this.counter = false;
    this.c.setDesiredVelocity(ZERO);
  }

  /** Drop whatever he was about to do. */
  private forget(): void {
    this.plan = null;
    this.table = -1;
    this.chase = 0;
    this.grabT = -1;
    this.still = 0;
  }

  private tick(p: ICharacter, dt: number): void {
    this.cooldown -= dt;
    this.flipTimer -= dt;
    this.turtle = p.combatState === 'guarding' ? this.turtle + dt : 0;
    if (this.f.hitSerial === this.seenHits) return;
    // He flinched (or had his guard broken): no riposte, and a moment before the next swing.
    this.seenHits = this.f.hitSerial;
    this.forget();
    this.counter = false;
    this.cooldown = Math.max(this.cooldown, HIT_HESITATE);
  }

  /** BossPhases moved him up a phase: he stops to roar, shoving a close player back. */
  private roaring(p: ICharacter): boolean {
    if (this.f.phase <= this.seenPhase) return false;
    this.seenPhase = this.f.phase;
    this.forget();
    this.hub.tokens.release(this.c.id);
    this.flipTimer = Math.min(this.flipTimer, FIRST_FLIP);
    this.still = ROAR_TIME;
    this.c.setDesiredVelocity(ZERO);
    this.c.playAnim(ROAR, { restart: true, duration: ROAR_TIME });
    if (flat(p.position, this.c.position) <= ROAR_SHOVE && isHittable(p.combatState, false)) {
      this.hub.hits.applyHit(this.c, p, SHOVE, 0, 1, { damage: 0, reaction: 'knockback', sfx: 'impact_boom' });
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Reactions

  /** A hit he blocked arms the counter; his own floorings get extra weight. */
  private onHit(e: HitEvent): void {
    if (e.targetId === this.c.id) {
      if (e.blocked && this.c.combatState === 'guarding') this.armCounter();
      return;
    }
    if (e.attackerId !== this.c.id || !e.knockdown) return;
    this.hub.vfx.impact(e.position, 'big');
    this.hub.timeFx.hitstop(SLAM_HITSTOP);
    this.hub.ctx.cameraRig.punch(-4, 0.25);
  }

  /** Drop the guard as soon as the block stun is over: the riposte comes right after. */
  private armCounter(): void {
    this.counter = true;
    this.f.stateDur = Math.min(this.f.stateDur, this.f.t);
  }

  private countering(p: ICharacter): boolean {
    if (!this.counter) return false;
    this.counter = false;
    if (flat(p.position, this.c.position) > COUNTER_RANGE || !isHittable(p.combatState, false)) return false;
    this.hub.tokens.acquire(this.c.id, true);
    this.commit(['b_counter'], p);
    return true;
  }

  /** Guard against a swing aimed at him; returns true if he raised the guard. */
  private guarding(p: ICharacter): boolean {
    const pf = fighterOf(p);
    if (pf.attackSerial === this.seenSerial) return false;
    this.seenSerial = pf.attackSerial;
    if (pf.focus !== this.c || Math.random() >= phaseDef(this.f.phase).guardChance) return false;
    const facing = Math.abs(wrapAngle(yawTo(this.c.position, p.position) - this.c.facing)) <= GUARD_HALF_ARC;
    if (flat(p.position, this.c.position) > GUARD_RANGE || !facing) return false;
    this.hub.motor.enemyGuard(this.f, between(GUARD_TIME));
    return true;
  }

  /** Standing still: the roar, a jeer at a floored player, or caught out after a whiffed grab. */
  private resting(p: ICharacter, dt: number): boolean {
    const down = p.combatState === 'knockdown' || p.combatState === 'downed';
    if (down && !this.playerWasDown && this.still <= 0 && Math.random() < TAUNT_CHANCE) {
      this.still = TAUNT_TIME;
      this.c.playAnim('taunt', { restart: true });
    }
    this.playerWasDown = down;
    if (this.still <= 0) return false;
    this.still -= dt;
    this.c.setDesiredVelocity(ZERO);
    return true;
  }

  // -------------------------------------------------------------------------
  // Attacks

  private attackTurn(p: ICharacter, dist: number): boolean {
    if (this.cooldown > 0 || !p.isAlive() || !isHittable(p.combatState, false)) return false;
    // A breather after every hit that lands, and never on top of an add's swing.
    if (fighterOf(p).sinceHurt < BREATHER || this.otherSwinging()) return false;
    if (!this.hub.tokens.acquire(this.c.id, true)) return false;
    this.plan ??= this.decide(dist);
    return true;
  }

  private otherSwinging(): boolean {
    for (const e of this.hub.director.participants) {
      if (e !== this.c && e.combatState === 'attacking') return true;
    }
    return false;
  }

  private decide(dist: number): BossPlan {
    const tables = DaiPaiDongTables.of(this.hub);
    const ready = this.flipTimer <= 0 && Number.isFinite(phaseDef(this.f.phase).flipCooldown);
    this.table = tables && ready ? tables.nearest(this.c.position, TABLE_WALK) : -1;
    const at = tables && this.table >= 0 ? tables.standing(this.table) : null;
    const plan = choosePlan({
      phase: this.f.phase, dist, flipReady: ready, turtle: this.turtle, roll: Math.random(),
      tableDist: at ? flat(at, this.c.position) : Infinity,
    });
    // Nothing to flip within walking distance: look again in a moment.
    if (ready && plan !== 'flip') this.flipTimer = FLIP_RETRY;
    if (plan === 'string') this.pattern = patternFor(this.f.phase, Math.random());
    return plan;
  }

  private press(p: ICharacter, dist: number, dt: number): void {
    if (this.plan === 'flip') return this.fetchTable(p, dt);
    if (this.plan === 'rush') return this.commit(['b_rush'], p);
    const grab = this.plan === 'grab';
    const range = grab ? GRAB_RANGE : p.radius + MOVES[this.pattern[0]].reach + ATTACK_SLACK;
    if (!this.closeIn(p, dist, dt, range)) return;
    if (grab) this.startGrab();
    else this.commit(this.pattern, p);
  }

  private commit(pattern: Pattern, p: ICharacter): void {
    this.plan = null;
    this.chase = 0;
    this.cooldown = between(phaseDef(this.f.phase).cooldown);
    this.hub.motor.enemyAttack(this.f, pattern, p);
  }

  /** Walk (run, if far) at the player; true once within `range`, centre to centre. */
  private closeIn(p: ICharacter, dist: number, dt: number, range: number): boolean {
    if (dist <= range) return true;
    this.chase += dt;
    if (this.chase > CHASE_LIMIT) {
      this.plan = null;
      this.chase = 0;
      this.cooldown = between(phaseDef(this.f.phase).cooldown);
      this.hub.tokens.release(this.c.id);
      return false;
    }
    this.moveAlong(p.position.x - this.c.position.x, p.position.z - this.c.position.z, this.runSpeed(dist));
    return false;
  }

  /** 掀桌: walk to the chosen table, then heave it (the move's windup) and throw it at the player. */
  private fetchTable(p: ICharacter, dt: number): void {
    const tables = DaiPaiDongTables.of(this.hub);
    const at = tables?.standing(this.table) ?? null;
    this.chase += dt;
    if (!tables || !at || this.chase > FETCH_LIMIT) {
      this.plan = null;
      this.chase = 0;
      this.flipTimer = FLIP_RETRY;
      return;
    }
    const dx = at.x - this.c.position.x;
    const dz = at.z - this.c.position.z;
    if (Math.hypot(dx, dz) > FLIP_REACH) {
      this.moveAlong(dx, dz, this.walkSpeed());
      return;
    }
    const i = this.table;
    this.flipTimer = phaseDef(this.f.phase).flipCooldown;
    this.commit(['b_tableFlip'], p);
    tables.grab(i, this.f);
  }

  private startGrab(): void {
    if (this.grabT >= 0) return;
    this.grabT = 0;
    this.c.setDesiredVelocity(ZERO);
    this.c.playAnim(GRAB_REACH, { restart: true, duration: GRAB.windup + GRAB.lunge });
    this.hub.ctx.audio.playSfx('enemy_alert', { position: this.c.position, volume: 0.6 });
  }

  /** The phase-3 grab: arms wide (the tell), a short lunge, then a hold or a whiff. */
  private grabbing(p: ICharacter, dt: number): boolean {
    if (this.grabT < 0) return false;
    this.grabT += dt;
    if (this.grabT < GRAB.windup) {
      this.c.setDesiredVelocity(ZERO);
      return true;
    }
    if (this.catchable(p)) {
      this.grabT = -1;
      this.plan = null;
      this.cooldown = between(phaseDef(this.f.phase).cooldown);
      this.hub.grabs.begin(this.f, fighterOf(p));
      return true;
    }
    if (this.grabT < GRAB.windup + GRAB.lunge) {
      this.moveAlong(p.position.x - this.c.position.x, p.position.z - this.c.position.z, GRAB.speed);
      return true;
    }
    this.grabT = -1;
    this.plan = null;
    this.still = GRAB.whiff;
    this.cooldown = between(phaseDef(this.f.phase).cooldown);
    this.hub.tokens.release(this.c.id);
    this.c.setDesiredVelocity(ZERO);
    return true;
  }

  private catchable(p: ICharacter): boolean {
    if (!p.isAlive() || p.invulnerable || !GRABBABLE.has(p.combatState)) return false;
    const gap = flat(p.position, this.c.position) - p.radius - this.c.radius;
    return gap <= GRAB.reach && Math.abs(wrapAngle(yawTo(this.c.position, p.position) - this.c.facing)) <= GRAB.halfArc;
  }

  // -------------------------------------------------------------------------
  // Movement

  /** No attack turn: prowl round the player at a close ring, drifting sideways. */
  private circle(p: ICharacter, dist: number, dt: number): void {
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafe = -this.strafe;
      this.strafeTimer = between(STRAFE_FLIP);
      this.ringDist = between([RING.min, RING.max]);
    }
    const dx = p.position.x - this.c.position.x;
    const dz = p.position.z - this.c.position.z;
    if (dist > RUN_FROM) {
      this.moveAlong(dx, dz, this.runSpeed(dist));
      return;
    }
    const inv = 1 / Math.max(dist, 1e-3);
    const radial = clamp((dist - this.ringDist) * 0.8, -BACK_OFF, 1);
    const vx = dx * inv * radial + dz * inv * this.strafe * 0.7;
    const vz = dz * inv * radial - dx * inv * this.strafe * 0.7;
    this.moveAlong(vx, vz, this.walkSpeed() * CIRCLE_SPEED);
  }

  private walkSpeed(): number {
    return COMBAT_MOVE_SPEED * this.c.stats.speed * phaseDef(this.f.phase).speedMul;
  }

  private runSpeed(dist: number): number {
    return dist > RUN_FROM ? RUN_SPEED * phaseDef(this.f.phase).speedMul : this.walkSpeed();
  }

  private moveAlong(dx: number, dz: number, speed: number): void {
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) {
      this.c.setDesiredVelocity(ZERO);
      return;
    }
    this.c.setDesiredVelocity(vel.set((dx / len) * speed, 0, (dz / len) * speed));
  }
}
