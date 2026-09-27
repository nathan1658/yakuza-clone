/**
 * Script liveness. Every scripted task (a beat, a conversation, a scene)
 * captures the epoch it started in; startNewGame/continueGame bump it, so
 * anything still awaiting from the old run sees itself as stale and bails
 * out without touching the new state. `busy` blocks new tasks while one runs.
 */
export class Session {
  epoch = 0;
  private running = 0;

  get busy(): boolean {
    return this.running > 0;
  }

  /** Start over: every in-flight task becomes stale. */
  bump(): void {
    this.epoch++;
    this.running = 0;
  }

  /** True while the epoch this was taken in is still current. */
  token(): () => boolean {
    const e = this.epoch;
    return () => this.epoch === e;
  }

  /** Run a top-level task with `busy` set; stale tasks don't touch the count. */
  async exclusive<T>(task: (alive: () => boolean) => Promise<T>): Promise<T> {
    const alive = this.token();
    this.running++;
    try {
      return await task(alive);
    } finally {
      if (alive()) this.running--;
    }
  }
}
