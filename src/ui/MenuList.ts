import type { IAudioSystem, IInputManager } from '../core/types';
import { el, take, toggle } from './dom';
import { clampIndex, firstEnabled, stepIndex } from './logic/menuNav';

export interface MenuItem {
  readonly el: HTMLElement;
  readonly enabled: boolean;
  /** Return false to refuse (plays ui_cancel instead of ui_confirm). */
  activate?(): boolean | void;
  /** Left/right on this row (sliders, shop actions). Rows without it let the owner use left/right. */
  horizontal?(dir: 1 | -1): void;
  /** The cursor landed here (update a detail panel, etc.). */
  focus?(): void;
}

/**
 * A vertical cursor over rows, driven by keyboard (menuUp/Down/confirm) and
 * mouse (hover selects, click activates). Plays the ui_* sounds.
 */
export class MenuList {
  private items: MenuItem[] = [];
  private cursor = -1;

  constructor(private readonly audio: IAudioSystem) {}

  get index(): number {
    return this.cursor;
  }

  get current(): MenuItem | undefined {
    return this.items[this.cursor];
  }

  /** Replace the rows. The cursor stays on the same index when possible. */
  setItems(items: MenuItem[], preferred = this.cursor): void {
    this.items = items;
    items.forEach((item, i) => {
      toggle(item.el, 'is-disabled', !item.enabled);
      item.el.addEventListener('pointerenter', () => this.hover(i));
      item.el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.enabled && i !== this.cursor) this.select(i, false);
        if (i === this.cursor) this.activate();
        else this.audio.playSfx('ui_cancel');
      });
    });
    const start = clampIndex(preferred, items.length);
    this.select(items[start]?.enabled ? start : firstEnabled(this.enabledMask(), start), false);
  }

  /** Up/Down/confirm. Returns true when the press was handled (and consumed). */
  handleInput(input: IInputManager): boolean {
    const delta = take(input, 'menuUp') ? -1 : take(input, 'menuDown') ? 1 : 0;
    if (delta !== 0) this.move(delta);
    const confirmed = delta === 0 && take(input, 'confirm');
    if (confirmed) this.activate();
    return delta !== 0 || confirmed;
  }

  /** Left/right on the current row. False when the row has no horizontal action. */
  horizontal(dir: 1 | -1): boolean {
    const item = this.current;
    if (!item?.horizontal || !item.enabled) return false;
    item.horizontal(dir);
    return true;
  }

  move(delta: 1 | -1): void {
    const next = stepIndex(this.cursor, delta, this.enabledMask());
    if (next === this.cursor) return;
    this.select(next, true);
  }

  activate(): void {
    const item = this.current;
    if (!item?.activate) return;
    const ok = item.enabled && item.activate() !== false;
    this.audio.playSfx(ok ? 'ui_confirm' : 'ui_cancel');
  }

  select(i: number, sound: boolean): void {
    this.items.forEach((item, k) => toggle(item.el, 'is-selected', k === i));
    this.cursor = i;
    if (sound) this.audio.playSfx('ui_move');
    this.items[i]?.focus?.();
  }

  private hover(i: number): void {
    if (i !== this.cursor && this.items[i]?.enabled) this.select(i, true);
  }

  private enabledMask(): boolean[] {
    return this.items.map((item) => item.enabled);
  }
}

/** Standard menu row: big Chinese label, small English tag, optional sub line. */
export function menuRow(parent: HTMLElement, zh: string, en: string, sub = ''): HTMLDivElement {
  const row = el('div', 'yk-row', parent);
  el('span', 'yk-row-zh', row, zh);
  el('span', 'yk-row-en', row, en);
  if (sub) el('span', 'yk-row-sub', row, sub);
  return row;
}
