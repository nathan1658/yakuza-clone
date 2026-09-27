import { el, play, setText } from '../dom';
import { LoadingProgress } from '../logic/loadingProgress';

/**
 * Boot screen. Works before UIManager.init(): it only touches its own DOM,
 * and its exit animation is WAAPI (no engine clock needed).
 */
export class LoadingScreen {
  private readonly root: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly caption: HTMLSpanElement;
  private readonly percent: HTMLSpanElement;
  private readonly progress = new LoadingProgress();

  constructor(parent: HTMLElement) {
    this.root = el('div', 'yk-loading', parent);
    const logo = el('div', 'yk-loading-logo', this.root);
    el('span', 'yk-loading-main', logo, '古惑仔');
    el('span', 'yk-loading-sub', logo, '銅鑼灣之龍');
    const bar = el('div', 'yk-loading-bar', this.root);
    this.fill = el('div', 'yk-loading-fill', bar);
    const row = el('div', 'yk-loading-row', this.root);
    this.caption = el('span', 'yk-loading-caption', row);
    this.percent = el('span', 'yk-loading-percent', row);
    el('div', 'yk-loading-note', this.root, '本故事純屬虛構 ・ 如有雷同 實屬巧合');
  }

  set(progress: number, label: string): void {
    const [p, caption] = this.progress.map(progress, label);
    this.fill.style.transform = `scaleX(${p.toFixed(3)})`;
    setText(this.caption, `${caption}……`);
    setText(this.percent, `${Math.round(p * 100)}%`);
  }

  /** Fill up, fade out, then leave the DOM. */
  finish(): void {
    this.fill.style.transform = 'scaleX(1)';
    setText(this.percent, '100%');
    const out = play(this.root, [{ opacity: 1 }, { opacity: 0 }], {
      duration: 600, delay: 200, easing: 'ease-in', fill: 'forwards',
    });
    void out.finished.then(() => this.root.remove(), () => this.root.remove());
  }
}
