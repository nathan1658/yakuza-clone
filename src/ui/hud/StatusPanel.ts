import type { GameContext } from '../../core/types';
import { el, play, setText, toggle } from '../dom';
import { formatMoney, formatMoneyDelta } from '../logic/format';
import { HpBar } from './HpBar';

const HEAT_BARS = 3;

/** Top-left: name plate, HP with chip, 3-bar heat gauge, wallet. */
export class StatusPanel {
  private readonly hp: HpBar;
  private readonly hpText: HTMLSpanElement;
  private readonly heat: HTMLDivElement;
  private readonly segs: HTMLDivElement[] = [];
  private readonly money: HTMLSpanElement;
  private readonly moneyDelta: HTMLSpanElement;
  private lastHp = '';
  private lastHeat = -1;
  private lastMoney = Number.NaN;

  constructor(parent: HTMLElement, private readonly ctx: GameContext) {
    const root = el('div', 'yk-status', parent);
    const plate = el('div', 'yk-status-plate', root);
    el('span', 'yk-status-crest', plate, '龍');
    el('span', 'yk-status-name', plate, '陳浩南');
    this.hpText = el('span', 'yk-status-hp', plate);
    this.hp = new HpBar(root, 'yk-bar--player');
    this.heat = el('div', 'yk-heat', root);
    for (let i = 0; i < HEAT_BARS; i++) {
      this.segs.push(el('div', 'yk-heat-fill', el('div', 'yk-heat-seg', this.heat)));
    }
    el('div', 'yk-heat-flame', this.heat);
    const wallet = el('div', 'yk-money', root);
    this.money = el('span', 'yk-money-value', wallet);
    this.moneyDelta = el('span', 'yk-money-delta', wallet);
  }

  update(): void {
    const { entities, combat, inventory } = this.ctx;
    const p = entities.player;
    this.hp.set(p.maxHp > 0 ? p.hp / p.maxHp : 0);
    const hpText = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
    if (hpText !== this.lastHp) setText(this.hpText, (this.lastHp = hpText));
    this.setHeat(combat.heat, combat.maxHeat);
    this.setMoney(inventory.money);
  }

  private setHeat(heat: number, maxHeat: number): void {
    const q = Math.round(heat);
    if (q === this.lastHeat) return;
    this.lastHeat = q;
    const per = maxHeat / HEAT_BARS;
    this.segs.forEach((fill, i) => {
      const f = Math.min(1, Math.max(0, (heat - per * i) / per));
      fill.style.transform = `scaleX(${f.toFixed(3)})`;
      toggle(fill.parentElement!, 'is-full', f >= 1);
    });
    toggle(this.heat, 'is-max', heat >= maxHeat - 0.5);
  }

  private setMoney(money: number): void {
    if (money === this.lastMoney) return;
    const delta = money - this.lastMoney;
    this.lastMoney = money;
    setText(this.money, formatMoney(money));
    if (!Number.isFinite(delta)) return;
    setText(this.moneyDelta, formatMoneyDelta(delta));
    toggle(this.moneyDelta, 'is-loss', delta < 0);
    play(this.moneyDelta, [
      { opacity: 0, transform: 'translateY(40%)' },
      { opacity: 1, transform: 'translateY(0)', offset: 0.12 },
      { opacity: 1, transform: 'translateY(0)', offset: 0.75 },
      { opacity: 0, transform: 'translateY(-60%)' },
    ], { duration: 1600, easing: 'ease-out' });
  }
}
