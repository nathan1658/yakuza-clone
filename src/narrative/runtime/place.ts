/**
 * Where to put people. Anchors come from world.getLocation(); every offset
 * is checked with world.isWalkable() and pulled back towards the anchor
 * until it lands on open ground, so a staging slot never ends up in a wall.
 */
import { Vector3 } from 'three';
import type { GameContext, LocationId } from '../../core/types';

export function anchor(ctx: GameContext, at: LocationId): { position: Vector3; yaw: number } {
  const loc = ctx.world.getLocation(at);
  return { position: loc.position.clone(), yaw: loc.yaw };
}

/** `p`, or the first walkable point on the way back to `home`. */
export function walkableTowards(ctx: GameContext, p: Vector3, home: Vector3): Vector3 {
  for (const t of [0, 0.25, 0.5, 0.75]) {
    const q = p.clone().lerp(home, t);
    if (ctx.world.isWalkable(q)) return q;
  }
  return home.clone();
}

/** `forward` metres along the anchor's facing and `right` metres to its right. */
export function relative(ctx: GameContext, at: LocationId, forward: number, right = 0): Vector3 {
  const a = anchor(ctx, at);
  const f = new Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
  const p = a.position.clone().addScaledVector(f, forward).add(new Vector3(-f.z, 0, f.x).multiplyScalar(right));
  return walkableTowards(ctx, p, a.position);
}

/** First walkable world-space XZ offset from the anchor (the anchor itself when none is). */
export function firstWalkable(ctx: GameContext, at: LocationId, offsets: ReadonlyArray<readonly [number, number]>): Vector3 {
  const base = anchor(ctx, at).position;
  for (const [dx, dz] of offsets) {
    const p = base.clone().add(new Vector3(dx, 0, dz));
    if (ctx.world.isWalkable(p)) return p;
  }
  return base;
}

/** Yaw that looks from `from` to `to` (see conventions: yaw θ faces (sin θ, 0, cos θ)). */
export function yawTo(from: Vector3, to: Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/**
 * The point `gap` metres short of `to`, coming from `from` (for walking up
 * to someone). Already that close: `from` itself, so nobody backs away.
 */
export function approach(from: Vector3, to: Vector3, gap: number): Vector3 {
  const d = new Vector3(from.x - to.x, 0, from.z - to.z);
  if (d.length() <= gap) return from.clone();
  return to.clone().addScaledVector(d.normalize(), gap);
}
