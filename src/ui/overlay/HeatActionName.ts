import { el, play, setText } from '../dom';

const DURATION_MS = 1600;

/** Heat action title that slams onto the screen, Yakuza style. */
export class HeatActionName {
  private readonly root: HTMLDivElement;
  private readonly zh: HTMLSpanElement;
  private readonly en: HTMLSpanElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'yk-heatname', parent);
    this.zh = el('span', 'yk-heatname-zh', this.root);
    this.en = el('span', 'yk-heatname-en', this.root);
  }

  show(nameZh: string, nameEn: string): void {
    setText(this.zh, nameZh);
    setText(this.en, nameEn.toUpperCase());
    play(this.root, [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(3.2) skewX(-10deg)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(0.94) skewX(-10deg)', offset: 0.08 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1) skewX(-10deg)', offset: 0.14 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1.04) skewX(-10deg)', offset: 0.8 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.1) skewX(-10deg)' },
    ], { duration: DURATION_MS, easing: 'ease-out' });
  }
}
