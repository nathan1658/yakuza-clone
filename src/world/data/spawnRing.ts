import type { Rng } from './rng';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const ATTEMPTS_PER_POINT = 16;
/** Spawned bodies must not overlap each other. */
const MIN_SEPARATION = 1;

/**
 * Up to `count` points in the ring [minR, maxR] accepted by `ok`. Angles walk
 * the golden angle from a random start so consecutive picks spread around the
 * centre; radii are area-uniform. Returns fewer points when the ring is
 * mostly walls or water.
 */
export function sampleRing(
  rng: Rng,
  cx: number,
  cz: number,
  minR: number,
  maxR: number,
  count: number,
  ok: (x: number, z: number) => boolean,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const r0 = Math.max(0, Math.min(minR, maxR)) ** 2;
  const r1 = Math.max(minR, maxR) ** 2;
  let angle = rng() * Math.PI * 2;
  for (let i = 0; i < count * ATTEMPTS_PER_POINT && out.length < count; i++) {
    angle += GOLDEN_ANGLE;
    const r = Math.sqrt(r0 + (r1 - r0) * rng());
    const x = cx + Math.cos(angle) * r;
    const z = cz + Math.sin(angle) * r;
    if (ok(x, z) && !out.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < MIN_SEPARATION ** 2)) out.push([x, z]);
  }
  return out;
}
