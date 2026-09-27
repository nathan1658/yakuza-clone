import type { IInputManager, InputAction } from '../../core/types';
import type { Host } from '../Host';
import type { Modal } from '../Modal';
import type { ControlsOverlay } from '../screens/ControlsOverlay';
import { MenuList } from '../MenuList';
import { el, play, setText, take, toggle } from '../dom';
import { formatMoney, formatPlayTime } from '../logic/format';
import { buildItems } from './pauseItems';
import { buildQuests } from './pauseQuests';
import { buildSystem } from './pauseSystem';
import type { PauseTabBuilder, PauseTabEnv } from './pauseTab';

export type PauseTab = 'inventory' | 'quests' | 'system';

const TABS: readonly { id: PauseTab; zh: string; en: string; build: PauseTabBuilder }[] = [
  { id: 'inventory', zh: '物品', en: 'ITEMS', build: buildItems },
  { id: 'quests', zh: '任務', en: 'QUESTS', build: buildQuests },
  { id: 'system', zh: '系統', en: 'SYSTEM', build: buildSystem },
];
const CLOSE: readonly InputAction[] = ['cancel', 'pause', 'inventory'];

/** Yakuza-style pause menu: tabs across the top, rows on the left, detail on the right. */
export class PauseMenu implements Modal {
  private readonly menu: MenuList;
  private readonly root: HTMLDivElement;
  private readonly tabEls: HTMLElement[];
  private readonly money: HTMLElement;
  private readonly time: HTMLElement;
  private readonly env: PauseTabEnv;
  private tab = 0;

  constructor(private readonly host: Host, private readonly parent: HTMLElement, controls: ControlsOverlay) {
    this.menu = new MenuList(host.ctx.audio);
    this.root = el('div', 'yk-screen yk-pause');
    el('div', 'yk-pause-bg', this.root);
    const panel = el('div', 'yk-pause-panel', this.root);
    const head = el('div', 'yk-pause-head', panel);
    el('div', 'yk-pause-title', head, '暫停');
    const tabs = el('div', 'yk-pause-tabs', head);
    this.tabEls = TABS.map((t, i) => this.tabButton(tabs, t.zh, t.en, i));
    const stats = el('div', 'yk-pause-stats', head);
    this.money = el('span', 'yk-pause-money', stats);
    this.time = el('span', 'yk-pause-time', stats);
    const body = el('div', 'yk-pause-body', panel);
    const list = el('div', 'yk-pause-list', body);
    const detail = el('div', 'yk-pause-detail', body);
    const foot = el('div', 'yk-pause-foot', panel);
    el('span', 'yk-hint', foot, this.hintText());
    el('span', 'yk-hint yk-pause-back', foot, `[${host.ctx.input.getLabel('cancel')}] 返回`)
      .addEventListener('click', () => this.close());
    this.env = {
      ctx: host.ctx,
      list,
      detail,
      refresh: () => this.rebuild(this.menu.index),
      close: () => this.close(),
      showControls: () => void controls.open(),
    };
  }

  get isOpen(): boolean {
    return this.root.isConnected;
  }

  open(tab: PauseTab = 'system'): void {
    const index = Math.max(0, TABS.findIndex((t) => t.id === tab));
    if (this.isOpen) {
      this.showTab(index);
      return;
    }
    if (!this.host.ctx.state.transition('menu', { tab })) return;
    this.host.ctx.input.exitPointerLock();
    this.host.ctx.audio.playSfx('ui_open');
    this.parent.appendChild(this.root);
    this.showTab(index);
    this.updateStats();
    this.host.modals.push(this);
    play(this.root, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  }

  close(): void {
    if (!this.isOpen) return;
    const { state, input, audio } = this.host.ctx;
    this.root.remove();
    this.host.modals.remove(this);
    if (state.is('menu')) state.back();
    input.requestPointerLock();
    audio.playSfx('ui_close');
  }

  update(_dt: number, input: IInputManager | null): void {
    if (!this.isOpen) return;
    this.updateStats();
    if (!input) return;
    if (CLOSE.filter((a) => take(input, a)).length > 0) {
      this.close();
      return;
    }
    if (this.menu.handleInput(input)) return;
    const dir = take(input, 'menuLeft') ? -1 : take(input, 'menuRight') ? 1 : 0;
    if (dir === 0 || this.menu.horizontal(dir)) return;
    this.host.ctx.audio.playSfx('ui_move');
    this.showTab((this.tab + dir + TABS.length) % TABS.length);
  }

  private tabButton(parent: HTMLElement, zh: string, en: string, index: number): HTMLElement {
    const tab = el('div', 'yk-pause-tab', parent);
    el('span', 'yk-pause-tab-zh', tab, zh);
    el('span', 'yk-pause-tab-en', tab, en);
    tab.addEventListener('click', () => {
      if (index === this.tab) return;
      this.host.ctx.audio.playSfx('ui_move');
      this.showTab(index);
    });
    return tab;
  }

  private showTab(index: number): void {
    this.tab = index;
    this.tabEls.forEach((t, i) => toggle(t, 'is-active', i === index));
    this.rebuild(0);
  }

  /** Rows are rebuilt from live data every time: the tab builders own no state. */
  private rebuild(preferred: number): void {
    this.env.list.replaceChildren();
    this.env.detail.replaceChildren();
    const items = TABS[this.tab]!.build(this.env);
    this.menu.setItems(items, preferred);
  }

  private updateStats(): void {
    const { inventory, save } = this.host.ctx;
    setText(this.money, formatMoney(inventory.money));
    setText(this.time, formatPlayTime(save.playTimeSec));
  }

  private hintText(): string {
    const l = (a: InputAction) => this.host.ctx.input.getLabel(a);
    return `[${l('menuLeft')}/${l('menuRight')}] 分頁　[${l('menuUp')}/${l('menuDown')}] 揀　[${l('confirm')}] 確定`;
  }
}
