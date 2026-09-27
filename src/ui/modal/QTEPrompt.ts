import type { IInputManager, InputAction } from '../../core/types';
import type { Host } from '../Host';
import type { Modal } from '../Modal';
import { el, play, setText, take, toggle } from '../dom';
import { QTE_ACTIONS, QteRun } from '../logic/qte';

/** The ring shrinks from 1 to this scale as the window runs out. */
const RING_END = 0.35;
/** How long the success/fail flash stays up. */
const HIDE_SEC = 0.35;

/** Centre-screen button prompt with a closing ring and a dot per step. */
export class QTEPrompt implements Modal {
  private readonly root: HTMLDivElement;
  private readonly ring: HTMLDivElement;
  private readonly key: HTMLDivElement;
  private readonly dots: HTMLDivElement;
  private run: QteRun | null = null;
  private shown = -1;
  private resolve: (success: boolean) => void = () => {};
  private cancelHide: () => void = () => {};

  constructor(private readonly host: Host, parent: HTMLElement) {
    this.root = el('div', 'yk-qte', parent);
    this.ring = el('div', 'yk-qte-ring', this.root);
    this.key = el('div', 'yk-qte-key', this.root);
    this.dots = el('div', 'yk-qte-dots', this.root);
  }

  start(keys: readonly InputAction[], windowSec: number): Promise<boolean> {
    this.settle(false);
    this.cancelHide();
    this.run = new QteRun(keys, windowSec);
    this.shown = -1;
    this.dots.replaceChildren(...keys.map(() => el('i', 'yk-qte-dot')));
    this.root.classList.remove('is-success', 'is-fail');
    toggle(this.root, 'is-on', true);
    this.host.modals.push(this);
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  update(dt: number, input: IInputManager | null): void {
    const run = this.run;
    if (!run) return;
    const pressed = new Set(input ? QTE_ACTIONS.filter((a) => take(input, a)) : []);
    const step = run.step(dt, (a) => pressed.has(a));
    this.draw(run);
    if (step === 'success' || step === 'fail') this.end(step === 'success');
  }

  private draw(run: QteRun): void {
    this.ring.style.transform = `scale(${(1 - (1 - RING_END) * run.progress).toFixed(3)})`;
    if (run.index === this.shown) return;
    this.shown = run.index;
    const key = run.current;
    if (key) setText(this.key, this.host.ctx.input.getLabel(key));
    Array.from(this.dots.children).forEach((dot, i) => {
      toggle(dot, 'is-done', i < run.index);
      toggle(dot, 'is-current', i === run.index);
    });
    play(this.key, [
      { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
    ], { duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' });
    if (key) this.host.ctx.audio.playSfx('qte_prompt');
  }

  private end(success: boolean): void {
    const { audio, events } = this.host.ctx;
    audio.playSfx(success ? 'qte_success' : 'qte_fail');
    events.emit('qte:result', { success });
    toggle(this.root, success ? 'is-success' : 'is-fail', true);
    this.settle(success);
    this.cancelHide = this.host.clock.schedule(HIDE_SEC, () => toggle(this.root, 'is-on', false));
  }

  private settle(success: boolean): void {
    if (!this.run) return;
    this.run = null;
    this.host.modals.remove(this);
    this.resolve(success);
  }
}
