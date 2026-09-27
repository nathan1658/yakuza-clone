import type { IInputManager } from '../../core/types';
import type { Host } from '../Host';
import type { Modal } from '../Modal';
import { el, play } from '../dom';
import { CREDITS, type CreditEntry } from './creditsData';

const DURATION_SEC = 60;
const FAST = 4;
const FADE_SEC = 1.2;

type Render = (parent: HTMLElement, entry: CreditEntry) => void;

const RENDER: Record<CreditEntry['kind'], Render> = {
  logo: (parent) => {
    const block = el('div', 'yk-credits-logo', parent);
    el('span', 'yk-credits-logo-main', block, '古惑仔');
    el('span', 'yk-credits-logo-sub', block, '銅鑼灣之龍');
    el('span', 'yk-credits-logo-en', block, 'THE DRAGON OF CAUSEWAY BAY');
  },
  role: (parent, e) => {
    if (e.kind !== 'role') return;
    const block = el('div', 'yk-credits-role', parent);
    el('div', 'yk-credits-role-zh', block, e.zh);
    el('div', 'yk-credits-role-en', block, e.en.toUpperCase());
    for (const [zh, en] of e.names) {
      const name = el('div', 'yk-credits-name', block, zh);
      el('small', '', name, en);
    }
  },
  note: (parent, e) => {
    if (e.kind !== 'note') return;
    const block = el('div', 'yk-credits-note', parent);
    el('div', 'yk-credits-note-zh', block, e.zh);
    el('div', 'yk-credits-note-en', block, e.en);
  },
};

/** ~60 s staff roll; holding confirm or cancel runs it at ×4. */
export class Credits implements Modal {
  private root: HTMLDivElement | null = null;
  private roll: HTMLDivElement | null = null;
  private pos = 0;
  private distance = 0;
  private viewH = 0;
  private resolve = (): void => {};

  constructor(private readonly host: Host, private readonly parent: HTMLElement) {}

  show(): Promise<void> {
    const { input } = this.host.ctx;
    input.exitPointerLock();
    this.root?.remove();
    const root = el('div', 'yk-screen yk-credits', this.parent);
    const roll = el('div', 'yk-credits-roll', root);
    for (const entry of CREDITS) RENDER[entry.kind](roll, entry);
    el('div', 'yk-hint yk-credits-hint', root, `按住 [${input.getLabel('confirm')}] 快轉`);
    this.root = root;
    this.roll = roll;
    this.viewH = root.clientHeight;
    this.distance = this.viewH + roll.offsetHeight;
    this.pos = 0;
    this.host.modals.push(this);
    play(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 1500, easing: 'ease-out' });
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  update(dt: number, input: IInputManager | null): void {
    const { root, roll } = this;
    if (!root || !roll) return;
    const fast = input !== null && (input.isDown('confirm') || input.isDown('cancel'));
    this.pos = Math.min(this.distance, this.pos + dt * (this.distance / DURATION_SEC) * (fast ? FAST : 1));
    roll.style.transform = `translate3d(0,${(this.viewH - this.pos).toFixed(1)}px,0)`;
    if (this.pos >= this.distance) this.finish(root);
  }

  private finish(root: HTMLDivElement): void {
    this.root = null;
    this.roll = null;
    this.host.modals.remove(this);
    play(root, [{ opacity: 1 }, { opacity: 0 }], { duration: FADE_SEC * 1000, fill: 'forwards' });
    void this.host.clock.wait(FADE_SEC).then(() => {
      root.remove();
      this.resolve();
    });
  }
}
