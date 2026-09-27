import { el, play, setText, toggle } from '../dom';
import { HpBar } from './HpBar';

const PHASES = 3;

/** Wide bottom bar for 烏鴉: name, title, HP with chip, phase pips. */
export class BossBar {
  private readonly root: HTMLDivElement;
  private readonly name: HTMLSpanElement;
  private readonly title: HTMLSpanElement;
  private readonly bar: HpBar;
  private readonly pips: HTMLElement[] = [];
  private shown = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'yk-boss', parent);
    const head = el('div', 'yk-boss-head', this.root);
    this.name = el('span', 'yk-boss-name', head);
    this.title = el('span', 'yk-boss-title', head);
    const pips = el('span', 'yk-boss-pips', head);
    for (let i = 0; i < PHASES; i++) this.pips.push(el('i', 'yk-boss-pip', pips));
    this.bar = new HpBar(this.root, 'yk-bar--boss');
  }

  show(name: string, title: string): void {
    this.shown = true;
    setText(this.name, name);
    setText(this.title, title);
    this.bar.set(1, true);
    this.setPhase(1);
    toggle(this.root, 'is-on', true);
    play(this.root, [
      { opacity: 0, transform: 'translateY(60%) scaleX(1.3)' },
      { opacity: 1, transform: 'translateY(0) scaleX(1)' },
    ], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1)' });
  }

  hide(): void {
    this.shown = false;
    toggle(this.root, 'is-on', false);
  }

  /** Hidden (but not forgotten) during cutscenes, dialogue and menus. */
  suppress(suppressed: boolean): void {
    toggle(this.root, 'is-on', this.shown && !suppressed);
  }

  setHp(hp: number, maxHp: number): void {
    this.bar.set(maxHp > 0 ? hp / maxHp : 0);
  }

  /** 1-based phase. */
  setPhase(phase: number): void {
    const p = Math.min(PHASES, Math.max(1, Math.round(phase)));
    this.pips.forEach((pip, i) => toggle(pip, 'is-spent', i < p - 1));
    toggle(this.root, 'is-enraged', p === PHASES);
  }
}
