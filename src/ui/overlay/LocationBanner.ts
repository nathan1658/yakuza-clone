import { ZONE_NAMES, type ZoneId } from '../../core/types';
import type { Clock } from '../logic/Clock';
import { el, play, setText } from '../dom';

const DURATION_SEC = 3.6;

/** Zone name card with a neon sweep, e.g. 軒尼詩道 / HENNESSY ROAD. */
export class LocationBanner {
  private readonly root: HTMLDivElement;
  private readonly zh: HTMLSpanElement;
  private readonly en: HTMLSpanElement;
  private readonly sweep: HTMLDivElement;
  private zone: ZoneId | null = null;
  private until = 0;

  constructor(parent: HTMLElement, private readonly clock: Clock) {
    this.root = el('div', 'yk-location', parent);
    el('div', 'yk-location-rule', this.root);
    this.zh = el('span', 'yk-location-zh', this.root);
    this.en = el('span', 'yk-location-en', this.root);
    this.sweep = el('div', 'yk-location-sweep', this.root);
  }

  /** Re-announcing the zone that is already on screen does nothing. */
  show(zone: ZoneId): void {
    const now = this.clock.now;
    if (zone === this.zone && now < this.until) return;
    this.zone = zone;
    this.until = now + DURATION_SEC;
    setText(this.zh, ZONE_NAMES[zone].zh);
    setText(this.en, ZONE_NAMES[zone].en.toUpperCase());
    const ms = DURATION_SEC * 1000;
    play(this.root, [
      { opacity: 0, transform: 'translateX(-6%)' },
      { opacity: 1, transform: 'translateX(0)', offset: 0.1 },
      { opacity: 1, transform: 'translateX(0)', offset: 0.85 },
      { opacity: 0, transform: 'translateX(2%)' },
    ], { duration: ms, easing: 'ease-out' });
    play(this.sweep, [
      { opacity: 0, transform: 'translateX(-120%) skewX(-24deg)' },
      { opacity: 1, transform: 'translateX(-40%) skewX(-24deg)', offset: 0.08 },
      { opacity: 0, transform: 'translateX(260%) skewX(-24deg)', offset: 0.3 },
      { opacity: 0, transform: 'translateX(260%) skewX(-24deg)' },
    ], { duration: ms, easing: 'ease-in-out' });
  }
}
