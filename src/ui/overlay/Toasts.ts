import type { IUIManager } from '../../core/types';
import type { Clock } from '../logic/Clock';
import { el, play } from '../dom';

export type ToastKind = NonNullable<Parameters<IUIManager['toast']>[1]>;

const ICONS: Record<ToastKind, string> = { info: '◆', money: '$', item: '▣', quest: '★', warning: '!' };
const MAX = 5;
const LIFE_SEC = 3.2;
const OUT_SEC = 0.3;

/** Stacked notifications on the left edge, newest at the bottom. */
export class Toasts {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly clock: Clock) {
    this.root = el('div', 'yk-toasts', parent);
  }

  push(text: string, kind: ToastKind = 'info'): void {
    const toast = el('div', `yk-toast is-${kind}`, this.root);
    el('span', 'yk-toast-icon', toast, ICONS[kind]);
    el('span', 'yk-toast-text', toast, text);
    play(toast, [
      { opacity: 0, transform: 'translateX(-40%) skewX(-12deg)' },
      { opacity: 1, transform: 'translateX(0) skewX(-12deg)' },
    ], { duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' });
    while (this.root.childElementCount > MAX) this.root.firstElementChild!.remove();
    this.clock.schedule(LIFE_SEC, () => this.dismiss(toast));
  }

  private dismiss(toast: HTMLElement): void {
    if (!toast.isConnected) return;
    play(toast, [
      { opacity: 1, transform: 'translateX(0) skewX(-12deg)' },
      { opacity: 0, transform: 'translateX(-30%) skewX(-12deg)' },
    ], { duration: OUT_SEC * 1000, easing: 'ease-in', fill: 'forwards' });
    this.clock.schedule(OUT_SEC, () => toast.remove());
  }
}
