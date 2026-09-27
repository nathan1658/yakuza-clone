/**
 * Fixed-size pool. acquire() never allocates: when every slot is busy it
 * recycles the oldest active one (a damage number from a second ago matters
 * less than the one landing now).
 */
export class SlotPool<T> {
  private readonly free: T[];
  private readonly active: T[] = [];

  constructor(items: readonly T[]) {
    if (items.length === 0) throw new Error('[SlotPool] needs at least one slot');
    this.free = [...items];
  }

  get activeCount(): number {
    return this.active.length;
  }

  get freeCount(): number {
    return this.free.length;
  }

  /** Oldest first. Do not mutate the pool while iterating; collect, then release. */
  get activeItems(): readonly T[] {
    return this.active;
  }

  /** Returns a slot and whether it was stolen from an active user. */
  acquire(): { item: T; recycled: boolean } {
    const item = this.free.pop();
    if (item !== undefined) {
      this.active.push(item);
      return { item, recycled: false };
    }
    const oldest = this.active.shift()!;
    this.active.push(oldest);
    return { item: oldest, recycled: true };
  }

  release(item: T): void {
    const i = this.active.indexOf(item);
    if (i < 0) return;
    this.active.splice(i, 1);
    this.free.push(item);
  }

  releaseAll(): void {
    this.free.push(...this.active);
    this.active.length = 0;
  }
}
