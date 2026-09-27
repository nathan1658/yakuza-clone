import { describe, expect, it } from 'vitest';
import { LOOKAHEAD, TICK_MS, makeClock, pump } from './clock';

describe('lookahead clock', () => {
  it('uses 16th steps from bpm', () => {
    expect(makeClock(0, 120).stepDur).toBeCloseTo(0.125);
    expect(makeClock(0, 150).stepDur).toBeCloseTo(0.1);
  });

  it('schedules only steps inside the lookahead window', () => {
    const c = makeClock(1, 120);
    const got: number[] = [];
    pump(c, 1, LOOKAHEAD, (_s, t) => got.push(t));
    expect(got).toEqual([1]);
    pump(c, 1.01, LOOKAHEAD, (_s, t) => got.push(t));
    expect(got).toEqual([1, 1.125]);
  });

  it('covers every step exactly once under a jittery timer', () => {
    const c = makeClock(0, 150);
    const steps: number[] = [];
    let now = 0;
    for (let i = 0; i < 400; i++) {
      now += (TICK_MS / 1000) * (0.5 + ((i * 7919) % 100) / 100);
      pump(c, now, LOOKAHEAD, (s, t) => {
        expect(t).toBeLessThan(now + LOOKAHEAD);
        expect(t).toBeCloseTo(s * 0.1, 9);
        steps.push(s);
      });
    }
    expect(steps).toEqual(steps.map((_, i) => i));
    expect(c.next).toBeGreaterThanOrEqual(now + LOOKAHEAD);
  });

  it('resyncs after a stall instead of bursting', () => {
    const c = makeClock(0, 120);
    pump(c, 0, LOOKAHEAD, () => {});
    let n = 0;
    pump(c, 5, LOOKAHEAD, () => n++);
    expect(n).toBe(1); // one step at ~5.005, not 40 missed steps
    expect(c.step).toBe(2);
  });
});
