/**
 * Pure frame-timing helpers used by GameEngine (no DOM, no three).
 */
import { ease } from './math';

/** Real seconds the time scale takes to ease back to 1 after a timed hold. */
export const TIME_SCALE_RECOVER_SEC = 0.2;

/**
 * Time-scale schedule: `set(scale)` applies immediately and holds forever;
 * `set(scale, realDuration)` holds for `realDuration` real seconds, then eases
 * back to 1 over TIME_SCALE_RECOVER_SEC. A new set() replaces the schedule.
 */
export class TimeScaleSchedule {
  private current = 1;
  private from = 1;
  private holdLeft = Infinity;
  private recoverLeft = 0;

  get value(): number {
    return this.current;
  }

  set(scale: number, realDuration?: number): void {
    const s = Number.isFinite(scale) ? Math.max(0, scale) : 1;
    this.current = s;
    this.from = s;
    this.holdLeft = realDuration === undefined ? Infinity : Math.max(0, realDuration);
    this.recoverLeft = TIME_SCALE_RECOVER_SEC;
  }

  /** Advance by one frame of real time; returns the scale to use this frame. */
  advance(realDt: number): number {
    this.holdLeft -= realDt;
    if (this.holdLeft > 0) return this.current;
    const overshoot = -this.holdLeft;
    this.holdLeft = 0;
    this.recoverLeft = Math.max(0, this.recoverLeft - overshoot);
    const t = ease('inOutQuad', this.recoverLeft / TIME_SCALE_RECOVER_SEC);
    this.current = 1 + (this.from - 1) * t;
    return this.current;
  }
}

/**
 * Fixed-step accumulator. `take(dt)` adds scaled time and returns how many
 * fixed steps to run now (at most `maxSteps`); time beyond that is dropped so a
 * slow frame never snowballs into a spiral of death.
 */
export class FixedStepAccumulator {
  private acc = 0;

  constructor(
    readonly step: number,
    readonly maxSteps: number,
  ) {}

  /** Leftover time (< step) carried into the next frame. */
  get remainder(): number {
    return this.acc;
  }

  take(dt: number): number {
    this.acc += Math.max(0, dt);
    const due = Math.floor(this.acc / this.step);
    const steps = Math.min(due, this.maxSteps);
    const left = due > this.maxSteps ? this.acc % this.step : this.acc - steps * this.step;
    this.acc = Math.max(0, left);
    return steps;
  }
}
