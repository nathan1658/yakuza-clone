import type { IInputManager, InputAction } from './types';
import { InputState } from './InputState';

/**
 * Default bindings (see the InputAction doc comment in types.ts). Sources are
 * KeyboardEvent.code values plus 'Mouse0' (left) and 'Mouse2' (right).
 * The first source of each action is its primary binding (used by getLabel).
 */
export const BINDINGS: Readonly<Record<InputAction, readonly string[]>> = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  lightAttack: ['KeyJ', 'Mouse0'],
  heavyAttack: ['KeyK', 'Mouse2'],
  guard: ['KeyL'],
  dodge: ['Space'],
  interact: ['KeyE'],
  grab: ['KeyG'],
  heatAction: ['KeyF'],
  lockOn: ['KeyQ'],
  cycleTarget: ['Tab'],
  pause: ['Escape'],
  inventory: ['KeyI'],
  confirm: ['Enter', 'Space', 'KeyE'],
  cancel: ['Escape', 'Backspace'],
  menuUp: ['KeyW', 'ArrowUp'],
  menuDown: ['KeyS', 'ArrowDown'],
  menuLeft: ['KeyA', 'ArrowLeft'],
  menuRight: ['KeyD', 'ArrowRight'],
  choice1: ['Digit1'],
  choice2: ['Digit2'],
  choice3: ['Digit3'],
  choice4: ['Digit4'],
  debug: ['F3'],
};

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  Space: 'SPACE',
  Escape: 'ESC',
  Tab: 'TAB',
  Enter: 'ENTER',
  Backspace: 'BACKSPACE',
  Mouse0: 'LMB',
  Mouse2: 'RMB',
};

/** Human label for a source: 'KeyJ' → 'J', 'Digit1' → '1', 'Space' → 'SPACE'. */
export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replace(/^(Key|Digit)/, '').toUpperCase();
}

/** Mouse buttons (MouseEvent.button) that are bindable sources. */
const MOUSE_SOURCES: Readonly<Record<number, string>> = { 0: 'Mouse0', 2: 'Mouse2' };

/** Single mouse events moving further than this are browser glitches (lock/unlock jumps). */
const LOOK_SPIKE_PX = 250;

/** An Escape keydown and a lock loss this close together are the same user action. */
const ESCAPE_LOCK_WINDOW_MS = 300;

export class InputManager implements IInputManager {
  private readonly state = new InputState<InputAction>(BINDINGS);
  private readonly look = { x: 0, y: 0 };
  private readonly move = { x: 0, y: 0 };
  private readonly zero = { x: 0, y: 0 };
  /** Set by exitPointerLock(): the next unlock is intentional, not a pause. */
  private expectingUnlock = false;
  private lastEscapeMs = -Infinity;
  private lastLockLossPauseMs = -Infinity;

  constructor(private readonly container: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    container.addEventListener('mousedown', this.onMouseDown);
    container.addEventListener('mousemove', this.onMouseMove);
    container.addEventListener('contextmenu', preventDefault);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.container;
  }

  isDown(action: InputAction): boolean {
    return this.state.isDown(action);
  }

  wasPressed(action: InputAction): boolean {
    return this.state.wasPressed(action);
  }

  wasReleased(action: InputAction): boolean {
    return this.state.wasReleased(action);
  }

  consume(action: InputAction): void {
    this.state.consume(action);
  }

  consumeBuffered(action: InputAction, withinSec: number): boolean {
    return this.state.consumeBuffered(action, withinSec);
  }

  /**
   * x = right, y = forward, length ≤ 1. The returned object is reused: read it
   * immediately, don't keep it.
   */
  getMoveVector(): { x: number; y: number } {
    if (!document.hasFocus()) return this.zeroed();
    const s = this.state;
    const x = axis(s.isDown('moveRight'), s.isDown('moveLeft'));
    const y = axis(s.isDown('moveForward'), s.isDown('moveBack'));
    const len = Math.hypot(x, y);
    this.move.x = len > 1 ? x / len : x;
    this.move.y = len > 1 ? y / len : y;
    return this.move;
  }

  /** Pixels since last frame (only while pointer-locked). Reused object, read immediately. */
  getLookDelta(): { x: number; y: number } {
    return this.pointerLocked ? this.look : this.zeroed();
  }

  getLabel(action: InputAction): string {
    return sourceLabel(BINDINGS[action][0]);
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return;
    try {
      // Returns a Promise in modern browsers (rejects without a user gesture), void in older ones.
      Promise.resolve(this.container.requestPointerLock()).catch(ignore);
    } catch {
      // Not allowed right now (no gesture / sandboxed iframe): the next click on the game retries.
    }
  }

  exitPointerLock(): void {
    if (!this.pointerLocked) return;
    this.expectingUnlock = true;
    document.exitPointerLock();
  }

  beginFrame(realDt: number): void {
    this.state.beginFrame(realDt);
  }

  endFrame(): void {
    this.state.endFrame();
    this.look.x = 0;
    this.look.y = 0;
  }

  private zeroed(): { x: number; y: number } {
    this.zero.x = 0;
    this.zero.y = 0;
    return this.zero;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || !this.state.isBound(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape' && !this.acceptEscape(performance.now())) return;
    this.state.press(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.state.release(e.code);
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.pointerLocked) {
      // The click that grabs the pointer is not a game action.
      this.requestPointerLock();
      return;
    }
    const source = MOUSE_SOURCES[e.button];
    if (source) this.state.press(source);
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    const source = MOUSE_SOURCES[e.button];
    if (source) this.state.release(source);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    if (Math.abs(e.movementX) > LOOK_SPIKE_PX || Math.abs(e.movementY) > LOOK_SPIKE_PX) return;
    this.look.x += e.movementX;
    this.look.y += e.movementY;
  };

  private readonly onBlur = (): void => {
    this.state.releaseAll();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.state.releaseAll();
  };

  private readonly onPointerLockChange = (): void => {
    if (this.pointerLocked) {
      this.expectingUnlock = false;
      return;
    }
    const expected = this.expectingUnlock;
    this.expectingUnlock = false;
    this.look.x = 0;
    this.look.y = 0;
    if (!expected) this.reportLockLoss(performance.now());
  };

  /**
   * Unexpected lock loss (browser Escape, alt-tab) reads as one 'pause' press.
   * Browsers differ on whether the Escape that released the lock also reaches
   * the page, and in which order; whichever arrives second is dropped.
   */
  private reportLockLoss(nowMs: number): void {
    if (nowMs - this.lastEscapeMs < ESCAPE_LOCK_WINDOW_MS) return;
    this.lastLockLossPauseMs = nowMs;
    this.state.tap('pause');
  }

  private acceptEscape(nowMs: number): boolean {
    this.lastEscapeMs = nowMs;
    return nowMs - this.lastLockLossPauseMs >= ESCAPE_LOCK_WINDOW_MS;
  }
}

function axis(positive: boolean, negative: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

function preventDefault(e: Event): void {
  e.preventDefault();
}

function ignore(): void {}
