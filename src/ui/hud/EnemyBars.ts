import type { ICharacter } from '../../core/types';
import type { Host } from '../Host';
import { el, place, setText, toggle } from '../dom';
import { SlotPool } from '../logic/SlotPool';
import type { ScreenPoint } from '../Projector';
import { HpBar } from './HpBar';

const POOL_SIZE = 8;
const HEAD_CLEARANCE_M = 0.35;

interface Slot {
  id: string;
  readonly root: HTMLDivElement;
  readonly name: HTMLSpanElement;
  readonly bar: HpBar;
}

/** Small name + HP bars over every active enemy (the boss has its own bar). */
export class EnemyBars {
  private readonly pool: SlotPool<Slot>;
  private readonly byId = new Map<string, Slot>();
  private readonly seen = new Set<string>();
  private readonly pt: ScreenPoint = { x: 0, y: 0 };

  constructor(parent: HTMLElement, private readonly host: Host) {
    const slots: Slot[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const root = el('div', 'yk-enemy', parent);
      const name = el('span', 'yk-enemy-name', root);
      slots.push({ id: '', root, name, bar: new HpBar(root, 'yk-bar--enemy') });
    }
    this.pool = new SlotPool(slots);
  }

  update(on: boolean): void {
    const { combat } = this.host.ctx;
    this.seen.clear();
    const lockId = combat.lockTarget?.id ?? '';
    for (const e of on ? combat.getActiveEnemies() : []) {
      if (e.role !== 'boss' && e.isAlive()) this.show(e, e.id === lockId);
    }
    const stale = this.pool.activeItems.filter((s) => !this.seen.has(s.id));
    for (const slot of stale) this.free(slot);
  }

  private show(e: ICharacter, locked: boolean): void {
    this.seen.add(e.id);
    const slot = this.byId.get(e.id) ?? this.claim(e);
    const visible = this.host.projector.project(e.position, e.height + HEAD_CLEARANCE_M, this.pt);
    toggle(slot.root, 'is-on', visible);
    toggle(slot.root, 'is-locked', locked);
    if (!visible) return;
    place(slot.root, this.pt.x, this.pt.y);
    slot.bar.set(e.hp / e.maxHp);
  }

  private claim(e: ICharacter): Slot {
    const { item } = this.pool.acquire();
    this.byId.delete(item.id);
    item.id = e.id;
    this.byId.set(e.id, item);
    setText(item.name, e.displayName);
    item.bar.set(e.hp / e.maxHp, true);
    return item;
  }

  private free(slot: Slot): void {
    this.byId.delete(slot.id);
    slot.id = '';
    toggle(slot.root, 'is-on', false);
    this.pool.release(slot);
  }
}
