import { describe, expect, it } from 'vitest';
import { ease, turnTowards, wrapAngle, yawTo } from './math';

describe('math', () => {
  it('ease endpoints are exact for every curve', () => {
    for (const n of ['linear', 'inQuad', 'outQuad', 'inOutQuad', 'inCubic', 'outCubic', 'inOutCubic', 'outBack', 'outExpo'] as const) {
      expect(ease(n, 0)).toBeCloseTo(0, 6);
      expect(ease(n, 1)).toBeCloseTo(1, 6);
    }
  });

  it('wrapAngle maps into (-π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngle(2 * Math.PI + 0.1)).toBeCloseTo(0.1);
  });

  it('yawTo follows the facing convention (sin θ, 0, cos θ)', () => {
    expect(yawTo({ x: 0, z: 0 }, { x: 0, z: 5 })).toBeCloseTo(0); // south
    expect(Math.abs(yawTo({ x: 0, z: 0 }, { x: 0, z: -5 }))).toBeCloseTo(Math.PI); // north
    expect(yawTo({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2); // east
  });

  it('turnTowards takes the short way and clamps', () => {
    expect(turnTowards(Math.PI - 0.1, -Math.PI + 0.1, 0.05)).toBeCloseTo(Math.PI - 0.05);
    expect(turnTowards(0, 0.02, 0.05)).toBeCloseTo(0.02);
  });
});
