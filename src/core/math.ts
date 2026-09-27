/**
 * Tiny shared math helpers. Lead-owned; every module may import from here.
 * Keep it small: if only one module needs it, it belongs in that module.
 */
import type { EaseName } from './types';

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const EASES: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
};

/** Eased value of t (clamped to 0..1). Undefined name = linear. */
export function ease(name: EaseName | undefined, t: number): number {
  return EASES[name ?? 'linear'](clamp(t, 0, 1));
}

/** Frame-rate independent exponential smoothing towards `target`. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a <= 0) a += TAU;
  return a - Math.PI;
}

/** Shortest-path angle interpolation. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/** Yaw that faces from `from` towards `to` (yaw θ faces (sin θ, 0, cos θ)). */
export function yawTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Rotate `current` yaw towards `target` by at most `maxStep` radians. */
export function turnTowards(current: number, target: number, maxStep: number): number {
  const d = wrapAngle(target - current);
  return Math.abs(d) <= maxStep ? target : current + Math.sign(d) * maxStep;
}
