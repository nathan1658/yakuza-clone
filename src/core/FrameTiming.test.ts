import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator, TIME_SCALE_RECOVER_SEC, TimeScaleSchedule } from './FrameTiming';
import { FIXED_DT } from './types';

function run(s: TimeScaleSchedule, seconds: number, dt = 1 / 120): number {
  let v = s.value;
  for (let t = 0; t < seconds - 1e-9; t += dt) v = s.advance(dt);
  return v;
}

describe('TimeScaleSchedule', () => {
  it('starts at 1 and stays there', () => {
    const s = new TimeScaleSchedule();
    expect(s.value).toBe(1);
    expect(run(s, 5)).toBe(1);
  });

  it('applies immediately and holds forever without a duration', () => {
    const s = new TimeScaleSchedule();
    s.set(0.3);
    expect(s.value).toBe(0.3);
    expect(run(s, 30)).toBe(0.3);
  });

  it('holds for the real duration, then eases back to 1 over ~0.2 s', () => {
    const s = new TimeScaleSchedule();
    s.set(0.2, 1);
    expect(run(s, 0.99)).toBeCloseTo(0.2, 6);
    const mid = run(s, 0.01 + TIME_SCALE_RECOVER_SEC / 2);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(1);
    expect(run(s, TIME_SCALE_RECOVER_SEC / 2 + 0.02)).toBe(1);
  });

  it('recovery is monotonic', () => {
    const s = new TimeScaleSchedule();
    s.set(0.1, 0.05);
    let prev = s.value;
    for (let i = 0; i < 60; i++) {
      const v = s.advance(1 / 120);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(prev).toBe(1);
  });

  it('a new call replaces the previous schedule', () => {
    const s = new TimeScaleSchedule();
    s.set(0.2, 0.5);
    run(s, 0.4);
    s.set(0.5, 2);
    expect(s.value).toBe(0.5);
    expect(run(s, 1)).toBe(0.5); // the old 0.5 s hold no longer applies
    s.set(1);
    expect(run(s, 0.1)).toBe(1);
  });

  it('eases back from a speed-up too and sanitises input', () => {
    const s = new TimeScaleSchedule();
    s.set(2, 0.1);
    expect(run(s, 0.1 + TIME_SCALE_RECOVER_SEC + 0.02)).toBe(1);
    s.set(-3);
    expect(s.value).toBe(0);
    s.set(Number.NaN);
    expect(s.value).toBe(1);
  });
});

describe('FixedStepAccumulator', () => {
  it('runs one step per 60 Hz frame on average', () => {
    const acc = new FixedStepAccumulator(FIXED_DT, 5);
    let steps = 0;
    for (let i = 0; i < 600; i++) steps += acc.take(1 / 60);
    expect(steps).toBeGreaterThanOrEqual(599);
    expect(steps).toBeLessThanOrEqual(600);
  });

  it('runs every other frame at 120 Hz and never when dt is 0', () => {
    const acc = new FixedStepAccumulator(FIXED_DT, 5);
    let steps = 0;
    for (let i = 0; i < 240; i++) steps += acc.take(1 / 120);
    expect(steps).toBeGreaterThanOrEqual(119);
    expect(steps).toBeLessThanOrEqual(120);
    const before = acc.remainder;
    expect(acc.take(0)).toBe(0);
    expect(acc.remainder).toBe(before);
  });

  it('caps a long frame at maxSteps and drops the excess', () => {
    const acc = new FixedStepAccumulator(FIXED_DT, 5);
    expect(acc.take(0.1)).toBe(5); // 0.1 s = 6 steps due
    expect(acc.remainder).toBeLessThan(FIXED_DT);
    expect(acc.take(0)).toBe(0);
  });

  it('keeps the sub-step remainder for the next frame', () => {
    const acc = new FixedStepAccumulator(FIXED_DT, 5);
    expect(acc.take(FIXED_DT * 1.5)).toBe(1);
    expect(acc.remainder).toBeCloseTo(FIXED_DT * 0.5, 9);
    expect(acc.take(FIXED_DT * 0.5)).toBe(1);
  });
});
