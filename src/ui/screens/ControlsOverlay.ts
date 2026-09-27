import type { IInputManager, InputAction } from '../../core/types';
import type { Host } from '../Host';
import type { Modal } from '../Modal';
import { el, take } from '../dom';

type Label = (a: InputAction) => string;

interface Row {
  zh: string;
  en: string;
  keys: (label: Label) => string[];
  /** Touch-mode keys when they differ from keys(label); null = no touch control. */
  touch?: ((label: Label) => string[]) | null;
}

const ROWS: readonly Row[] = [
  {
    zh: '移動', en: 'Move', touch: () => ['左邊拖動'],
    keys: (l) => [l('moveForward'), l('moveLeft'), l('moveBack'), l('moveRight')],
  },
  { zh: '視角', en: 'Camera', keys: () => ['MOUSE'], touch: () => ['右邊拖動'] },
  { zh: '衝刺', en: 'Sprint', keys: (l) => [l('sprint')], touch: () => ['搖桿推盡'] },
  { zh: '輕攻擊', en: 'Light attack', keys: (l) => [l('lightAttack'), 'LMB'], touch: (l) => [l('lightAttack')] },
  { zh: '重攻擊', en: 'Heavy attack', keys: (l) => [l('heavyAttack'), 'RMB'], touch: (l) => [l('heavyAttack')] },
  { zh: '防禦', en: 'Guard (hold)', keys: (l) => [l('guard')] },
  { zh: '閃避', en: 'Dodge', keys: (l) => [l('dodge')] },
  { zh: '互動', en: 'Interact / talk', keys: (l) => [l('interact')] },
  { zh: '抓人', en: 'Grab', keys: (l) => [l('grab')] },
  { zh: '極技', en: 'Heat action', keys: (l) => [l('heatAction')] },
  { zh: '鎖定', en: 'Lock on', keys: (l) => [l('lockOn')] },
  { zh: '轉換目標', en: 'Switch target', keys: (l) => [l('cycleTarget')], touch: null },
  { zh: '暫停', en: 'Pause', keys: (l) => [l('pause')] },
  { zh: '物品', en: 'Items', keys: (l) => [l('inventory')], touch: null },
];

const CLOSE_ACTIONS: readonly InputAction[] = ['cancel', 'confirm', 'pause', 'inventory'];

/** Key reference card. Opens over any screen; any close key or click dismisses it. */
export class ControlsOverlay implements Modal {
  private root: HTMLDivElement | null = null;
  private resolve = (): void => {};

  constructor(private readonly host: Host, private readonly parent: HTMLElement) {}

  open(): Promise<void> {
    this.close();
    const root = el('div', 'yk-screen yk-controls', this.parent);
    this.build(root);
    root.addEventListener('click', () => this.dismiss());
    this.root = root;
    this.host.modals.push(this);
    this.host.ctx.audio.playSfx('ui_open');
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  update(_dt: number, input: IInputManager | null): void {
    if (!input) return;
    if (CLOSE_ACTIONS.filter((a) => take(input, a)).length > 0) this.dismiss();
  }

  private build(root: HTMLElement): void {
    const card = el('div', 'yk-controls-card', root);
    const head = el('div', 'yk-controls-head', card);
    el('span', 'yk-controls-title', head, '操作說明');
    el('span', 'yk-controls-title-en', head, 'CONTROLS');
    const grid = el('div', 'yk-controls-grid', card);
    const { input } = this.host.ctx;
    const label: Label = (a) => input.getLabel(a);
    for (const row of ROWS) {
      const touch = input.touch ? row.touch : undefined;
      if (touch === null) continue;
      const line = el('div', 'yk-controls-row', grid);
      const names = el('span', 'yk-controls-name', line, row.zh);
      el('small', '', names, row.en);
      const keys = el('span', 'yk-controls-keys', line);
      for (const k of (touch ?? row.keys)(label)) el('kbd', 'yk-key', keys, k);
    }
    el('div', 'yk-controls-tip', card,
      `打中人會儲 HEAT。HEAT 夠嘅時候靠近敵人撳 [${label('heatAction')}] 發動極技。`);
    el('div', 'yk-hint', card, `[${label('cancel')}] 返回`);
  }

  private dismiss(): void {
    if (!this.root) return;
    this.host.ctx.audio.playSfx('ui_close');
    this.close();
  }

  private close(): void {
    this.root?.remove();
    this.root = null;
    this.host.modals.remove(this);
    this.resolve();
  }
}
