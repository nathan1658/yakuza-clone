/**
 * The narrative runtime bundle and the DialogueEnv it hands to dialogue
 * effects. Item and money rewards toast (Inventory itself never does).
 */
import type { GameContext, ItemId } from '../../core/types';
import type { Clock } from '../Clock';
import type { DialogueEnv } from '../dialogue/types';
import type { StoryState } from '../StoryState';
import type { Session } from './Session';

/** Shared by every runtime piece: the game, our state, clock, effects and script liveness. */
export interface Rt {
  readonly ctx: GameContext;
  readonly story: StoryState;
  readonly clock: Clock;
  readonly env: DialogueEnv;
  readonly session: Session;
}

/** 1234 → 'HK$1,234' (same format as the HUD). */
export function formatMoney(amount: number): string {
  const n = Math.round(amount);
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}HK$${digits}`;
}

/** '取得 咖喱魚蛋' / '取得 咖喱魚蛋 ×2'. */
export function itemToast(nameZh: string, count: number): string {
  return count > 1 ? `取得 ${nameZh} ×${count}` : `取得 ${nameZh}`;
}

export function giveItem(ctx: GameContext, id: ItemId, count = 1): void {
  ctx.inventory.addItem(id, count);
  ctx.ui.toast(itemToast(ctx.inventory.getItemDef(id).nameZh, count), 'item');
}

export function giveMoney(ctx: GameContext, amount: number): void {
  ctx.inventory.addMoney(amount);
  ctx.ui.toast(`+${formatMoney(amount)}`, 'money');
}

export function makeEnv(ctx: GameContext, story: StoryState): DialogueEnv {
  return {
    getFlag: (key) => story.getFlag(key),
    setFlag: (key, value) => story.setFlag(key, value),
    money: () => ctx.inventory.money,
    count: (id) => ctx.inventory.count(id),
    giveItem: (id, n) => giveItem(ctx, id, n),
    takeItem: (id, n) => { ctx.inventory.removeItem(id, n); },
    giveMoney: (amount) => giveMoney(ctx, amount),
    takeMoney: (amount) => { ctx.inventory.spendMoney(amount); },
    startQuest: (q) => story.quests.start(q),
    advanceQuest: (q, stage) => story.quests.advance(q, stage),
    completeQuest: (q) => story.quests.complete(q),
  };
}
