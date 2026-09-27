import type { DialogueLineView, IInputManager, InputAction } from '../../core/types';
import type { Host } from '../Host';
import type { Modal } from '../Modal';
import { MenuList, type MenuItem } from '../MenuList';
import { el, play, setText, take, toggle } from '../dom';
import { Typewriter } from '../logic/typewriter';

/** Any of these finishes the line, then advances it. */
const ADVANCE: readonly InputAction[] = ['confirm', 'interact', 'lightAttack'];
const CHOICE_KEYS: readonly InputAction[] = ['choice1', 'choice2', 'choice3', 'choice4'];
/** A fresh choice list refuses picks this long, so mashing through the text can't choose unseen. */
const CHOICE_LOCK_SEC = 0.35;

/** Stable per-speaker voice pitch in 0.85..1.25, so each character "sounds" different. */
function voicePitch(speaker: string): number {
  let h = 7;
  for (const ch of speaker) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 0.85 + (h % 41) / 100;
}

/**
 * Bottom dialogue box. One line at a time: typewriter with voice blips, then
 * either "next" or a choice list. The box stays up between lines (no flicker)
 * until the narrative calls hideDialogue().
 */
export class DialogueBox implements Modal {
  private readonly root: HTMLDivElement;
  private readonly speaker: HTMLSpanElement;
  private readonly shown: HTMLSpanElement;
  private readonly rest: HTMLSpanElement;
  private readonly gloss: HTMLDivElement;
  private readonly choiceList: HTMLDivElement;
  private readonly menu: MenuList;
  private line: DialogueLineView | null = null;
  private tw: Typewriter | null = null;
  private drawn = -1;
  private choices: MenuItem[] = [];
  private choiceLock = 0;
  private pitch = 1;
  private resolve: ((choice: number) => void) | null = null;

  constructor(private readonly host: Host, parent: HTMLElement) {
    this.menu = new MenuList(host.ctx.audio);
    this.root = el('div', 'yk-dialogue', parent);
    const box = el('div', 'yk-dlg-box', this.root);
    this.speaker = el('span', 'yk-dlg-speaker', el('div', 'yk-dlg-plate', box));
    const text = el('div', 'yk-dlg-text', box);
    this.shown = el('span', 'yk-dlg-shown', text);
    this.rest = el('span', 'yk-dlg-rest', text);
    this.gloss = el('div', 'yk-dlg-gloss', box);
    this.choiceList = el('div', 'yk-dlg-choices', box);
    el('div', 'yk-dlg-next', box, '▼');
    this.root.addEventListener('click', () => this.advance());
  }

  present(line: DialogueLineView): Promise<number> {
    this.settle(-1);
    this.line = line;
    this.tw = new Typewriter(line.text);
    this.drawn = -1;
    this.pitch = voicePitch(line.speaker);
    this.clearChoices();
    setText(this.speaker, line.speaker);
    setText(this.gloss, line.gloss ?? '');
    toggle(this.root, 'is-narration', line.speaker === '');
    toggle(this.root, 'has-gloss', Boolean(line.gloss));
    toggle(this.root, 'is-typed', false);
    if (line.speakerColor) this.root.style.setProperty('--speaker', line.speakerColor);
    else this.root.style.removeProperty('--speaker');
    this.draw(this.tw);
    if (!this.root.classList.contains('is-on')) {
      toggle(this.root, 'is-on', true);
      play(this.root, [
        { opacity: 0, transform: 'translateY(12%)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
    toggle(this.root, 'is-pending', true);
    this.host.modals.push(this);
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  hide(): void {
    this.settle(-1);
    this.clearChoices();
    this.line = null;
    this.tw = null;
    toggle(this.root, 'is-on', false);
  }

  update(dt: number, input: IInputManager | null): void {
    const tw = this.tw;
    if (!tw || !this.resolve) return;
    this.type(tw, dt);
    this.choiceLock -= dt;
    if (!input) return;
    if (this.choices.length > 0) this.handleChoices(input);
    else if (ADVANCE.filter((a) => take(input, a)).length > 0) this.advance();
  }

  private type(tw: Typewriter, dt: number): void {
    if (tw.done) return;
    const blip = tw.advance(dt);
    if (blip && this.line?.speaker) {
      this.host.ctx.audio.playSfx('dialogue_blip', { pitch: this.pitch, volume: 0.55 });
    }
    this.draw(tw);
    if (tw.done) this.typed();
  }

  /** Only touches the DOM when another character became visible. */
  private draw(tw: Typewriter): void {
    if (tw.shown === this.drawn) return;
    this.drawn = tw.shown;
    this.shown.textContent = tw.visibleText();
    this.rest.textContent = tw.hiddenText();
  }

  private typed(): void {
    toggle(this.root, 'is-typed', true);
    const choices = this.line?.choices ?? [];
    if (choices.length > 0) this.showChoices(choices);
  }

  /** Click or key: first finishes the typing, the next one moves on. */
  private advance(): void {
    const tw = this.tw;
    if (!tw || !this.resolve) return;
    if (!tw.done) {
      tw.finish();
      this.draw(tw);
      this.typed();
      return;
    }
    if (this.choices.length > 0) return;
    this.host.ctx.audio.playSfx('ui_confirm', { volume: 0.4 });
    this.settle(-1);
  }

  private showChoices(choices: NonNullable<DialogueLineView['choices']>): void {
    this.choiceLock = CHOICE_LOCK_SEC;
    this.choices = choices.map((c, i) => {
      const row = el('div', 'yk-row yk-dlg-choice', this.choiceList);
      el('span', 'yk-dlg-choice-num', row, String(i + 1));
      el('span', 'yk-dlg-choice-text', row, c.text);
      return { el: row, enabled: !c.disabled, activate: () => this.pick(i) };
    });
    this.menu.setItems(this.choices, 0);
    toggle(this.root, 'has-choices', true);
  }

  private handleChoices(input: IInputManager): void {
    const n = CHOICE_KEYS.findIndex((a) => take(input, a));
    if (n >= 0) this.pickNumber(n);
    else this.menu.handleInput(input);
    // E / J must not leak into the world while a choice is on screen.
    for (const a of ADVANCE) input.consume(a);
  }

  private pickNumber(n: number): void {
    const item = this.choices[n];
    if (!item) return;
    if (!item.enabled) {
      this.host.ctx.audio.playSfx('ui_cancel');
      return;
    }
    this.menu.select(n, false);
    this.menu.activate();
  }

  /** Every way of picking (confirm, number key, click) lands here; false plays ui_cancel. */
  private pick(i: number): boolean {
    if (this.choiceLock > 0) return false;
    this.settle(i);
    return true;
  }

  private clearChoices(): void {
    this.choices = [];
    this.choiceList.replaceChildren();
    toggle(this.root, 'has-choices', false);
  }

  private settle(choice: number): void {
    const resolve = this.resolve;
    if (!resolve) return;
    this.resolve = null;
    this.host.modals.remove(this);
    toggle(this.root, 'is-pending', false);
    if (choice >= 0) this.clearChoices();
    resolve(choice);
  }
}
