import type { QuestKind } from '../../core/types';
import { el, play, setText, toggle } from '../dom';

const DURATION_MS = 3400;
const TAGS: Record<QuestKind, { zh: string; en: string }> = {
  main: { zh: '任務完成', en: 'MISSION COMPLETE' },
  substory: { zh: '支線完成', en: 'SUBSTORY COMPLETE' },
};

/** Centre-top stamp when a quest completes. */
export class QuestBanner {
  private readonly root: HTMLDivElement;
  private readonly tag: HTMLSpanElement;
  private readonly en: HTMLSpanElement;
  private readonly title: HTMLSpanElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'yk-questdone', parent);
    this.tag = el('span', 'yk-questdone-tag', this.root);
    this.en = el('span', 'yk-questdone-en', this.root);
    this.title = el('span', 'yk-questdone-title', this.root);
  }

  show(kind: QuestKind, title: string): void {
    setText(this.tag, TAGS[kind].zh);
    setText(this.en, TAGS[kind].en);
    setText(this.title, title);
    toggle(this.root, 'is-substory', kind === 'substory');
    play(this.root, [
      { opacity: 0, transform: 'translateX(-50%) scale(1.8) rotate(-4deg)' },
      { opacity: 1, transform: 'translateX(-50%) scale(1) rotate(-4deg)', offset: 0.07 },
      { opacity: 1, transform: 'translateX(-50%) scale(1) rotate(-4deg)', offset: 0.85 },
      { opacity: 0, transform: 'translateX(-50%) scale(0.96) rotate(-4deg)' },
    ], { duration: DURATION_MS, easing: 'ease-out' });
  }
}
