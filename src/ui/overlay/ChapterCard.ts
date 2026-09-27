import type { Clock } from '../logic/Clock';
import { el, play, setText } from '../dom';

const DURATION_SEC = 3.5;
const CHAR_STAGGER_MS = 90;

/** 第一章 / 波斯富街 — a red brush stroke wipes in, the title stamps on char by char. */
export class ChapterCard {
  private readonly root: HTMLDivElement;
  private readonly brush: HTMLDivElement;
  private readonly num: HTMLSpanElement;
  private readonly title: HTMLDivElement;
  private readonly en: HTMLSpanElement;

  constructor(parent: HTMLElement, private readonly clock: Clock) {
    this.root = el('div', 'yk-chapter', parent);
    this.brush = el('div', 'yk-chapter-brush', this.root);
    this.num = el('span', 'yk-chapter-num', this.root);
    this.title = el('div', 'yk-chapter-title', this.root);
    this.en = el('span', 'yk-chapter-en', this.root);
  }

  show(chapter: string, title: string, subtitleEn = ''): Promise<void> {
    setText(this.num, chapter);
    setText(this.en, subtitleEn.toUpperCase());
    this.title.replaceChildren(...Array.from(title, (ch) => el('span', 'yk-chapter-char', undefined, ch)));
    const ms = DURATION_SEC * 1000;
    play(this.root, [
      { opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 1, offset: 0.86 }, { opacity: 0 },
    ], { duration: ms });
    play(this.brush, [
      { transform: 'scaleX(0) skewX(-18deg)' },
      { transform: 'scaleX(1) skewX(-18deg)', offset: 0.16 },
      { transform: 'scaleX(1) skewX(-18deg)' },
    ], { duration: ms, easing: 'cubic-bezier(.7,0,.2,1)' });
    Array.from(this.title.children).forEach((ch, i) => play(ch as HTMLElement, [
      { opacity: 0, transform: 'scale(2.4)' },
      { opacity: 1, transform: 'scale(1)' },
    ], { duration: 260, delay: 380 + i * CHAR_STAGGER_MS, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
    play(this.en, [
      { opacity: 0, transform: 'translateY(40%)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 500, delay: 900, easing: 'ease-out', fill: 'backwards' });
    return this.clock.wait(DURATION_SEC);
  }
}
