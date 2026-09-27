import type { Clock } from '../logic/Clock';
import { el, play, setText, toggle } from '../dom';

/** One cinematic subtitle line at the bottom centre. A new line replaces the old. */
export class Subtitle {
  private readonly root: HTMLDivElement;
  private readonly speaker: HTMLSpanElement;
  private readonly text: HTMLSpanElement;
  private cancel = (): void => {};

  constructor(parent: HTMLElement, private readonly clock: Clock) {
    this.root = el('div', 'yk-subtitle', parent);
    this.speaker = el('span', 'yk-subtitle-speaker', this.root);
    this.text = el('span', 'yk-subtitle-text', this.root);
  }

  show(text: string, speaker = '', durationSec = 3.5): void {
    setText(this.speaker, speaker);
    setText(this.text, text);
    toggle(this.root, 'has-speaker', speaker !== '');
    toggle(this.root, 'is-on', true);
    play(this.root, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    this.cancel();
    this.cancel = this.clock.schedule(durationSec, () => toggle(this.root, 'is-on', false));
  }
}
