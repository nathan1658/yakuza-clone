/**
 * Real-time waits for scripts. Ticked by the narrative's update() with
 * realDt, so cutscene pacing ignores bullet time and hit-stop.
 */
export class Clock {
  now = 0;
  private waits: Array<{ at: number; resolve: () => void }> = [];

  tick(realDt: number): void {
    this.now += realDt;
    if (this.waits.length === 0) return;
    const due = this.waits.filter((w) => w.at <= this.now);
    if (due.length === 0) return;
    this.waits = this.waits.filter((w) => w.at > this.now);
    for (const w of due) w.resolve();
  }

  /** Resolves after `sec` real seconds (on the next tick for sec ≤ 0). */
  wait(sec: number): Promise<void> {
    return new Promise((resolve) => this.waits.push({ at: this.now + Math.max(0, sec), resolve }));
  }
}
