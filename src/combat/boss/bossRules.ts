/**
 * 烏鴉's decisions as pure functions: what he does with an attack turn in each
 * phase, which string he throws, and where the 大排檔 tables stand. The phases
 * themselves (HP thresholds, armour, kneel) are Combat's BossPhases.
 * Scene-free so it is unit tested (boss.test.ts).
 */
import { TAU } from '../../core/math';
import { PATTERNS, type MoveId } from '../moves';
import { BOSS_PHASES } from '../tables';

export type Pattern = readonly MoveId[];
export type BossPlan = 'string' | 'rush' | 'flip' | 'grab';
export type PhaseDef = (typeof BOSS_PHASES)[number];

export interface XZ {
  x: number;
  z: number;
}

/** A player guarding this long gets grabbed (phase 3). */
export const TURTLE_TIME = 1.2;
/** The grab's windup starts this close, centre to centre (metres). */
export const GRAB_RANGE = 1.8;
/** Chance to grab a player who isn't turtling, when already that close. */
export const GRAB_CHANCE = 0.3;
/** The rush closes gaps in this band; closer than that he just walks in. */
export const RUSH_BAND: readonly [number, number] = [3.5, 6.5];
export const RUSH_CHANCE = 0.45;
/** He walks to a table at most this far away; beyond it he skips the flip. */
export const TABLE_WALK = 6;
/** Close enough to the table to heave it. */
export const FLIP_REACH = 2;
/** No flip at a player further than this: the table would land short. */
export const FLIP_PLAYER_MAX = 7;
/** Tables stand on this ring around the arena centre (metres)... */
export const TABLE_RING: readonly [number, number] = [4, 7];
/** ...within this angle either side of the `toward` direction (radians). */
export const TABLE_SPREAD = 1.2;

/** BOSS_PHASES row for a 1-based phase (0, before the fight starts, reads as 1). */
export function phaseDef(phase: number): PhaseDef {
  return BOSS_PHASES[Math.min(Math.max(phase, 1), BOSS_PHASES.length) - 1];
}

export interface BossView {
  phase: number;
  /** Boss to player, metres. */
  dist: number;
  /** The flip cooldown has run out. */
  flipReady: boolean;
  /** Boss to the nearest standing table, metres (Infinity if none). */
  tableDist: number;
  /** Seconds the player has been guarding. */
  turtle: number;
  /** 0..1 */
  roll: number;
}

/** What 烏鴉 does with an attack turn. */
export function choosePlan(v: BossView): BossPlan {
  const def = phaseDef(v.phase);
  const canFlip = v.flipReady && Number.isFinite(def.flipCooldown);
  if (canFlip && v.tableDist <= TABLE_WALK && v.dist <= FLIP_PLAYER_MAX) return 'flip';
  const close = v.dist <= GRAB_RANGE && v.roll < GRAB_CHANCE;
  if (def.grab && (v.turtle >= TURTLE_TIME || close)) return 'grab';
  if (v.dist >= RUSH_BAND[0] && v.dist <= RUSH_BAND[1] && v.roll < RUSH_CHANCE) return 'rush';
  return 'string';
}

/** Phase 1 boxes (PATTERNS.boss1); from phase 2 on he throws the heavier set. */
export function patternFor(phase: number, roll: number): Pattern {
  const set = phase >= 2 ? PATTERNS.boss2 : PATTERNS.boss1;
  return set[Math.min(set.length - 1, Math.floor(roll * set.length))];
}

/** Index of the nearest spot within `maxDist` of `from` (null spots are taken), or -1. */
export function nearestTable(spots: readonly (XZ | null)[], from: XZ, maxDist: number): number {
  let best = -1;
  let bestD = maxDist;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    if (!s) continue;
    const d = Math.hypot(s.x - from.x, s.z - from.z);
    if (d > bestD) continue;
    best = i;
    bestD = d;
  }
  return best;
}

/**
 * Where `count` tables stand: fanned out over TABLE_SPREAD either side of the
 * direction from `center` to the point `toward`, alternating near and far so
 * neighbours never overlap.
 */
export function tableRing(center: XZ, toward: XZ, count: number, rand: () => number): { x: number; z: number; yaw: number }[] {
  const base = Math.atan2(toward.x - center.x, toward.z - center.z);
  const [near, far] = TABLE_RING;
  const spots: { x: number; z: number; yaw: number }[] = [];
  for (let i = 0; i < count; i++) {
    const lane = count > 1 ? i / (count - 1) - 0.5 : 0;
    const a = base + TABLE_SPREAD * (lane * 1.6 + (rand() - 0.5) * 0.3);
    const r = near + ((far - near) * ((i % 2) + rand())) / 2;
    spots.push({ x: center.x + Math.sin(a) * r, z: center.z + Math.cos(a) * r, yaw: rand() * TAU });
  }
  return spots;
}
