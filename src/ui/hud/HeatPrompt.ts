import type { Host } from '../Host';
import { el, place, play, setText, toggle } from '../dom';
import type { ScreenPoint } from '../Projector';

const LIFT_M = 0.45;

/** "[F] 名稱" over the player's head while a heat action is available. */
export class HeatPrompt {
  private readonly root: HTMLDivElement;
  private readonly key: HTMLSpanElement;
  private readonly zh: HTMLSpanElement;
  private readonly en: HTMLSpanElement;
  private readonly pt: ScreenPoint = { x: 0, y: 0 };
  private name = '';

  constructor(parent: HTMLElement, private readonly host: Host) {
    this.root = el('div', 'yk-heatprompt', parent);
    const inner = el('div', 'yk-heatprompt-inner', this.root);
    const line = el('div', 'yk-heatprompt-line', inner);
    this.key = el('span', 'yk-heatprompt-key', line);
    line.append(' ');
    this.zh = el('span', 'yk-heatprompt-zh', line);
    this.en = el('span', 'yk-heatprompt-en', inner);
  }

  update(on: boolean): void {
    const { combat, entities, input } = this.host.ctx;
    const heat = on ? combat.heatActionAvailable : null;
    const player = entities.player;
    const visible = heat !== null && this.host.projector.project(player.position, player.height + LIFT_M, this.pt);
    toggle(this.root, 'is-on', visible);
    if (!visible) {
      this.name = '';
      return;
    }
    place(this.root, this.pt.x, this.pt.y);
    if (heat.nameZh === this.name) return;
    this.name = heat.nameZh;
    setText(this.key, `[${input.getLabel('heatAction')}]`);
    setText(this.zh, heat.nameZh);
    setText(this.en, heat.nameEn);
    play(this.root.firstElementChild as HTMLElement, [
      { opacity: 0, transform: 'scale(1.6) skewX(-12deg)' },
      { opacity: 1, transform: 'scale(1) skewX(-12deg)' },
    ], { duration: 200, easing: 'cubic-bezier(.16,1,.3,1)' });
  }
}
