import { describe, expect, it } from 'vitest';
import { eqPower } from './fade';

describe('eqPower', () => {
  it('hits both endpoints', () => {
    expect(eqPower(0, 1, 0)).toBe(0);
    expect(eqPower(0, 1, 1)).toBeCloseTo(1, 12);
    expect(eqPower(0.8, 0, 0)).toBe(0.8);
    expect(eqPower(0.8, 0, 1)).toBeCloseTo(0, 12);
  });

  it('keeps summed power constant across a full crossfade', () => {
    for (let x = 0; x <= 1; x += 0.125) {
      const a = eqPower(1, 0, x);
      const b = eqPower(0, 1, x);
      expect(a * a + b * b).toBeCloseTo(1, 10);
    }
  });

  it('is monotonic in both directions', () => {
    let up = -1;
    let down = 2;
    for (let x = 0; x <= 1; x += 0.05) {
      expect(eqPower(0.2, 0.9, x)).toBeGreaterThanOrEqual(up);
      expect(eqPower(0.9, 0.2, x)).toBeLessThanOrEqual(down);
      up = eqPower(0.2, 0.9, x);
      down = eqPower(0.9, 0.2, x);
    }
  });
});
