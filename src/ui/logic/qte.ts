import type { InputAction } from '../../core/types';

/**
 * Buttons that count as an answer during a QTE. Their primary keys are all
 * distinct, so pressing one never also fires another in this set.
 */
export const QTE_ACTIONS: readonly InputAction[] = [
  'lightAttack', 'heavyAttack', 'guard', 'dodge', 'interact', 'grab', 'heatAction',
];

export type QteVerdict = 'pending' | 'hit' | 'miss';
export type QteStep = 'pending' | 'advance' | 'success' | 'fail';

/** One prompt: the right button wins (even on the last frame), a wrong one or timeout loses. */
export function judgeQte(
  expected: InputAction,
  pressed: (a: InputAction) => boolean,
  elapsed: number,
  windowSec: number,
): QteVerdict {
  if (pressed(expected)) return 'hit';
  if (elapsed >= windowSec) return 'miss';
  return QTE_ACTIONS.some((a) => a !== expected && pressed(a)) ? 'miss' : 'pending';
}

/** A sequence of prompts, each with its own window. */
export class QteRun {
  private i = 0;
  private t = 0;

  constructor(
    readonly keys: readonly InputAction[],
    readonly windowSec: number,
  ) {}

  get index(): number {
    return this.i;
  }

  get current(): InputAction | undefined {
    return this.keys[this.i];
  }

  /** 0 → 1 as the current window runs out. */
  get progress(): number {
    return Math.min(1, this.t / this.windowSec);
  }

  step(dt: number, pressed: (a: InputAction) => boolean): QteStep {
    const key = this.current;
    if (key === undefined) return 'success';
    this.t += dt;
    const verdict = judgeQte(key, pressed, this.t, this.windowSec);
    if (verdict === 'pending') return 'pending';
    if (verdict === 'miss') return 'fail';
    this.i++;
    this.t = 0;
    return this.i >= this.keys.length ? 'success' : 'advance';
  }
}
