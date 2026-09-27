/**
 * '對話' prompts on the named NPCs. Whether an NPC has anything to say is a
 * pure function of the story state, so the prompt only shows when talking
 * actually does something.
 */
import { Vector3 } from 'three';
import type { ItemId } from '../../core/types';
import type { QuestStatus } from '../QuestLog';
import type { DialogueId } from '../scripts/index';
import { NPCS } from '../scripts/npcs';
import type { QuestId } from '../scripts/quests';
import { beatDef, beatInRange, type BeatId } from '../story/beats';
import type { Rt } from './Env';
import type { Npcs } from './Npcs';

export interface TalkState {
  readonly beat: BeatId;
  flag(key: string): unknown;
  status(id: QuestId): QuestStatus;
  stage(id: QuestId): string;
  count(id: ItemId): number;
}

/** Talking either plays the current story beat or runs a side dialogue. */
export type TalkOption = { kind: 'beat' } | { kind: 'dialogue'; id: DialogueId };

const TALK_LABEL = '對話';
const TALK_RADIUS = 2.2;
/** Where a despawned NPC's (disabled) prompt lives. */
const NOWHERE = new Vector3(0, -1000, 0);

const say = (id: DialogueId): TalkOption => ({ kind: 'dialogue', id });

function chickenOption(s: TalkState): TalkOption | null {
  if (s.beat === 'postgame') return say('chicken_post');
  return beatInRange(s.beat, 'ch2_go_typhoon', 'ch3_crossing') ? say('chicken_ch2') : null;
}

function shrimpOption(s: TalkState): TalkOption | null {
  if (s.beat === 'postgame') return say('shrimp_post');
  return beatInRange(s.beat, 'ch3_crossing') ? say('shrimp_ch3') : null;
}

function debtorOption(s: TalkState): TalkOption | null {
  if (s.flag('debt_done')) return null;
  if (s.count('debt_iou') > 0) return say('debt_after_fight');
  const status = s.status('sub_debt');
  if (status === 'active') return say('debt_again');
  return status === 'available' ? say('debt_intro') : null;
}

function pagerOwnerOption(s: TalkState): TalkOption | null {
  if (s.flag('pager_done')) return null;
  if (s.count('pager_lost') > 0) return say(s.stage('sub_pager') === 'return' ? 'pager_return' : 'pager_return_surprise');
  const status = s.status('sub_pager');
  if (status === 'active') return s.stage('sub_pager') === 'find' ? say('pager_waiting') : null;
  return status === 'available' ? say('pager_intro') : null;
}

const SIDE_TALK: Record<string, (s: TalkState) => TalkOption | null> = {
  npc_chicken: chickenOption,
  npc_shrimp: shrimpOption,
  npc_debtor: debtorOption,
  npc_pager_owner: pagerOwnerOption,
};

export function talkOption(npc: string, s: TalkState): TalkOption | null {
  const trigger = beatDef(s.beat).trigger;
  if (trigger.kind === 'talk' && trigger.npc === npc) return { kind: 'beat' };
  return SIDE_TALK[npc]?.(s) ?? null;
}

/** A TalkState that reads the live story and inventory. */
export function liveTalkState(rt: Rt): TalkState {
  const { story, ctx } = rt;
  return {
    get beat() {
      return story.beat;
    },
    flag: (key) => story.getFlag(key),
    status: (id) => story.quests.status(id),
    stage: (id) => story.quests.stage(id),
    count: (id) => ctx.inventory.count(id),
  };
}

export function registerTalk(rt: Rt, npcs: Npcs, state: TalkState, onTalk: (npc: string) => void): void {
  for (const def of NPCS) {
    rt.ctx.interactions.register({
      id: `talk_${def.id}`,
      label: TALK_LABEL,
      radius: TALK_RADIUS,
      getPosition: () => npcs.get(def.id)?.position ?? NOWHERE,
      isEnabled: () => npcs.get(def.id) !== null && talkOption(def.id, state) !== null,
      interact: () => onTalk(def.id),
    });
  }
}
