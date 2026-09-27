import { el, toggle } from '../dom';

/**
 * Health bar with a delayed "chip": on damage the fill drops at once and the
 * chip drains after a beat; on healing the chip jumps and the fill catches
 * up. Which layer animates is picked by CSS from `data-dir`.
 */
export class HpBar {
  readonly root: HTMLDivElement;
  private readonly chip: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private ratio = -1;

  constructor(parent: HTMLElement, cls: string) {
    this.root = el('div', `yk-bar ${cls}`, parent);
    this.chip = el('div', 'yk-bar-chip', this.root);
    this.fill = el('div', 'yk-bar-fill', this.root);
  }

  /** 0..1. `instant` skips the animation (new target, reset). */
  set(ratio: number, instant = false): void {
    const r = Math.min(1, Math.max(0, ratio));
    if (Math.abs(r - this.ratio) < 0.001) return;
    this.root.dataset.dir = instant ? 'none' : r < this.ratio ? 'down' : 'up';
    this.ratio = r;
    const scale = `scaleX(${r.toFixed(4)})`;
    this.fill.style.transform = scale;
    this.chip.style.transform = scale;
    toggle(this.root, 'is-low', r > 0 && r <= 0.25);
  }
}
