/**
 * A street thug: circles the player at a respectful distance, waits for an
 * attack token, closes in and throws a string. One string is in the air at a
 * time and the player gets a breather after each hit (Yakuza pacing). Later
 * fights press harder; a leader waits for his boys to soften the player up.
 * Sometimes guards, sometimes picks up a chair, sometimes laughs at you on the floor.
 * Only ticked by entities while the character can move (idle/moving).
 */
import { Vector3 } from 'three';
import { clamp, wrapAngle, yawTo } from '../../core/math';
import type { GameTime, ICharacter, ICharacterBrain, IWeaponProp } from '../../core/types';
import type { CombatHub } from '../hub';
import { fighterOf, type Fighter } from '../Fighter';
import { isHittable } from '../hitTest';
import { MOVES, PATTERNS, type MoveId } from '../moves';
import { GUARD_HALF_ARC } from '../rules';
import { COMBAT_MOVE_SPEED, CROWD, type Archetype } from '../tables';

export type Pattern = readonly MoveId[];

/** Preferred circling distance, metres from the player's centre. */
const RING = { min: 2.5, max: 4 } as const;
/** Where a leader hovers while his boys do the work. */
const HOLD_RING = 6;
const CIRCLE_SPEED = 0.55;
const BACK_OFF = 0.3;
const RUN_FROM = 8;
const RUN_SPEED = 4.5;
const TURN_RATE = 8;
/** Start the string a little before the first strike would be in range: the lunge covers it. */
const ATTACK_SLACK = 0.3;
/** Give the token back if the player keeps running away. */
const CHASE_LIMIT = 3;
const STRAFE_FLIP: readonly [number, number] = [1.8, 4];
const GUARD_TIME: readonly [number, number] = [0.6, 1.1];
const GUARD_RANGE = 3;
const TAUNT_CHANCE = 0.3;
const TAUNT_RANGE = 6;
const TAUNT_TIME = 1.2;
/** After eating a hit a thug needs a moment before swinging back: it lets the player's chains land. */
const HIT_HESITATE = 0.9;
/** Seconds after the player was last hurt before anyone starts a new string. */
const BREATHER = 1.0;
/** Unarmed thugs look around for something to swing this often, this far. */
const LOOT_CHECK = 2;
const LOOT_RANGE = 5;
const LOOT_REACH = 0.9;
const LOOT_GIVE_UP = 3;
const PICKUP_TIME = 0.5;

const vel = new Vector3();
const ZERO = new Vector3();
const between = (r: readonly [number, number]): number => r[0] + (r[1] - r[0]) * Math.random();

export class EnemyBrain implements ICharacterBrain {
  private readonly f: Fighter;
  private cooldown: number;
  private next: Pattern | null = null;
  private chase = 0;
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private strafeTimer = between(STRAFE_FLIP);
  private ringDist = between([RING.min, RING.max]);
  private seenSerial = 0;
  private seenHits = 0;
  private playerWasDown = false;
  /** Standing still for a taunt or a pickup. */
  private still = 0;
  private loot: IWeaponProp | null = null;
  private lootTimer = between([0, LOOT_CHECK]);
  private lootChase = 0;
  private halted = false;
  /** A leader has stopped holding back (see Archetype.holdBack). */
  private joined = false;

  constructor(
    private readonly hub: CombatHub,
    private readonly c: ICharacter,
    private readonly arch: Archetype,
    private readonly patterns: readonly Pattern[],
  ) {
    this.f = fighterOf(c);
    this.cooldown = this.rollCooldown() * 0.5;
  }

  update(time: GameTime): void {
    const dt = time.dt;
    if (dt <= 0) return;
    if (!this.hub.director.fighting || !this.hub.ctx.state.is('combat')) {
      this.halt();
      return;
    }
    const p = this.hub.ctx.entities.player;
    this.halted = false;
    this.cooldown -= dt;
    if (this.f.hitSerial !== this.seenHits) {
      this.seenHits = this.f.hitSerial;
      this.cooldown = Math.max(this.cooldown, HIT_HESITATE);
    }
    this.c.faceTowards(p.position, TURN_RATE * dt);
    if (this.reactToPlayer(p)) return;
    if (this.taunting(p, dt)) return;
    if (this.scavenging(dt)) return;
    const dist = Math.hypot(p.position.x - this.c.position.x, p.position.z - this.c.position.z);
    if (this.holdingBack()) this.circle(p, dist, dt, HOLD_RING);
    else if (this.attackTurn(p)) this.press(p, dist, dt);
    else this.circle(p, dist, dt, this.ringDist);
  }

  dispose(): void {
    this.hub.tokens.release(this.c.id);
  }

  /** Brains keep no velocity when switched off: desiredVelocity persists. */
  private halt(): void {
    if (this.halted) return;
    this.halted = true;
    this.hub.tokens.release(this.c.id);
    this.next = null;
    this.c.setDesiredVelocity(ZERO);
  }

  /** Guard against a swing aimed at us; returns true if we raised the guard. */
  private reactToPlayer(p: ICharacter): boolean {
    const pf = fighterOf(p);
    if (pf.attackSerial === this.seenSerial) return false;
    this.seenSerial = pf.attackSerial;
    if (pf.focus !== this.c || Math.random() >= this.arch.guardChance) return false;
    const d = Math.hypot(p.position.x - this.c.position.x, p.position.z - this.c.position.z);
    const facing = Math.abs(wrapAngle(yawTo(this.c.position, p.position) - this.c.facing)) <= GUARD_HALF_ARC;
    if (d > GUARD_RANGE || !facing) return false;
    this.hub.motor.enemyGuard(this.f, between(GUARD_TIME));
    return true;
  }

