import type { IInputManager } from '../core/types';

/**
 * Anything that owns input while open: dialogue, menus, shop, QTE, screens.
 * `input` is null when the modal must not read input this frame (it is not on
 * top, or it opened this very frame — the key that opened it must not also
 * drive it).
 */
export interface Modal {
  update(dt: number, input: IInputManager | null): void;
}

interface Entry {
  modal: Modal;
  frame: number;
}

export class ModalStack {
  private entries: Entry[] = [];

  constructor(private readonly frame: () => number) {}

  get empty(): boolean {
    return this.entries.length === 0;
  }

  has(modal: Modal): boolean {
    return this.entries.some((e) => e.modal === modal);
  }

  push(modal: Modal): void {
    this.remove(modal);
    this.entries.push({ modal, frame: this.frame() });
  }

  remove(modal: Modal): void {
    this.entries = this.entries.filter((e) => e.modal !== modal);
  }

  update(dt: number, input: IInputManager): void {
    const top = this.entries.at(-1);
    const now = this.frame();
    for (const e of [...this.entries]) {
      e.modal.update(dt, e === top && now > e.frame ? input : null);
    }
  }
}
