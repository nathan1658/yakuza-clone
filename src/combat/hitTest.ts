/**
 * Pure hit geometry: which bodies a strike reaches, and which combat states
 * can be hit at all. Scene-free so it is unit tested.
 */
import { wrapAngle, yawTo } from '../core/math';
import type { CombatState } from '../core/types';

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/** A strike whiffs over/under anyone this far above or below the attacker's feet. */
const MAX_DY = 1.5;
/** Capsules this close overlap: the cone test would be meaningless, so they're hit. */
const OVERLAP_SLACK = 0.3;
/** Metres one radian off-centre is worth when ranking targets. */
const ANGLE_WEIGHT = 0.8;

/**
 * Ranking score of a target for a strike (lower is better), or Infinity when
 * it is out of reach or outside the cone. `from`/`to` are foot positions,
 * `radius` the target's capsule radius, `arc` the full cone width.
 */
export function strikeScore(from: XYZ, facing: number, to: XYZ, radius: number, reach: number, arc: number): number {
  if (Math.abs(to.y - from.y) > MAX_DY) return Infinity;
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  if (dist - radius > reach) return Infinity;
  if (dist < radius + OVERLAP_SLACK) return dist;
  const angle = Math.abs(wrapAngle(yawTo(from, to) - facing));
  return angle <= arc / 2 ? dist + ANGLE_WEIGHT * angle : Infinity;
}

/**
 * Can a strike connect with someone in `state`? Bodies in the air, falling,
 * getting up or locked in a heat action are untouchable; the downed only take
 * moves made for hitting the downed (stomps).
 */
export function isHittable(state: CombatState, hitsDowned: boolean): boolean {
  switch (state) {
    case 'ko':
    case 'airborne':
    case 'knockdown':
    case 'gettingUp':
    case 'heatLocked':
      return false;
    case 'downed':
      return hitsDowned;
    default:
      return true;
  }
}

/** Standing and able to act or be grabbed / heat-actioned from the front. */
export const STANDING: ReadonlySet<CombatState> = new Set<CombatState>([
  'idle', 'moving', 'attacking', 'guarding', 'dodging', 'hitstun', 'staggered', 'grabbed',
]);
