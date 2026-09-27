import type { IInputManager, InputAction } from '../../core/types';
import { el, setText, toggle } from '../dom';

interface Button {
  readonly action: InputAction;
  /** Centre, in px from the bottom-right corner (safe area added in CSS). */
  readonly x: number;
  readonly y: number;
  readonly size: number;
  /** Only useful in a fight; hidden in free roam. */
  readonly combat: boolean;
}

/** Thumb-arc around the light-attack button, most used closest to the corner. */
const BUTTONS: readonly Button[] = [
  { action: 'lightAttack', x: 64, y: 64, size: 80, combat: true },
  { action: 'heavyAttack', x: 162, y: 42, size: 60, combat: true },
  { action: 'dodge', x: 150, y: 126, size: 60, combat: true },
  { action: 'guard', x: 66, y: 164, size: 60, combat: true },
  { action: 'heatAction', x: 238, y: 118, size: 56, combat: true },
  { action: 'grab', x: 250, y: 44, size: 50, combat: true },
  { action: 'lockOn', x: 150, y: 206, size: 48, combat: true },
  { action: 'interact', x: 64, y: 244, size: 56, combat: false },
];

/** Knob travel in px; full travel = full speed. */
const STICK_TRAVEL = 56;
const STICK_DEADZONE = 0.12;
/** Stick pushed this far also holds sprint. */
const SPRINT_AT = 0.92;
/** Touch drags are shorter than mouse sweeps: scale them up to the mouse's rad/px. */
const LOOK_GAIN = 2.4;
/** Touches starting left of this fraction of the width drive the stick, the rest the camera. */
const STICK_SIDE = 0.45;

/**
 * On-screen controls for phones: a floating stick on the left, camera drag on
 * the right and an action-button arc in the bottom-right corner. Everything is
 * fed into the input manager's touch sources, so gameplay code can't tell a
 * tap from a key.
 */
export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly faces: [HTMLElement, InputAction][] = [];
  private stickId = -1;
  private lookId = -1;
  private originX = 0;
  private originY = 0;
  private lastX = 0;
  private lastY = 0;

  constructor(parent: HTMLElement, private readonly input: IInputManager) {
    this.root = el('div', 'yk-touch', parent);
    const pad = el('div', 'yk-touch-pad', this.root);
    this.base = el('div', 'yk-touch-stick', this.root);
    this.knob = el('div', 'yk-touch-knob', this.base);
    for (const b of BUTTONS) this.button(b);
    this.bind(el('div', 'yk-tbtn yk-tbtn--pause', this.root), 'pause');
    pad.addEventListener('pointerdown', this.onDown);
    pad.addEventListener('pointermove', this.onMove);
    pad.addEventListener('pointerup', this.onUp);
    pad.addEventListener('pointercancel', this.onUp);
  }

  /** `on` = the HUD is up. Letting go of everything when it hides keeps nothing stuck down. */
  update(on: boolean, combat: boolean): void {
    toggle(this.root, 'is-combat', combat);
    if (on) {
      // Faces come from getLabel(), which only knows them once touch mode is on.
      for (const [node, action] of this.faces) setText(node, this.input.getLabel(action));
      return;
    }
    if (this.stickId >= 0) this.releaseStick();
    this.lookId = -1;
  }

  private button(b: Button): void {
    const node = el('div', `yk-tbtn${b.combat ? ' is-combat-only' : ''}`, this.root);
    node.dataset.action = b.action;
    node.style.setProperty('--x', `${b.x}px`);
    node.style.setProperty('--y', `${b.y}px`);
    node.style.setProperty('--size', `${b.size}px`);
    this.bind(node, b.action);
  }

  /** Down on touch, up on release even if the finger slid off the button. */
  private bind(node: HTMLElement, action: InputAction): void {
    this.faces.push([node, action]);
    const up = () => {
      toggle(node, 'is-down', false);
      this.input.setTouchButton(action, false);
    };
    node.addEventListener('pointerdown', (e) => {
      node.setPointerCapture(e.pointerId);
      toggle(node, 'is-down', true);
      this.input.setTouchButton(action, true);
    });
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', up);
  }

  private readonly onDown = (e: PointerEvent): void => {
    const pad = e.currentTarget as HTMLElement;
    if (e.clientX < window.innerWidth * STICK_SIDE) {
      if (this.stickId >= 0) return;
      this.stickId = e.pointerId;
      this.originX = e.clientX;
      this.originY = e.clientY;
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      toggle(this.base, 'is-active', true);
    } else {
      if (this.lookId >= 0) return;
      this.lookId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
    pad.setPointerCapture(e.pointerId);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) this.moveStick(e.clientX - this.originX, e.clientY - this.originY);
    if (e.pointerId !== this.lookId) return;
    this.input.addTouchLook((e.clientX - this.lastX) * LOOK_GAIN, (e.clientY - this.lastY) * LOOK_GAIN);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) this.releaseStick();
    if (e.pointerId === this.lookId) this.lookId = -1;
  };

  private moveStick(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    const k = len > STICK_TRAVEL ? STICK_TRAVEL / len : 1;
    this.knob.style.transform = `translate(${(dx * k).toFixed(1)}px,${(dy * k).toFixed(1)}px)`;
    const mag = Math.min(1, len / STICK_TRAVEL);
    const live = mag > STICK_DEADZONE;
    // Screen down is +y; the stick's forward is +y.
    this.input.setTouchStick(live ? (dx * k) / STICK_TRAVEL : 0, live ? (-dy * k) / STICK_TRAVEL : 0);
    this.input.setTouchButton('sprint', mag >= SPRINT_AT);
  }

  private releaseStick(): void {
    this.stickId = -1;
    this.knob.style.transform = '';
    this.base.style.left = '';
    this.base.style.top = '';
    toggle(this.base, 'is-active', false);
    this.input.setTouchStick(0, 0);
    this.input.setTouchButton('sprint', false);
  }
}
