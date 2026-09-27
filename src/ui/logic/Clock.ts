interface Timer {
  at: number;
  fn: () => void;
}

/**
 * Real-time scheduler for UI tweens and timeouts, driven by the engine's
 * realDt (so it keeps running while the game is paused or in bullet time).
 */
export class Clock {
  private t = 0;
  private timers: Timer[] = [];

  get now(): number {
    return this.t;
  }

  tick(dt: number): void {
    this.t += dt;
    if (!this.timers.some((x) => x.at <= this.t)) return;
    const due = this.timers.filter((x) => x.at <= this.t).sort((a, b) => a.at - b.at);
    this.timers = this.timers.filter((x) => x.at > this.t);
    for (const timer of due) timer.fn();
  }

  /** Run `fn` after `sec` seconds. Returns a cancel function. */
  schedule(sec: number, fn: () => void): () => void {
    const timer: Timer = { at: this.t + Math.max(0, sec), fn };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((x) => x !== timer);
    };
  }

  wait(sec: number): Promise<void> {
    return new Promise((resolve) => this.schedule(sec, resolve));
  }
}
