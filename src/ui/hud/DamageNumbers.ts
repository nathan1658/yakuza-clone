import { Vector3 } from 'three';
import type { HitEvent } from '../../core/types';
import type { Host } from '../Host';
import { el, place, play, setText, toggle } from '../dom';
import { damageStyle } from '../logic/damageStyle';
import { SlotPool } from '../logic/SlotPool';
import type { ScreenPoint } from '../Projector';

const POOL_SIZE = 24;
const LIFE_SEC = 0.9;
const RISE_M = 0.8;
const JITTER_M = 0.25;
const PLAYER_ID = 'player';
const TONES = ['blocked', 'taken', 'dealt', 'heavy'] as const;

interface Num {
  readonly root: HTMLDivElement;
  readonly text: HTMLSpanElement;
  readonly pos: Vector3;
  born: number;
}

/**
 * Pooled floating hit numbers. Created on 'combat:hit', positioned every
 * lateUpdate, faded by a WAAPI animation (transform/opacity only).
 */
export class DamageNumbers {
  private readonly pool: SlotPool<Num>;
  private readonly pt: ScreenPoint = { x: 0, y: 0 };

  constructor(parent: HTMLElement, private readonly host: Host) {
    const nums: Num[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const root = el('div', 'yk-dmg', parent);
      nums.push({ root, text: el('span', 'yk-dmg-text', root), pos: new Vector3(), born: 0 });
    }
    this.pool = new SlotPool(nums);
  }

  spawn(hit: HitEvent): void {
    const style = damageStyle(hit, PLAYER_ID);
    if (!style) return;
    const { item } = this.pool.acquire();
    item.born = this.host.clock.now;
    item.pos.set(
      hit.position.x + (Math.random() - 0.5) * JITTER_M,
      hit.position.y + Math.random() * JITTER_M,
      hit.position.z + (Math.random() - 0.5) * JITTER_M,
    );
    setText(item.text, style.text);
    for (const tone of TONES) toggle(item.root, `is-${tone}`, tone === style.tone);
    toggle(item.root, 'is-crit', style.crit);
    play(item.text, [
      { opacity: 0, transform: 'scale(2.1)' },
      { opacity: 1, transform: 'scale(0.92)', offset: 0.14 },
      { opacity: 1, transform: 'scale(1)', offset: 0.24 },
      { opacity: 1, transform: 'scale(1)', offset: 0.7 },
      { opacity: 0, transform: 'scale(0.9)' },
    ], { duration: LIFE_SEC * 1000, easing: 'ease-out', fill: 'forwards' });
  }

  /** lateUpdate: move live numbers, retire old ones. */
  update(): void {
    const now = this.host.clock.now;
    const expired = this.pool.activeItems.filter((n) => now - n.born >= LIFE_SEC);
    for (const n of expired) this.retire(n);
    for (const n of this.pool.activeItems) this.position(n, now - n.born);
  }

  clear(): void {
    for (const n of [...this.pool.activeItems]) this.retire(n);
  }

  private position(n: Num, age: number): void {
    const rise = RISE_M * (1 - (1 - age / LIFE_SEC) ** 2);
    const visible = this.host.projector.project(n.pos, rise, this.pt);
    toggle(n.root, 'is-on', visible);
    if (visible) place(n.root, this.pt.x, this.pt.y);
  }

  private retire(n: Num): void {
    toggle(n.root, 'is-on', false);
    this.pool.release(n);
  }
}
