import { el, toggle } from '../dom';

/** Cinema bars for cutscenes; the slide is a CSS transform transition. */
export class Letterbox {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'yk-letterbox', parent);
    el('div', 'yk-letterbox-bar is-top', this.root);
    el('div', 'yk-letterbox-bar is-bottom', this.root);
  }

  set(on: boolean): void {
    toggle(this.root, 'is-on', on);
  }
}
