/**
 * Pure camera math used by CameraRig (no three, no DOM).
 *
 * Conventions (see types.ts): with camera yaw ψ the horizontal forward is
 * (sin ψ, 0, cos ψ) and screen-right is (-cos ψ, 0, sin ψ). Pitch φ > 0 puts
 * the camera above the pivot, looking down.
 */
import { clamp, ease, lerpAngle } from './math';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export const PITCH_MIN = -0.35;
export const PITCH_MAX = 0.95;
/** Camera never gets closer to the pivot than this when pulled in by walls. */
export const MIN_COLLISION_DISTANCE = 0.8;
/** Stay this far in front of whatever the collision ray hit. */
export const COLLISION_MARGIN = 0.25;
/** Exponential rate at which the camera eases back out after an obstruction clears. */
export const COLLISION_EASE_OUT = 2.5;
/** Fraction of a punch spent reaching full strength. */
const PUNCH_ATTACK = 0.15;

/** Offset from pivot to camera for an orbit at (yaw, pitch, distance). Writes into `out`. */
export function orbitOffset<T extends Vec3Like>(yaw: number, pitch: number, distance: number, out: T): T {
  const horizontal = Math.cos(pitch) * distance;
  out.x = -Math.sin(yaw) * horizontal;
  out.y = Math.sin(pitch) * distance;
  out.z = -Math.cos(yaw) * horizontal;
  return out;
}

/** Yaw ψ whose forward (sin ψ, 0, cos ψ) points along (dx, dz). */
export function yawOfDirection(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Mouse → orbit: moving right turns right (yaw decreases), moving down looks down. */
export function applyMouseYaw(yaw: number, dx: number, sensitivity: number): number {
  return yaw - dx * sensitivity;
}

export function applyMousePitch(pitch: number, dy: number, sensitivity: number): number {
  return clamp(pitch + dy * sensitivity, PITCH_MIN, PITCH_MAX);
}

/** How far the camera may sit from the pivot given a collision hit distance (null = no hit). */
export function allowedDistance(hitDistance: number | null, full: number): number {
  if (hitDistance === null) return full;
  return Math.min(full, Math.max(MIN_COLLISION_DISTANCE, hitDistance - COLLISION_MARGIN));
}

/** Pull in instantly, ease back out slowly. `current` = Infinity means "no history". */
export function nextCollisionDistance(current: number, allowed: number, dt: number): number {
  if (allowed <= current) return allowed;
  return allowed + (current - allowed) * Math.exp(-COLLISION_EASE_OUT * dt);
}

/** FOV punch envelope over normalised time t ∈ [0, 1]: fast attack, smooth release, 0 outside. */
export function punchEnvelope(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  if (t < PUNCH_ATTACK) return ease('outQuad', t / PUNCH_ATTACK);
  return 1 - ease('inOutQuad', (t - PUNCH_ATTACK) / (1 - PUNCH_ATTACK));
}

/** Smooth pseudo-noise in [-1, 1]; different `seed`s give uncorrelated channels. */
export function shakeNoise(t: number, seed: number): number {
  return (
    0.5 * Math.sin(t * 23.1 + seed * 1.3) +
    0.3 * Math.sin(t * 37.7 + seed * 2.9) +
    0.2 * Math.sin(t * 57.3 + seed * 4.1)
  );
}

/** Frame-rate independent shortest-path angle smoothing. */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return lerpAngle(current, target, 1 - Math.exp(-lambda * dt));
}
