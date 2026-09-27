type Handler<T> = (payload: T) => void;

/**
 * Minimal typed pub/sub. `E` maps event names to payload types.
 * A throwing listener is logged and skipped — one bad subscriber must not
 * take down the frame.
 */
export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Set<Handler<never>>>();

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  once<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copy: handlers may unsubscribe (or subscribe) while we iterate.
    for (const h of [...set]) {
      try {
        (h as Handler<E[K]>)(payload);
      } catch (err) {
        console.error(`[EventBus] listener for "${String(type)}" threw`, err);
      }
    }
  }

  /** Promise that resolves on the next emission of `type` (optionally matching `filter`). */
  wait<K extends keyof E>(type: K, filter?: (payload: E[K]) => boolean): Promise<E[K]> {
    return new Promise((resolve) => {
      const off = this.on(type, (payload) => {
        if (filter && !filter(payload)) return;
        off();
        resolve(payload);
      });
    });
  }

  clear(): void {
    this.handlers.clear();
  }
}