  /** The player just hit the floor: sometimes stop to jeer. */
  private taunting(p: ICharacter, dt: number): boolean {
    const down = p.combatState === 'knockdown' || p.combatState === 'downed';
    if (down && !this.playerWasDown && this.still <= 0 && Math.random() < TAUNT_CHANCE) {
      const d = Math.hypot(p.position.x - this.c.position.x, p.position.z - this.c.position.z);
      if (d < TAUNT_RANGE) {
        this.still = TAUNT_TIME;
        this.c.setDesiredVelocity(ZERO);
        this.c.playAnim('taunt', { restart: true });
      }
    }
    this.playerWasDown = down;
    if (this.still <= 0) return false;
    this.still -= dt;
    return true;
  }

  /** Between strings an unarmed thug may go for a chair lying nearby. */
  private scavenging(dt: number): boolean {
    if (this.c.heldWeapon || this.hub.tokens.has(this.c.id)) return this.forgetLoot();
    const w = this.loot ?? this.spotLoot(dt);
    if (!w) return false;
    this.lootChase += dt;
    const dx = w.position.x - this.c.position.x;
    const dz = w.position.z - this.c.position.z;
    if (Math.hypot(dx, dz) > LOOT_REACH) {
      if (w.holder || w.durability <= 0 || this.lootChase > LOOT_GIVE_UP) return this.forgetLoot();
      this.moveAlong(dx, dz, COMBAT_MOVE_SPEED * this.c.stats.speed);
      return true;
    }
    this.forgetLoot();
    if (!this.hub.weapons.pickUp(this.c, w)) return false;
    this.c.setDesiredVelocity(ZERO);
    this.c.playAnim('pickup', { restart: true });
    this.still = PICKUP_TIME;
    return true;
  }

  private spotLoot(dt: number): IWeaponProp | null {
    this.lootTimer -= dt;
    if (this.lootTimer > 0 || this.arch.pickupChance <= 0) return null;
    this.lootTimer = LOOT_CHECK;
    if (Math.random() >= this.arch.pickupChance) return null;
    this.lootChase = 0;
    this.loot = this.hub.weapons.nearestLying(this.c.position, LOOT_RANGE);
    return this.loot;
  }

  private forgetLoot(): false {
    this.loot = null;
    return false;
  }

  private attackTurn(p: ICharacter): boolean {
    if (this.cooldown > 0 || !p.isAlive() || !isHittable(p.combatState, false)) return false;
    // Nobody piles onto a player who is still reeling: no gang stun-locks, a breather between strings.
    if (fighterOf(p).sinceHurt < BREATHER) return false;
    if (this.otherSwinging()) return false;
    if (!this.hub.tokens.acquire(this.c.id, this.arch.reservedToken)) return false;
    this.next ??= this.pickPattern();
    return true;
  }

  /** Thugs take turns: two may crowd the player, but only one throws a string. */
  private otherSwinging(): boolean {
    for (const e of this.hub.director.participants) {
      if (e !== this.c && e.combatState === 'attacking') return true;
    }
    return false;
  }

  /** A leader stays out of it while enough of his boys are standing, and joins for good once hit. */
  private holdingBack(): boolean {
    const limit = this.arch.holdBack;
    if (this.joined || limit === undefined) return false;
    this.joined = this.hub.director.activeEnemies.length - 1 <= limit || this.c.hp < this.c.maxHp;
    return !this.joined;
  }

  /** Seconds until the next string: the fight's aggression shortens it, a big crowd lengthens it. */
  private rollCooldown(): number {
    const crowd = Math.max(1, this.hub.director.activeEnemies.length / CROWD.norm);
    return (between(this.arch.cooldown) * crowd) / this.hub.director.aggression;
  }

  private pickPattern(): Pattern {
    const set = this.c.heldWeapon ? PATTERNS.weapon : this.patterns;
    return set[Math.floor(Math.random() * set.length)];
  }

  /** Holding a token: close in and swing. */
  private press(p: ICharacter, dist: number, dt: number): void {
    const pattern = this.next ?? this.pickPattern();
    const reach = MOVES[pattern[0]].reach;
    if (dist - p.radius <= reach + ATTACK_SLACK) {
      this.next = null;
      this.chase = 0;
      this.cooldown = this.rollCooldown();
      this.hub.motor.enemyAttack(this.f, pattern, p);
      return;
    }
    this.chase += dt;
    if (this.chase > CHASE_LIMIT) {
      this.chase = 0;
      this.cooldown = this.rollCooldown();
      this.hub.tokens.release(this.c.id);
    }
    this.moveAlong(p.position.x - this.c.position.x, p.position.z - this.c.position.z, this.runSpeed(dist));
  }

  /** No token: hover around the ring, drifting sideways, never quite committing. */
  private circle(p: ICharacter, dist: number, dt: number, ring: number): void {
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
    // Radial pull towards the ring plus a tangential drift (perpendicular to the player line).
    // Backing off is slow on purpose: thugs hold their ground and the player can walk up and swing.
    const radial = clamp((dist - ring) * 0.8, -BACK_OFF, 1);
    const vx = dx * inv * radial + dz * inv * this.strafe * 0.7;
    const vz = dz * inv * radial - dx * inv * this.strafe * 0.7;
    this.moveAlong(vx, vz, COMBAT_MOVE_SPEED * CIRCLE_SPEED * this.c.stats.speed);
  }

  private runSpeed(dist: number): number {
    return dist > RUN_FROM ? RUN_SPEED : COMBAT_MOVE_SPEED * this.c.stats.speed;
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
