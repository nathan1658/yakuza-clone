import type { GameContext, ItemDef } from '../../core/types';
import type { MenuItem } from '../MenuList';
import { el } from '../dom';

/** What a pause-menu tab builder gets to work with. */
export interface PauseTabEnv {
  readonly ctx: GameContext;
  /** Row container, empty when the builder runs. */
  readonly list: HTMLElement;
  /** Right-hand detail panel; rows fill it from focus(). */
  readonly detail: HTMLElement;
  /** Rebuild the current tab, keeping the cursor (after using an item...). */
  refresh(): void;
  close(): void;
  showControls(): void;
}

/** Builds one tab's rows into env.list and returns them for the MenuList. */
export type PauseTabBuilder = (env: PauseTabEnv) => MenuItem[];

export function fillDetail(detail: HTMLElement, head: string, sub: string, lines: readonly string[]): void {
  detail.replaceChildren();
  el('div', 'yk-detail-head', detail, head);
  if (sub) el('div', 'yk-detail-sub', detail, sub);
  for (const line of lines) if (line) el('p', 'yk-detail-line', detail, line);
}

/** Nothing to list: a line in the list, a hint in the detail panel. */
export function emptyTab(env: PauseTabEnv, zh: string, hint: string): MenuItem[] {
  el('div', 'yk-pause-empty', env.list, zh);
  fillDetail(env.detail, zh, '', [hint]);
  return [];
}

/** 'HP +20 ・ HEAT +10' (empty for key items). */
export function effectText(def: ItemDef): string {
  const parts = [def.heal ? `HP +${def.heal}` : '', def.heat ? `HEAT +${def.heat}` : ''];
  return parts.filter(Boolean).join(' ・ ');
}

/** Shop label for "consume on the spot", by item kind. Key items can't be. */
export const USE_NOW: Readonly<Record<ItemDef['kind'], string>> = {
  food: '即刻食',
  drink: '即刻飲',
  medicine: '即刻用',
  key: '',
};
