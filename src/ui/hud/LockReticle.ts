import type { Host } from '../Host';
import { el, place, play, toggle } from '../dom';
import type { ScreenPoint } from '../Projector';

/** Where on the body the reticle sits, as a fraction of height. */
const CHEST = 0.62;

/** Rotating gold brackets on the lock-on target's chest. */
export class LockReticle {
  private readonly root: HTMLDivElement;
  private readonly pt: ScreenPoint = { x: 0, y: 0 };
  private targetId = '';

  constructor(parent: HTMLElement, private readonly host: Host) {
    this.root = el('div', 'yk-reticle', parent);
    const spin = el('div', 'yk-reticle-spin', this.root);
    for (const corner of ['tl', 'tr', 'br', 'bl']) el('i', `yk-reticle-c yk-reticle-${corner}`, spin);
    el('div', 'yk-reticle-dot', this.root);
  }

  update(on: boolean): void {
    const t = on ? this.host.ctx.combat.lockTarget : null;
    const live = t !== null && t.isAlive();
    const visible = live && this.host.projector.project(t.position, t.height * CHEST, this.pt);
    toggle(this.root, 'is-on', visible);
    if (!visible) return;
    place(this.root, this.pt.x, this.pt.y);
    if (t.id === this.targetId) return;
    this.targetId = t.id;
    play(this.root.firstElementChild as HTMLElement, [
      { opacity: 0, transform: 'scale(2.2) rotate(-45deg)' },
      { opacity: 1, transform: 'scale(1) rotate(0deg)' },
    ], { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1)' });
  }
}
