import type { IInteractable } from '../../core/types';
import type { Host } from '../Host';
import { el, place, play, setText, toggle } from '../dom';
import type { ScreenPoint } from '../Projector';

const LIFT_M = 1.9;

/** "[E] 對話" floating above the best interactable. */
export class InteractPrompt {
  private readonly root: HTMLDivElement;
  private readonly key: HTMLSpanElement;
  private readonly label: HTMLSpanElement;
  private readonly pt: ScreenPoint = { x: 0, y: 0 };
  private target: IInteractable | null = null;

  constructor(parent: HTMLElement, private readonly host: Host) {
    this.root = el('div', 'yk-prompt', parent);
    const inner = el('div', 'yk-prompt-inner', this.root);
    this.key = el('span', 'yk-prompt-key', inner);
    inner.append(' ');
    this.label = el('span', 'yk-prompt-label', inner);
  }

  update(on: boolean): void {
    const { interactions, input } = this.host.ctx;
    const target = on ? interactions.current : null;
    const visible = target !== null && this.host.projector.project(target.getPosition(), LIFT_M, this.pt);
    toggle(this.root, 'is-on', visible);
    if (!visible) return;
    place(this.root, this.pt.x, this.pt.y);
    setText(this.key, `[${input.getLabel('interact')}]`);
    setText(this.label, target.label);
    if (target === this.target) return;
    this.target = target;
    play(this.root.firstElementChild as HTMLElement, [
      { opacity: 0, transform: 'scale(1.4) skewX(-10deg)' },
      { opacity: 1, transform: 'scale(1) skewX(-10deg)' },
    ], { duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' });
  }
}
