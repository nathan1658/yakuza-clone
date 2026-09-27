/**
 * Hitstop and slow motion through the engine's time scale.
 *
 * Hitstop uses an untimed scale and snaps back itself, because the engine's
 * timed form eases out over 0.2 s, which smears a 50 ms freeze into mush.
 * Slow motion uses the timed form, whose ease-out is exactly what we want.
 */
import type { GameContext } from '../core/types';
import { HITSTOP } from './tables';

/** Below this scale something else (slow motion) owns time: don't stack a hitstop on it. */
const SLOWMO_THRESHOLD = 0.5;

export class TimeFx {
  private hitstopLeft = 0;
  /** Heat actions direct time themselves. */
  suppressed = false;

  constructor(private readonly ctx: GameContext) {}

  hitstop(realSec: number): void {
    if (this.hitstopLeft > 0) {
      this.hitstopLeft = Math.max(this.hitstopLeft, realSec);
      return;
    }
    if (this.suppressed || this.ctx.engine.timeScale < SLOWMO_THRESHOLD) return;
    this.ctx.engine.setTimeScale(HITSTOP.scale);
    this.hitstopLeft = realSec;
  }

  slowmo(scale: number, realSec: number): void {
    this.hitstopLeft = 0;
    this.ctx.engine.setTimeScale(scale, realSec);
  }

  update(realDt: number): void {
    if (this.hitstopLeft <= 0) return;
    this.hitstopLeft -= realDt;
    if (this.hitstopLeft <= 0) this.ctx.engine.setTimeScale(1);
  }

  reset(): void {
    this.hitstopLeft = 0;
    this.suppressed = false;
    this.ctx.engine.setTimeScale(1);
  }
}
