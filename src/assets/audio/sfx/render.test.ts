import { describe, expect, it } from 'vitest';
import { seedFrom } from '../synth/rng';
import { normalise } from './render';

describe('normalise', () => {
  it('scales the peak to the target level and fades the tail to zero', () => {
    const d = new Float32Array([0.1, -0.5, 0.25, 0.2, 0.2, 0.2]);
    expect(normalise(d, 0.8, 3)).toBeCloseTo(0.5);
    expect(Math.max(...d.map(Math.abs))).toBeCloseTo(0.8);
    expect(d[1]).toBeCloseTo(-0.8);
    expect(d[5]).toBe(0);
    expect(d[4]).toBeLessThan(d[3]);
  });
  it('leaves silence silent', () => {
    const d = new Float32Array(8);
    expect(normalise(d, 0.9, 4)).toBe(0);
    expect(d.every((x) => x === 0)).toBe(true);
  });
});

describe('seedFrom', () => {
  it('is stable and distinguishes ids', () => {
    expect(seedFrom('punch_light')).toBe(seedFrom('punch_light'));
    expect(seedFrom('punch_light')).not.toBe(seedFrom('punch_heavy'));
  });
});
