/** Pure dialogue logic: conditions, effects, and terse builders for script data. */
import type { AnimClip, ItemId } from '../../core/types';
import type { QuestId } from '../scripts/quests';
import type { SpeakerKey } from '../scripts/speakers';
import type { Condition, DialogueEnv, Effect, FlagValue, Line } from './types';

export function evalCondition(c: Condition | undefined, env: DialogueEnv): boolean {
  if (!c) return true;
  switch (c.type) {
    case 'flag': {
      const v = env.getFlag(c.key);
      return c.value === undefined ? Boolean(v) : v === c.value;
    }
    case 'notFlag':
      return !env.getFlag(c.key);
    case 'money':
      return env.money() >= c.atLeast;
    case 'item':
      return env.count(c.id) >= (c.count ?? 1);
  }
}

export function applyEffect(e: Effect, env: DialogueEnv): void {
  switch (e.type) {
    case 'setFlag': return env.setFlag(e.key, e.value);
    case 'giveItem': return env.giveItem(e.id, e.count ?? 1);
    case 'takeItem': return env.takeItem(e.id, e.count ?? 1);
    case 'giveMoney': return env.giveMoney(e.amount);
    case 'takeMoney': return env.takeMoney(e.amount);
    case 'startQuest': return env.startQuest(e.quest);
    case 'advanceQuest': return env.advanceQuest(e.quest, e.stage);
    case 'completeQuest': return env.completeQuest(e.quest);
  }
}

export function applyEffects(effects: readonly Effect[] | undefined, env: DialogueEnv): void {
  for (const e of effects ?? []) applyEffect(e, env);
}

// ---------------------------------------------------------------------------
// Builders (keep script files readable)
// ---------------------------------------------------------------------------

export function L(speaker: SpeakerKey, text: string, gloss?: string, anim?: AnimClip): Line {
  const line: Line = { speaker, text };
  if (gloss) line.gloss = gloss;
  if (anim) line.anim = anim;
  return line;
}

export const setFlag = (key: string, value: FlagValue = true): Effect => ({ type: 'setFlag', key, value });
export const giveItem = (id: ItemId, count = 1): Effect => ({ type: 'giveItem', id, count });
export const takeItem = (id: ItemId, count = 1): Effect => ({ type: 'takeItem', id, count });
export const giveMoney = (amount: number): Effect => ({ type: 'giveMoney', amount });
export const takeMoney = (amount: number): Effect => ({ type: 'takeMoney', amount });
export const startQuest = (quest: QuestId): Effect => ({ type: 'startQuest', quest });
export const advanceQuest = (quest: QuestId, stage: string): Effect => ({ type: 'advanceQuest', quest, stage });
export const completeQuest = (quest: QuestId): Effect => ({ type: 'completeQuest', quest });

export const hasMoney = (atLeast: number): Condition => ({ type: 'money', atLeast });
export const hasFlag = (key: string, value?: FlagValue): Condition =>
  value === undefined ? { type: 'flag', key } : { type: 'flag', key, value };
