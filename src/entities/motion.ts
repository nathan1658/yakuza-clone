/** Pure motion math shared by Character, PlayerController and separation. */
import type { Vector3 } from 'three';
import type { AnimClip } from '../core/types';
import { LOCO_SPEED } from './anim/clips/locomotion';

/** Below this horizontal speed (m/s) a character counts as standing still. */
export const STILL_SPEED = 0.25;
const WALK_MAX = 2.2;
const RUN_MAX = 5.5;
const RATE_MIN = 0.6;
const RATE_MAX = 1.6;

/**
 * ANIMATION RULE locomotion pick. (vx, vz) is the horizontal velocity,
 * `facing` the yaw; combat stance picks the strafe clip by the dominant
 * local axis (right of yaw θ is (−cos θ, 0, sin θ)).
 */
export function locomotionClip(stance: 'normal' | 'combat', idle: AnimClip, vx: number, vz: number, facing: number): AnimClip {
  const speed = Math.hypot(vx, vz);
  if (stance === 'normal') {
    if (speed < STILL_SPEED) return idle;
    return speed < WALK_MAX ? 'walk' : speed < RUN_MAX ? 'run' : 'sprint';
  }
  if (speed < STILL_SPEED) return 'combatIdle';
  const s = Math.sin(facing);
  const c = Math.cos(facing);
  const fwd = vx * s + vz * c;
  const right = vz * s - vx * c;
  if (Math.abs(fwd) >= Math.abs(right)) return fwd > 0 ? 'combatWalkF' : 'combatWalkB';
  return right > 0 ? 'combatWalkR' : 'combatWalkL';
}

/** Playback rate that keeps a gait clip's feet planted at `speed`; 1 for non-gait clips. */
export function locomotionRate(clip: AnimClip, speed: number): number {
  const natural = LOCO_SPEED[clip];
  return natural ? Math.min(RATE_MAX, Math.max(RATE_MIN, speed / natural)) : 1;
}

/**
 * Camera-relative input: x = right, y = forward (|x,y| ≤ 1 after clamping);
 * camera forward is (sin ψ, 0, cos ψ), right (−cos ψ, 0, sin ψ).
 */
export function cameraRelative(x: number, y: number, yaw: number, out: Vector3): Vector3 {
  const len = Math.hypot(x, y);
  const k = len > 1 ? 1 / len : 1;
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return out.set((y * s - x * c) * k, 0, (y * c + x * s) * k);
}

/** Move horizontal `cur` toward `target` by at most `maxStep` (m/s). */
export function approach(cur: Vector3, target: Vector3, maxStep: number): Vector3 {
  const dx = target.x - cur.x;
  const dz = target.z - cur.z;
  const d = Math.hypot(dx, dz);
  if (d <= maxStep) return cur.set(target.x, 0, target.z);
  return cur.set(cur.x + (dx / d) * maxStep, 0, cur.z + (dz / d) * maxStep);
}

/**
 * Soft separation of two discs: writes into `out` the horizontal correction
 * for A (B's is the opposite), `k` being the fraction of the overlap
 * resolved this call. Returns false if they don't overlap. Coincident
 * centres split along +X so the special case still separates.
 */
export function separation(ax: number, az: number, bx: number, bz: number, minDist: number, k: number, out: Vector3): boolean {
  const dx = ax - bx;
  const dz = az - bz;
  const d = Math.hypot(dx, dz);
  if (d >= minDist) return false;
  const push = (minDist - d) * k;
  if (d > 1e-6) out.set((dx / d) * push, 0, (dz / d) * push);
  else out.set(push, 0, 0);
  return true;
}

/**
 * Steer a walker with velocity `vel` around an obstacle at offset (dx, dz)
 * (walker minus obstacle) inside `radius`: a radial push plus an equal
 * tangential one on the side the walker is already heading (right-hand pass
 * when head-on), so it slides past instead of stalling against it.
 */
export function steerAround(vel: Vector3, dx: number, dz: number, radius: number, gain: number): Vector3 {
  const d = Math.hypot(dx, dz);
  if (d >= radius || d < 1e-4) return vel;
  const push = ((radius - d) * gain) / d;
  const s = vel.z * dx - vel.x * dz > 0 ? 1 : -1;
  vel.x += (dx - s * dz) * push;
  vel.z += (dz + s * dx) * push;
  return vel;
}
