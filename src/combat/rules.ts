/**
 * Pure combat rules: damage, reactions, heat, attack tokens, boss phases and
 * dodge timing. No scene, no ctx — everything here is unit tested.
 */
import { wrapAngle, yawTo } from '../core/math';
import type { HitKind, MoveDef, ReactionKind } from './moves';
import { DODGE, GUARD_FACTOR, HEAT } from './tables';

export function computeDamage(base: number, power: number, defense: number, guarded: boolean): number {
  return Math.max(1, Math.round(base * power * defense * (guarded ? GUARD_FACTOR : 1)));
}

/** Half-angle of the guard's coverage: attacks from further round get through. */
export const GUARD_HALF_ARC = (70 * Math.PI) / 180;

/** Is `attackerPos` within the guard cone of a character at `pos` facing `facing`? */
export function isFrontal(pos: { x: number; z: number }, facing: number, attackerPos: { x: number; z: number }): boolean {
  return Math.abs(wrapAngle(yawTo(pos, attackerPos) - facing)) <= GUARD_HALF_ARC;
}

export type ReactionResult =
  | 'none' | 'block' | 'guardBreak'
  | 'hitLight' | 'hitHeavy' | 'hitBack' | 'stagger' | 'knockback' | 'knockdown' | 'launch';

export interface ReactionInput {
  reaction: ReactionKind;
  kind: HitKind;
  guarded: boolean;
  frontal: boolean;
  guardBreak: boolean;
  isBoss: boolean;
  hyperArmor: boolean;
  /** Target's poise (0 = flinches from everything). */
  poise: number;
  /** Poise damage accumulated including this hit. */
  poiseAccum: number;
}

const CLEAN: Readonly<Record<ReactionKind, ReactionResult>> = {
  light: 'hitLight',
  heavy: 'hitHeavy',
  stagger: 'stagger',
  knockback: 'knockback',
  knockdown: 'knockdown',
  launch: 'launch',
};

/** Reactions poise can soak up; anything bigger always lands. */
const FLINCH = new Set<ReactionKind>(['light', 'heavy']);
/** Reactions the boss is too heavy to suffer from regular strikes. */
const FLOORING = new Set<ReactionKind>(['knockback', 'knockdown', 'launch']);

/**
 * How a hit lands. `poiseBroken` tells the caller to reset the accumulator.
 * Order matters: guard, then boss weight, then armour, then poise.
 */
export function resolveReaction(h: ReactionInput): { result: ReactionResult; poiseBroken: boolean } {
  if (h.guarded && h.frontal) return { result: h.guardBreak ? 'guardBreak' : 'block', poiseBroken: false };
  const reaction: ReactionKind = h.isBoss && h.kind !== 'throw' && FLOORING.has(h.reaction) ? 'heavy' : h.reaction;
  if (h.hyperArmor) return { result: 'none', poiseBroken: false };
  if (h.poise <= 0) return { result: CLEAN[reaction], poiseBroken: false };
  if (h.poiseAccum < h.poise) return { result: FLINCH.has(reaction) ? 'none' : CLEAN[reaction], poiseBroken: false };
  return { result: FLINCH.has(reaction) ? 'stagger' : CLEAN[reaction], poiseBroken: true };
}

/** Hits from behind turn a flinch into the stumble-forward reaction. */
export function applyBackHit(r: ReactionResult, fromBehind: boolean): ReactionResult {
  return fromBehind && (r === 'hitLight' || r === 'hitHeavy') ? 'hitBack' : r;
}

/** Damage of hit `index` out of `count` so the parts sum to the move's total. */
export function splitDamage(total: number, index: number, count: number): number {
  const base = Math.floor(total / count);
  return index === count - 1 ? total - base * (count - 1) : base;
}

/** Reaction of hit `index` of a move: a flurry only pays off on its last hit. */
export function reactionForHit(move: MoveDef, index: number, count: number): ReactionKind {
  return index < count - 1 && count > 1 ? 'light' : move.reaction;
}

// ---------------------------------------------------------------------------

/** The heat gauge: fills when you fight well, drains when you stall. */
export class HeatMeter {
  value = 0;
  private sinceGain = 0;

