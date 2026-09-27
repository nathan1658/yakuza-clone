import type { IInputManager } from '../../core/types';
import type { Host } from '../Host';
import type { Modal } from '../Modal';
import { MenuList, menuRow, type MenuItem } from '../MenuList';
import { el, play, toggle } from '../dom';
import { formatPlayTime } from '../logic/format';
import type { ControlsOverlay } from './ControlsOverlay';

type Choice = 'new' | 'continue';

const FADE_SEC = 0.5;

/** Rain and neon over the live 3D street; the menu is the first user gesture. */
export class TitleScreen implements Modal {
  private readonly menu: MenuList;
  private root: HTMLDivElement | null = null;
  private resolve: (c: Choice) => void = () => {};

  constructor(
    private readonly host: Host,
    private readonly parent: HTMLElement,
    private readonly controls: ControlsOverlay,
  ) {
    this.menu = new MenuList(host.ctx.audio);
  }

  show(hasSave: boolean): Promise<Choice> {
    this.host.ctx.input.exitPointerLock();
    this.root?.remove();
    const root = el('div', 'yk-screen yk-title', this.parent);
    buildArt(root);
    const list = el('div', 'yk-title-menu', root);
    this.menu.setItems(this.rows(list, hasSave), hasSave ? 1 : 0);
    el('div', 'yk-hint yk-title-hint', root, `[↑↓] 選擇　[${this.host.ctx.input.getLabel('confirm')}] 確定`);
    this.root = root;
    this.host.modals.push(this);
    play(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 1200, easing: 'ease-out' });
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  update(_dt: number, input: IInputManager | null): void {
    if (input) this.menu.handleInput(input);
  }

  private rows(list: HTMLElement, hasSave: boolean): MenuItem[] {
    const meta = hasSave ? this.host.ctx.save.getMeta() : null;
    const saved = meta ? `${meta.chapterZh} ・ ${meta.locationZh} ・ ${formatPlayTime(meta.playTimeSec)}` : '冇存檔';
    return [
      { el: menuRow(list, '開始新遊戲', 'NEW GAME'), enabled: true, activate: () => this.pick('new') },
      { el: menuRow(list, '繼續遊戲', 'CONTINUE', saved), enabled: hasSave, activate: () => this.pick('continue') },
      { el: menuRow(list, '操作說明', 'CONTROLS'), enabled: true, activate: () => void this.controls.open() },
    ];
  }

  /** Runs inside the confirm press / click: the gesture unlocks audio and grabs the pointer. */
  private pick(choice: Choice): void {
    const root = this.root;
    if (!root) return;
    this.root = null;
    const { audio, input } = this.host.ctx;
    void audio.unlock();
    input.requestPointerLock();
    this.host.modals.remove(this);
    toggle(root, 'is-leaving', true);
    play(root, [{ opacity: 1 }, { opacity: 0 }], { duration: FADE_SEC * 1000, easing: 'ease-in', fill: 'forwards' });
    void this.host.clock.wait(FADE_SEC).then(() => {
      root.remove();
      this.resolve(choice);
    });
  }
}

function buildArt(root: HTMLElement): void {
  el('div', 'yk-title-rain is-far', root);
  el('div', 'yk-title-rain is-near', root);
  el('div', 'yk-title-shade', root);
  el('div', 'yk-title-slash', root);
  const logo = el('div', 'yk-title-logo', root);
  el('span', 'yk-title-kicker', logo, '香港 ・ 銅鑼灣 ・ 九十年代');
  el('span', 'yk-title-main', logo, '古惑仔');
  el('span', 'yk-title-sub', logo, '銅鑼灣之龍');
  el('span', 'yk-title-en', logo, 'THE DRAGON OF CAUSEWAY BAY');
  el('div', 'yk-title-foot', root, '本故事純屬虛構 ・ ALL CHARACTERS AND EVENTS ARE FICTITIOUS');
}
