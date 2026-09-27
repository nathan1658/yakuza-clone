/** Lookahead scheduling math (driven by a 25 ms timer, scheduled on AudioContext time). */
export const TICK_MS = 25;
export const LOOKAHEAD = 0.12;

export interface Clock {
  /** AudioContext time of the next unscheduled step. */
  next: number;
  step: number;
  readonly stepDur: number;
}

export function makeClock(start: number, bpm: number, stepsPerBeat = 4): Clock {
  return { next: start, step: 0, stepDur: 60 / bpm / stepsPerBeat };
}

/**
 * Hand every step starting before `now + horizon` to `onStep`, in order.
 * After a stall longer than the horizon (background tab, debugger) the clock
 * resyncs to `now` instead of flooding the backlog as a burst of notes.
 */
export function pump(c: Clock, now: number, horizon: number, onStep: (step: number, t: number) => void): void {
  if (c.next < now - horizon) c.next = now + 0.005;
  while (c.next < now + horizon) {
    onStep(c.step, c.next);
    c.step++;
    c.next += c.stepDur;
  }
}
