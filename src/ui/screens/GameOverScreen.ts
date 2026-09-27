import type { IInputManager } from '../../core/types';
import type { Host } from '../Host';
import type { Modal } from '../Modal';
import { MenuList, menuRow, type MenuItem } from '../MenuList';
import { el, play, toggle } from '../dom';

type Choice = 'retry' | 'title';

/** Seconds of "you're finished" before the menu accepts input. */
const MENU_DELAY_SEC = 1.5;
const FADE_SEC = 0.6;

export class GameOverScreen implements Modal {
  private readonly menu: MenuList;
  private root: HTMLDivElement | null = null;
  private ready = false;
  private resolve: (c: Choice) => void = () => {};

  constructor(private readonly host: Host, private readonly parent: HTMLElement) {
    this.menu = new MenuList(host.ctx.audio);
  }

  show(): Promise<Choice> {
    this.host.ctx.input.exitPointerLock();
    this.root?.remove();
    const root = el('div', 'yk-screen yk-gameover', this.parent);
    el('div', 'yk-gameover-wash', root);
    el('div', 'yk-gameover-title', root, '你玩完喇……');
    el('div', 'yk-gameover-en', root, "YOU'RE FINISHED");
    const list = el('div', 'yk-gameover-menu', root);
    this.menu.setItems(this.rows(list), 0);
    this.root = root;
    this.ready = false;
    this.host.modals.push(this);
    this.host.clock.schedule(MENU_DELAY_SEC, () => {
      this.ready = true;
      toggle(root, 'is-ready', true);
    });
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  update(_dt: number, input: IInputManager | null): void {
    if (input && this.ready) this.menu.handleInput(input);
  }

  private rows(list: HTMLElement): MenuItem[] {
    const hasSave = this.host.ctx.save.hasSave();
    return [
      {
        el: menuRow(list, '再嚟過', 'RETRY', hasSave ? '由上次存檔重新開始' : '冇存檔'),
        enabled: hasSave,
        activate: () => this.pick('retry'),
      },
      { el: menuRow(list, '返回標題', 'TITLE'), enabled: true, activate: () => this.pick('title') },
    ];
  }

  private pick(choice: Choice): boolean {
    const root = this.root;
    if (!root || !this.ready) return false;
    this.root = null;
    if (choice === 'retry') this.host.ctx.input.requestPointerLock();
    this.host.modals.remove(this);
    play(root, [{ opacity: 1 }, { opacity: 0 }], { duration: FADE_SEC * 1000, easing: 'ease-in', fill: 'forwards' });
    void this.host.clock.wait(FADE_SEC).then(() => {
      root.remove();
      this.resolve(choice);
    });
    return true;
  }
}
