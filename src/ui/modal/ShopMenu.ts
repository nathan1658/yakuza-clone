import type { IInputManager, InputAction, ItemDef, ItemId, ShopDef, ShopId } from '../../core/types';
import type { Host } from '../Host';
import type { Modal } from '../Modal';
import { MenuList, type MenuItem } from '../MenuList';
import { el, play, setText, take, toggle } from '../dom';
import { formatMoney } from '../logic/format';
import { effectText, USE_NOW } from './pauseTab';

interface View {
  readonly shop: ShopDef;
  readonly root: HTMLDivElement;
  readonly list: HTMLElement;
  readonly say: HTMLElement;
  readonly money: HTMLElement;
  readonly desc: HTMLElement;
}

interface Mode {
  readonly label: string;
  readonly now: boolean;
}

const LEAVE: readonly InputAction[] = ['cancel', 'pause'];
const SHAKE: Keyframe[] = [0, -10, 9, -6, 4, 0].map((x) => ({ transform: `translateX(${x}px)` }));

/**
 * Street-stall menu. Each row: eat/drink it on the spot (Yakuza style) or
 * pocket it. Left/right flips the mode, confirm buys one. The narrative owns
 * the 'shop' game state; this only draws and buys.
 */
export class ShopMenu implements Modal {
  private readonly menu: MenuList;
  private view: View | null = null;
  private resolve = (): void => {};

  constructor(private readonly host: Host, private readonly parent: HTMLElement) {
    this.menu = new MenuList(host.ctx.audio);
  }

  open(shopId: ShopId): Promise<void> {
    this.leave();
    const { input, audio, inventory } = this.host.ctx;
    input.exitPointerLock();
    audio.playSfx('ui_open');
    const view = this.build(inventory.getShop(shopId));
    this.view = view;
    this.menu.setItems(view.shop.items.map((id) => this.row(view, id)), 0);
    this.host.modals.push(this);
    play(view.root, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  update(_dt: number, input: IInputManager | null): void {
    const view = this.view;
    if (!view) return;
    setText(view.money, formatMoney(this.host.ctx.inventory.money));
    if (!input) return;
    if (LEAVE.filter((a) => take(input, a)).length > 0) {
      this.close();
      return;
    }
    if (this.menu.handleInput(input)) return;
    const dir = take(input, 'menuLeft') ? -1 : take(input, 'menuRight') ? 1 : 0;
    if (dir !== 0) this.menu.horizontal(dir);
  }

  private build(shop: ShopDef): View {
    const label = (a: InputAction) => this.host.ctx.input.getLabel(a);
    const root = el('div', 'yk-screen yk-shop', this.parent);
    const panel = el('div', 'yk-shop-panel', root);
    const head = el('div', 'yk-shop-head', panel);
    el('div', 'yk-shop-title', head, shop.nameZh);
    el('div', 'yk-shop-title-en', head, shop.nameEn);
    const money = el('div', 'yk-shop-money', head);
    const say = el('div', 'yk-shop-say', panel, `「${shop.greetingZh}」`);
    const list = el('div', 'yk-shop-list', panel);
    const desc = el('div', 'yk-shop-desc', panel);
    const foot = el('div', 'yk-shop-foot', panel);
    el('span', 'yk-hint', foot,
      `[${label('menuLeft')}/${label('menuRight')}] 揀食法　[${label('confirm')}] 買`);
    el('span', 'yk-hint yk-shop-leave', foot, `[${label('cancel')}] 走`)
      .addEventListener('click', () => this.close());
    return { shop, root, list, say, money, desc };
  }

  private row(view: View, id: ItemId): MenuItem {
    const { inventory, audio } = this.host.ctx;
    const def = inventory.getItemDef(id);
    const modes: Mode[] = [{ label: USE_NOW[def.kind], now: true }, { label: '買落袋', now: false }]
      .filter((m) => m.label);
    const row = el('div', 'yk-row yk-shop-row', view.list);
    const name = el('div', 'yk-shop-name', row);
    el('span', 'yk-row-zh', name, def.nameZh);
    el('span', 'yk-row-en', name, def.nameEn);
    el('span', 'yk-shop-fx', row, effectText(def));
    const owned = el('span', 'yk-shop-owned', row);
    const box = el('div', 'yk-shop-modes', row);
    el('span', 'yk-shop-price', row, formatMoney(def.price));
    let mode = 0;
    const buttons = modes.map((m, i) => {
      const b = el('span', 'yk-shop-mode', box, m.label);
      // No stopPropagation: the row's click then selects and buys in this mode.
      b.addEventListener('click', () => setMode(i));
      return b;
    });
    const setMode = (i: number) => {
      mode = i;
      buttons.forEach((b, k) => toggle(b, 'is-active', k === i));
    };
    const showOwned = () => setText(owned, `持有 ×${inventory.count(id)}`);
    setMode(0);
    showOwned();
    return {
      el: row,
      enabled: true,
      focus: () => setText(view.desc, def.descZh),
      horizontal: (dir) => {
        setMode((mode + dir + modes.length) % modes.length);
        audio.playSfx('ui_move');
      },
      activate: () => this.buy(view, row, def, modes[mode]!.now, showOwned),
    };
  }

  private buy(view: View, row: HTMLElement, def: ItemDef, now: boolean, bought: () => void): boolean {
    if (!this.host.ctx.inventory.buy(view.shop.id, def.id, now)) {
      this.say(view, '唔夠錢喎！', true);
      play(row, SHAKE, { duration: 280, easing: 'ease-out' });
      return false;
    }
    const effect = effectText(def);
    this.say(view, now ? `多謝幫襯！${effect ? `（${effect}）` : ''}` : `多謝幫襯！${def.nameZh} ×1 落袋`, false);
    bought();
    return true;
  }

  private say(view: View, text: string, angry: boolean): void {
    setText(view.say, `「${text}」`);
    toggle(view.say, 'is-angry', angry);
    play(view.say, [
      { opacity: 0.4, transform: 'translateX(-6px)' },
      { opacity: 1, transform: 'translateX(0)' },
    ], { duration: 160, easing: 'ease-out' });
  }

  private close(): void {
    if (!this.view) return;
    this.leave();
    this.host.ctx.input.requestPointerLock();
    this.host.ctx.audio.playSfx('ui_close');
  }

  /** Drop the current view (if any) and let openShop()'s caller continue. */
  private leave(): void {
    this.view?.root.remove();
    this.view = null;
    this.host.modals.remove(this);
    this.resolve();
  }
}
