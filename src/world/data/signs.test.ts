import { describe, expect, it } from 'vitest';
import { HENNESSY } from './layout';
import { SIGN_CLEARANCE, SIGNS } from './signs';

/** Horizontal half extents of a board's footprint (x, z). */
function extent(yaw: number, w: number, depth: number): [number, number] {
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  return [(w / 2) * c + (depth / 2) * s, (w / 2) * s + (depth / 2) * c];
}

describe('signs', () => {
  it('has a street full of them', () => {
    expect(SIGNS.length).toBeGreaterThan(150);
    expect(SIGNS.length).toBeLessThan(700);
  });

  it('hangs projecting boards above head and truck height', () => {
    for (const s of SIGNS) if (s.twoSided) expect(s.y - s.h / 2, s.text).toBeGreaterThanOrEqual(SIGN_CLEARANCE);
  });

  it('keeps the tram envelope on Hennessy Road clear', () => {
    for (const s of SIGNS) {
      if (Math.abs(s.x) > HENNESSY.farX) continue;
      const [, ez] = extent(s.yaw, s.w, s.depth);
      for (const track of [HENNESSY.trackN, HENNESSY.trackS]) {
        const gap = Math.abs(s.z - track) - ez;
        expect(gap, `${s.text} at ${s.x.toFixed(1)},${s.z.toFixed(1)}`).toBeGreaterThan(HENNESSY.tramHalfWidth + 0.3);
      }
    }
  });

  it('never overlaps two boards', () => {
    const boxes = SIGNS.map((s) => {
      const [ex, ez] = extent(s.yaw, s.w, s.depth);
      return { s, ex, ez };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const hit =
          Math.abs(a.s.x - b.s.x) < a.ex + b.ex &&
          Math.abs(a.s.z - b.s.z) < a.ez + b.ez &&
          Math.abs(a.s.y - b.s.y) < (a.s.h + b.s.h) / 2;
        expect(hit, `${a.s.text} / ${b.s.text}`).toBe(false);
      }
    }
  });
});
