/**
 * The invisible ring that keeps a street fight in one place: a polygon of
 * thin static boxes. Pure geometry, unit tested.
 */

export interface RingSegment {
  x: number;
  z: number;
  rotY: number;
  halfX: number;
  halfY: number;
  halfZ: number;
}

export const ARENA_WALL = { halfHeight: 1.5, halfThickness: 0.25, overlap: 0.3, maxRadius: 18, margin: 1.5 } as const;

/**
 * `n` boxes whose inner faces lie on the chords of a circle of `radius`.
 * rotY = θ turns a box's local +Z to (sin θ, cos θ): Z is radial, X tangential.
 * Each box is widened a little so neighbours overlap and leave no gaps.
 */
export function arenaRingSegments(cx: number, cz: number, radius: number, n = 20): RingSegment[] {
  const out: RingSegment[] = [];
  const half = Math.PI / n;
  const centreDist = radius * Math.cos(half) + ARENA_WALL.halfThickness;
  for (let i = 0; i < n; i++) {
    const theta = (i + 0.5) * 2 * half;
    out.push({
      x: cx + Math.sin(theta) * centreDist,
      z: cz + Math.cos(theta) * centreDist,
      rotY: theta,
      halfX: radius * Math.sin(half) + ARENA_WALL.overlap,
      halfY: ARENA_WALL.halfHeight,
      halfZ: ARENA_WALL.halfThickness,
    });
  }
  return out;
}

/** Big enough to contain everyone taking part, never absurdly large. */
export function arenaRadiusFor(defRadius: number, farthest: number): number {
  return Math.min(ARENA_WALL.maxRadius, Math.max(defRadius, farthest + ARENA_WALL.margin));
}
