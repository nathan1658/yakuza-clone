import type { Clock } from '../logic/Clock';
import { el, play } from '../dom';

/** Full-screen black fade. A new fade starts from wherever the last one is. */
export class Fader {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly clock: Clock) {
    this.root = el('div', 'yk-fader', parent);
  }

  fade(toBlack: boolean, durationSec: number): Promise<void> {
    const from = getComputedStyle(this.root).opacity;
    const to = toBlack ? '1' : '0';
    const sec = Math.max(0, durationSec);
    this.root.style.opacity = to;
    play(this.root, [{ opacity: from }, { opacity: to }], { duration: sec * 1000, easing: 'ease-in-out' });
    return this.clock.wait(sec);
  }
}
