import { describe, expect, it } from 'vitest';
import { isHittable, STANDING, strikeScore } from './hitTest';

const DEG = Math.PI / 180;
const at = (x: number, z: number, y = 0) => ({ x, y, z });

describe('strikeScore', () => {
  const origin = at(0, 0);

  it('hits a target straight ahead within reach', () => {
    // Facing yaw 0 = +Z.
    expect(strikeScore(origin, 0, at(0, 1.2), 0.35, 1.2, 70 * DEG)).toBeCloseTo(1.2);
  });

  it('measures reach to the capsule surface, not the centre', () => {
    expect(strikeScore(origin, 0, at(0, 1.5), 0.35, 1.2, 70 * DEG)).toBeCloseTo(1.5);
    expect(strikeScore(origin, 0, at(0, 1.6), 0.35, 1.2, 70 * DEG)).toBe(Infinity);
  });

  it('misses targets outside the cone', () => {
    expect(strikeScore(origin, 0, at(1.0, 0.2), 0.35, 1.5, 70 * DEG)).toBe(Infinity);
    expect(strikeScore(origin, 0, at(0, -1.0), 0.35, 1.5, 300 * DEG)).toBe(Infinity);
  });

  it('always hits overlapping bodies regardless of facing', () => {
    expect(strikeScore(origin, 0, at(0, -0.5), 0.35, 1.2, 70 * DEG)).toBeCloseTo(0.5);
  });

  it('whiffs over targets far above or below', () => {
    expect(strikeScore(origin, 0, at(0, 1, 2), 0.35, 1.2, 70 * DEG)).toBe(Infinity);
  });

  it('ranks the centred target above an equally far one off-axis', () => {
    const centred = strikeScore(origin, 0, at(0, 1.2), 0.35, 1.5, 110 * DEG);
    const offAxis = strikeScore(origin, 0, at(Math.sin(40 * DEG) * 1.2, Math.cos(40 * DEG) * 1.2), 0.35, 1.5, 110 * DEG);
    expect(centred).toBeLessThan(offAxis);
  });
});

describe('isHittable', () => {
  it('protects bodies in the air, falling, rising or in a heat action', () => {
    for (const s of ['ko', 'airborne', 'knockdown', 'gettingUp', 'heatLocked'] as const) {
      expect(isHittable(s, true)).toBe(false);
    }
  });

  it('lets only stomps hit the downed', () => {
    expect(isHittable('downed', false)).toBe(false);
    expect(isHittable('downed', true)).toBe(true);
  });

  it('hits anyone on their feet', () => {
    for (const s of STANDING) expect(isHittable(s, false)).toBe(true);
  });
});
