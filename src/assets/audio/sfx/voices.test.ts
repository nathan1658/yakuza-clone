import { describe, expect, it } from 'vitest';
import { distanceGain, MAX_DISTANCE, pickVariant, pickVictim, spreadRate } from './voices';

describe('distanceGain', () => {
  it('is 1 inside the reference distance and falls off monotonically', () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(3)).toBe(1);
    expect(distanceGain(10)).toBeLessThan(distanceGain(5));
    expect(distanceGain(MAX_DISTANCE)).toBeGreaterThan(0);
  });
});

describe('pickVictim', () => {
  it('steals the quietest remaining contribution', () => {
    const voices = [
      { loudness: 0.9, start: 0, end: 2 },
      { loudness: 0.2, start: 0.5, end: 1.5 },
      { loudness: 0.9, start: 0.9, end: 1.01 },
    ];
    expect(pickVictim(voices, 1)).toBe(2);
  });
  it('breaks ties by age', () => {
    const voices = [
      { loudness: 0.5, start: 0.4, end: 2 },
      { loudness: 0.5, start: 0.2, end: 2 },
      { loudness: 0.5, start: 0.3, end: 2 },
    ];
    expect(pickVictim(voices, 1)).toBe(1);
  });
  it('treats finished voices as free', () => {
    expect(pickVictim([{ loudness: 1, start: 0, end: 3 }, { loudness: 1, start: 0, end: 0.5 }], 1)).toBe(1);
  });
});

describe('pickVariant', () => {
  it('never repeats the last variant and covers all others', () => {
    const seen = new Set<number>();
    for (let r = 0; r < 1; r += 0.01) {
      const i = pickVariant(4, 2, r);
      expect(i).not.toBe(2);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(4);
      seen.add(i);
    }
    expect([...seen].sort()).toEqual([0, 1, 3]);
  });
  it('returns 0 for single-variant sounds and handles no history', () => {
    expect(pickVariant(1, 0, 0.7)).toBe(0);
    expect(pickVariant(3, -1, 0)).toBe(0);
    expect(pickVariant(3, -1, 0.99)).toBe(2);
  });
});

describe('spreadRate', () => {
  it('stays within ±5% of the requested pitch', () => {
    expect(spreadRate(1, 0)).toBeCloseTo(0.95);
    expect(spreadRate(1, 1)).toBeCloseTo(1.05);
    expect(spreadRate(2, 0.5)).toBe(2);
  });
});