  /** Returns whether the value changed and whether it just became ready. */
  add(amount: number): { changed: boolean; crossedReady: boolean } {
    const before = this.value;
    this.value = Math.min(HEAT.max, Math.max(0, before + amount));
    if (amount > 0) this.sinceGain = 0;
    return { changed: this.value !== before, crossedReady: before < HEAT.ready && this.value >= HEAT.ready };
  }

  /** Drains after a pause without gains. Returns true when the whole-number value changed. */
  tick(dt: number, inCombat: boolean): boolean {
    this.sinceGain += dt;
    if (!inCombat || this.sinceGain < HEAT.drainDelay || this.value <= 0) return false;
    const before = Math.floor(this.value);
    this.value = Math.max(0, this.value - HEAT.drainRate * dt);
    return Math.floor(this.value) !== before;
  }

  reset(): void {
    this.value = 0;
    this.sinceGain = 0;
  }
}

/**
 * Only a couple of enemies may commit to an attack at once (the rest circle
 * and taunt), which is what makes group fights readable. Reserved holders
 * (lieutenant, boss) always get one but still count toward the pool.
 */
export class AttackTokens {
  private readonly holders = new Set<string>();

  constructor(private readonly max: number) {}

  get count(): number {
    return this.holders.size;
  }

  acquire(id: string, reserved: boolean): boolean {
    if (this.holders.has(id)) return true;
    if (!reserved && this.holders.size >= this.max) return false;
    this.holders.add(id);
    return true;
  }

  release(id: string): void {
    this.holders.delete(id);
  }

  has(id: string): boolean {
    return this.holders.has(id);
  }

  clear(): void {
    this.holders.clear();
  }
}

// ---------------------------------------------------------------------------
// Boss

export const BOSS_PHASE_RATIOS = [0.66, 0.33] as const;

export function bossPhaseFor(hpRatio: number): 1 | 2 | 3 {
  return hpRatio < BOSS_PHASE_RATIOS[1] ? 3 : hpRatio < BOSS_PHASE_RATIOS[0] ? 2 : 1;
}

/**
 * New boss HP after a hit: one hit can't skip a phase (each threshold stops the
 * damage so every phase transition plays), and only the finisher kills.
 */
export function clampBossHp(hp: number, damage: number, maxHp: number, phase: number): number {
  const floor = phase < BOSS_PHASE_RATIOS.length + 1 ? Math.ceil(maxHp * BOSS_PHASE_RATIOS[phase - 1]) - 1 : 1;
  return Math.max(Math.min(hp, Math.max(floor, 1)), hp - damage);
}

export const FINISHER_HP_RATIO = 0.08;

export function finisherReady(phase: number, hp: number, maxHp: number): boolean {
  return phase === 3 && hp <= maxHp * FINISHER_HP_RATIO;
}

/** A failed finisher QTE: Crow gets a second wind. */
export function finisherFailHp(hp: number, maxHp: number): number {
  return Math.min(maxHp, hp + Math.round(maxHp * 0.1));
}

// ---------------------------------------------------------------------------
// Dodge

export type DodgeClip = 'dodgeF' | 'dodgeB' | 'dodgeL' | 'dodgeR';

/** Dodge clip for a desired velocity relative to facing; no input = back-step. */
export function dodgeClipFor(facing: number, vx: number, vz: number): DodgeClip {
  if (vx * vx + vz * vz < 1e-6) return 'dodgeB';
  const fwd = Math.sin(facing) * vx + Math.cos(facing) * vz;
  const left = Math.cos(facing) * vx - Math.sin(facing) * vz;
  if (Math.abs(fwd) >= Math.abs(left)) return fwd > 0 ? 'dodgeF' : 'dodgeB';
  return left > 0 ? 'dodgeL' : 'dodgeR';
}

export type DodgeOutcome = 'hit' | 'perfect' | 'evade';

/** What happens to a hit arriving `t` seconds into a dodge. */
export function dodgeOutcome(t: number): DodgeOutcome {
  if (t < DODGE.iFrom || t > DODGE.iTo) return 'hit';
  return t <= DODGE.perfectTo ? 'perfect' : 'evade';
}
