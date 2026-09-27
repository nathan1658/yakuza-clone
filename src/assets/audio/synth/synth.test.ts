import { describe, expect, it } from 'vitest';
import { pluck } from './karplus';
import { fillNoise } from './noise';
import { driveCurve } from './shaper';
import { fillImpulse } from './reverb';
import { mulberry32 } from './rng';

function rms(a: Float32Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / (to - from));
}

/** Period (samples) with the strongest autocorrelation in [lo, hi]. */
function period(a: Float32Array, lo: number, hi: number): number {
  let best = lo, bestScore = -Infinity;
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let i = 2000; i < 12000; i++) s += a[i] * a[i + lag];
    if (s > bestScore) { bestScore = s; best = lag; }
  }
  return best;
}

describe('karplus-strong', () => {
  it('is bounded, decays and is in tune', () => {
    const sr = 48000;
    const out = pluck(sr, 220, 1.5, { damping: 0.996, bright: 0.6 });
    expect(out.length).toBe(72000);
    expect(Math.max(...out.map(Math.abs))).toBeLessThanOrEqual(1.01);
    expect(rms(out, 60000, 72000)).toBeLessThan(rms(out, 0, 12000) * 0.5);
    expect(period(out, 200, 240)).toBe(218); // 48000 / 220 = 218.18
  });

  it('tunes high notes via the fractional all-pass', () => {
    const out = pluck(48000, 659.26, 0.5);
    expect(Math.abs(period(out, 65, 80) - 48000 / 659.26)).toBeLessThan(0.6);
  });
});

describe('noise, drive, impulse', () => {
  it('noise colours are normalised to peak 1', () => {
    for (const kind of ['white', 'pink', 'brown'] as const) {
      const d = new Float32Array(20000);
      fillNoise(kind, d);
      expect(Math.max(...d.map(Math.abs))).toBeCloseTo(1, 6);
    }
  });

  it('drive curve is odd-symmetric and bounded', () => {
    const c = driveCurve(3);
    expect(c[0]).toBeCloseTo(-1, 6);
    expect(c[c.length - 1]).toBeCloseTo(1, 6);
    expect(c[100]).toBeCloseTo(-c[c.length - 101], 6);
    expect(driveCurve(3)).toBe(c);
  });

  it('impulse decays to silence', () => {
    const d = new Float32Array(48000 * 2);
    fillImpulse(d, 48000, 2, 1);
    expect(Math.abs(d[d.length - 1])).toBeLessThan(1e-4);
    expect(rms(d, 0, 4800)).toBeGreaterThan(rms(d, 72000, 96000) * 10);
  });

  it('rng is deterministic', () => {
    const a = mulberry32(5), b = mulberry32(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
