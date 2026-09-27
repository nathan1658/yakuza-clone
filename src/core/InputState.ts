/**
 * Pure (DOM-free) bookkeeping behind InputManager: held sources, per-action
 * press/release edges, consumption and the press buffer.
 *
 * A "source" is a physical input id (KeyboardEvent.code or 'Mouse0'/'Mouse2').
 * Several sources may drive one action (W and ↑) and one source may drive
 * several actions (Space → dodge + confirm). An action is down while at least
 * one of its sources is held; edges fire on the 0→1 and 1→0 transitions.
 *
 * Timeline: DOM events call press()/release() between frames; beginFrame()
 * latches the edges gathered since the previous frame; endFrame() clears them.
 */

interface ActionSlot {
  /** Number of bound sources currently held. */
  held: number;
  pendingPress: boolean;
  pendingRelease: boolean;
  pressed: boolean;
  released: boolean;
  consumed: boolean;
  /** An unconsumed press is waiting in the buffer. */
  buffered: boolean;
  /** Clock value (real seconds) of the latest latched press. */
  pressTime: number;
}

export class InputState<A extends string> {
  private readonly slots = new Map<A, ActionSlot>();
  private readonly sourceActions = new Map<string, readonly A[]>();
  private readonly heldSources = new Set<string>();
  private clock = 0;

  /** `bindings` maps every action to the sources that drive it. */
  constructor(bindings: Readonly<Record<A, readonly string[]>>) {
    for (const action of Object.keys(bindings) as A[]) {
      this.slots.set(action, newSlot());
      for (const source of bindings[action]) this.bindSource(source, action);
    }
  }

  /** Real seconds accumulated by beginFrame(). */
  get time(): number {
    return this.clock;
  }

  isBound(source: string): boolean {
    return this.sourceActions.has(source);
  }

  /** A source went down. Repeats of an already held source are ignored. */
  press(source: string): void {
    const actions = this.sourceActions.get(source);
    if (!actions || this.heldSources.has(source)) return;
    this.heldSources.add(source);
    for (const action of actions) {
      const slot = this.slot(action);
      if (slot.held++ === 0) slot.pendingPress = true;
    }
  }

  /** A source went up. Releasing a source that is not held is a no-op. */
  release(source: string): void {
    if (!this.heldSources.delete(source)) return;
    for (const action of this.sourceActions.get(source)!) {
      const slot = this.slot(action);
      if (--slot.held === 0) slot.pendingRelease = true;
    }
  }

  releaseAll(): void {
    for (const source of [...this.heldSources]) this.release(source);
  }

  /** Synthetic press + release of an action (no source involved). */
  tap(action: A): void {
    const slot = this.slot(action);
    slot.pendingPress = true;
    slot.pendingRelease = true;
  }

  beginFrame(realDt: number): void {
    this.clock += realDt;
    for (const slot of this.slots.values()) {
      slot.pressed = slot.pendingPress;
      slot.released = slot.pendingRelease;
      slot.pendingPress = false;
      slot.pendingRelease = false;
      if (!slot.pressed) continue;
      slot.buffered = true;
      slot.pressTime = this.clock;
    }
  }

  endFrame(): void {
    for (const slot of this.slots.values()) {
      slot.pressed = false;
      slot.released = false;
      slot.consumed = false;
    }
  }

  isDown(action: A): boolean {
    return this.slot(action).held > 0;
  }

  wasPressed(action: A): boolean {
    const slot = this.slot(action);
    return slot.pressed && !slot.consumed;
  }

  wasReleased(action: A): boolean {
    return this.slot(action).released;
  }

  consume(action: A): void {
    const slot = this.slot(action);
    slot.consumed = true;
    slot.buffered = false;
  }

  consumeBuffered(action: A, withinSec: number): boolean {
    const slot = this.slot(action);
    if (!slot.buffered || this.clock - slot.pressTime > withinSec) return false;
    this.consume(action);
    return true;
  }

  private bindSource(source: string, action: A): void {
    const actions = this.sourceActions.get(source) ?? [];
    this.sourceActions.set(source, [...actions, action]);
  }

  private slot(action: A): ActionSlot {
    const slot = this.slots.get(action);
    if (!slot) throw new Error(`[InputState] unknown action "${action}"`);
    return slot;
  }
}

function newSlot(): ActionSlot {
  return {
    held: 0,
    pendingPress: false,
    pendingRelease: false,
    pressed: false,
    released: false,
    consumed: false,
    buffered: false,
    pressTime: 0,
  };
}
