import type { GameContext } from '../../core/types';
import { el, play, setText, toggle } from '../dom';

/** Top-right: tracked main objective, re-animates when it changes. */
export class ObjectivePanel {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private key = '';

  constructor(parent: HTMLElement, private readonly ctx: GameContext) {
    this.root = el('div', 'yk-objective', parent);
    const head = el('div', 'yk-objective-head', this.root);
    el('span', 'yk-objective-tag', head, '目標');
    el('span', 'yk-objective-tag-en', head, 'OBJECTIVE');
    this.title = el('div', 'yk-objective-title', this.root);
    this.text = el('div', 'yk-objective-text', this.root);
  }

  update(): void {
    const obj = this.ctx.narrative.getTrackedObjective();
    const key = obj ? `${obj.titleZh}\n${obj.objectiveZh}` : '';
    if (key === this.key) return;
    this.key = key;
    toggle(this.root, 'is-on', obj !== null);
    if (!obj) return;
    setText(this.title, obj.titleZh);
    setText(this.text, obj.objectiveZh);
    play(this.root, [
      { opacity: 0, transform: 'translateX(12%) skewX(-12deg)' },
      { opacity: 1, transform: 'translateX(-2%) skewX(0deg)', offset: 0.6 },
      { opacity: 1, transform: 'translateX(0) skewX(0deg)' },
    ], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1)' });
    play(this.text, [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0.4, transform: 'scale(1.03)', offset: 0.5 },
      { opacity: 1, transform: 'scale(1)' },
    ], { duration: 900, iterations: 2, delay: 450 });
  }
}
