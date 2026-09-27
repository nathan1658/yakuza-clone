import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../core/types';
import type { QuestStatus } from '../QuestLog';
import { DIALOGUES } from '../scripts/index';
import { NPCS } from '../scripts/npcs';
import type { QuestId } from '../scripts/quests';
import { BEAT_IDS, type BeatId } from '../story/beats';
import { pickBark } from './Barks';
import { talkOption, type TalkState } from './Talk';

interface Fake {
  beat?: BeatId;
  flags?: Record<string, boolean>;
  status?: Partial<Record<QuestId, QuestStatus>>;
  stage?: Partial<Record<QuestId, string>>;
  items?: Partial<Record<ItemId, number>>;
}

function state(f: Fake): TalkState {
  return {
    beat: f.beat ?? 'ch2_go_typhoon',
    flag: (k) => f.flags?.[k],
    status: (id) => f.status?.[id] ?? 'locked',
    stage: (id) => f.stage?.[id] ?? '',
    count: (id) => f.items?.[id] ?? 0,
  };
}

const dialogue = (id: keyof typeof DIALOGUES) => ({ kind: 'dialogue', id });

describe('talkOption', () => {
  it('plays the beat when the beat is a talk with that NPC', () => {
    expect(talkOption('npc_chicken', state({ beat: 'ch1_meet_chicken' }))).toEqual({ kind: 'beat' });
    expect(talkOption('npc_shrimp', state({ beat: 'ch2_shrimp' }))).toEqual({ kind: 'beat' });
  });

  it('gives 山雞 and 蝦叔 side talk only when they have something to say', () => {
    expect(talkOption('npc_chicken', state({ beat: 'ch1_alley' }))).toBeNull();
    expect(talkOption('npc_chicken', state({ beat: 'ch2_ambush' }))).toEqual(dialogue('chicken_ch2'));
    expect(talkOption('npc_chicken', state({ beat: 'postgame' }))).toEqual(dialogue('chicken_post'));
    expect(talkOption('npc_shrimp', state({ beat: 'ch3_boss' }))).toEqual(dialogue('shrimp_ch3'));
    expect(talkOption('npc_shrimp', state({ beat: 'postgame' }))).toEqual(dialogue('shrimp_post'));
  });

  it('walks 魚蛋佬 through the debt substory', () => {
    expect(talkOption('npc_debtor', state({}))).toBeNull();
    expect(talkOption('npc_debtor', state({ status: { sub_debt: 'available' } }))).toEqual(dialogue('debt_intro'));
    expect(talkOption('npc_debtor', state({ status: { sub_debt: 'active' } }))).toEqual(dialogue('debt_again'));
    expect(talkOption('npc_debtor', state({ status: { sub_debt: 'active' }, items: { debt_iou: 1 } }))).toEqual(dialogue('debt_after_fight'));
    expect(talkOption('npc_debtor', state({ status: { sub_debt: 'completed' }, flags: { debt_done: true } }))).toBeNull();
  });

  it('walks the pager owner through 失落嘅BB機, in either order', () => {
    const active = (stage: string, items: Fake['items'] = {}) => state({ status: { sub_pager: 'active' }, stage: { sub_pager: stage }, items });
    expect(talkOption('npc_pager_owner', state({ status: { sub_pager: 'available' } }))).toEqual(dialogue('pager_intro'));
    expect(talkOption('npc_pager_owner', active('find'))).toEqual(dialogue('pager_waiting'));
    expect(talkOption('npc_pager_owner', active('return', { pager_lost: 1 }))).toEqual(dialogue('pager_return'));
    expect(talkOption('npc_pager_owner', active('owner', { pager_lost: 1 }))).toEqual(dialogue('pager_return_surprise'));
    expect(talkOption('npc_pager_owner', state({ flags: { pager_done: true }, items: { pager_lost: 1 } }))).toBeNull();
  });

  it('never offers vendors a talk (their stall is the interaction)', () => {
    for (const npc of ['npc_auntie', 'npc_ctt_boss', 'npc_newsstand', 'npc_crab']) {
      for (const beat of BEAT_IDS) expect(talkOption(npc, state({ beat }))).toBeNull();
    }
  });

  it('only names dialogues whose partner is the NPC talked to', () => {
    const everything: Fake = { status: { sub_debt: 'active', sub_pager: 'active' }, stage: { sub_pager: 'return' }, items: { pager_lost: 1, debt_iou: 1 } };
    for (const npc of NPCS) {
      for (const beat of BEAT_IDS) {
        const opt = talkOption(npc.id, state({ ...everything, beat }));
        if (opt?.kind === 'dialogue') expect(DIALOGUES[opt.id].with).toBe(npc.id);
      }
    }
  });
});

describe('pickBark', () => {
  const none = (): undefined => undefined;

  it('gives every vendor something to call out on any beat', () => {
    for (const npc of ['npc_auntie', 'npc_ctt_boss', 'npc_newsstand', 'npc_crab']) {
      for (const beat of BEAT_IDS) expect(pickBark(npc, beat, none)?.length).toBeGreaterThan(0);
    }
  });

  it('respects the flag gate', () => {
    expect(pickBark('npc_debtor', 'postgame', none)).toBeNull();
    expect(pickBark('npc_debtor', 'postgame', (k) => k === 'debt_done')?.length).toBeGreaterThan(0);
  });
});
