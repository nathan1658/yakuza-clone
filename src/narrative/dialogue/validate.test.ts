import { describe, expect, it } from 'vitest';
import { BARKS, PASSERBY } from '../scripts/barks';
import { AFTER_FIGHT, LEAD_INS } from '../scripts/fights';
import { DIALOGUES, MAIN_STORY_DIALOGUES, type DialogueId } from '../scripts/index';
import { CUTSCENE_ONLY_IDS, NPCS } from '../scripts/npcs';
import { QUESTS } from '../scripts/quests';
import { SPEAKERS } from '../scripts/speakers';
import { STORY_ITEMS } from '../story/chapters';
import { L } from './logic';
import type { DialogueGraph } from './types';
import { allEffects, bannedText, itemsGiven, validateGraph } from './validate';

const graphs = Object.entries(DIALOGUES) as Array<[DialogueId, DialogueGraph]>;
const npcIds = new Set(NPCS.map((n) => n.id));

/** Which chapter's STORY_ITEMS each main-story dialogue counts towards. */
const CHAPTER_OF: Record<string, 1 | 2 | 3> = {
  intro: 1, ch1_chicken: 1, ch1_alley: 1, ch1_after: 1, ch1_stall: 1,
  ch2_card: 2, ch2_ambush: 2, ch2_shrimp: 2,
  ch3_crossing: 3, ch3_crow: 3, ending: 3, ending_brothers: 3, ending_rain: 3,
};

describe('dialogue graphs', () => {
  it.each(graphs)('%s is registered under its own id and is sound', (key, g) => {
    expect(g.id).toBe(key);
    expect(validateGraph(g)).toEqual([]);
  });

  it('conversation partners exist', () => {
    for (const [, g] of graphs) {
      if (g.with) expect(npcIds.has(g.with), `${g.id} with ${g.with}`).toBe(true);
    }
  });

  it('speaker character ids exist', () => {
    const known = new Set([...npcIds, ...CUTSCENE_ONLY_IDS, 'player', 'boss_crow']);
    for (const s of Object.values(SPEAKERS) as Array<{ characterId?: string }>) {
      if (s.characterId) expect(known.has(s.characterId), s.characterId).toBe(true);
    }
  });

  it('main-story dialogues hand out exactly STORY_ITEMS per chapter', () => {
    for (const ch of [1, 2, 3] as const) {
      const given = new Map<string, number>();
      for (const id of MAIN_STORY_DIALOGUES.filter((d) => CHAPTER_OF[d] === ch)) {
        for (const [item, n] of itemsGiven(DIALOGUES[id])) given.set(item, (given.get(item) ?? 0) + n);
      }
      expect(given).toEqual(new Map(STORY_ITEMS[ch]));
    }
    expect(Object.keys(CHAPTER_OF).sort()).toEqual([...MAIN_STORY_DIALOGUES].sort());
  });

  it('main-story dialogues leave flags and quests to the beat table', () => {
    const owned = ['setFlag', 'startQuest', 'advanceQuest', 'completeQuest'];
    for (const id of MAIN_STORY_DIALOGUES) {
      expect(allEffects(DIALOGUES[id]).filter((e) => owned.includes(e.type)), id).toEqual([]);
    }
  });

  it('substory dialogues only touch their own quest', () => {
    const own: Record<string, string> = { debt: 'sub_debt', pager: 'sub_pager' };
    for (const [key, g] of graphs) {
      const quest = own[key.split('_')[0] as string];
      if (!quest) continue;
      for (const e of allEffects(g)) {
        if ('quest' in e) expect(e.quest, key).toBe(quest);
      }
    }
  });
});

describe('other script text', () => {
  it('barks are non-empty, clean and belong to real NPCs', () => {
    for (const b of BARKS) {
      expect(npcIds.has(b.npc), b.npc).toBe(true);
      expect(b.lines.length).toBeGreaterThan(0);
      for (const t of b.lines) expect(bannedText(t), t).toBe(false);
    }
  });

  it('passer-by chatter is non-empty and clean', () => {
    for (const b of PASSERBY) {
      expect(b.npc).toBe('pedestrian');
      expect(b.lines.length).toBeGreaterThan(0);
      for (const t of b.lines) expect(bannedText(t), t).toBe(false);
    }
  });

  it('fight lines are clean', () => {
    for (const f of [...Object.values(LEAD_INS), ...Object.values(AFTER_FIGHT)]) {
      expect(bannedText(f.text), f.text).toBe(false);
    }
  });

  it('quest text is clean', () => {
    for (const q of QUESTS) {
      for (const t of [q.titleZh, q.titleEn, q.descriptionZh, ...q.stages.map((s) => s.objectiveZh)]) {
        expect(bannedText(t), t).toBe(false);
      }
    }
  });
});

describe('validateGraph', () => {
  it('reports broken graphs', () => {
    const bad: DialogueGraph = {
      id: 'bad',
      entry: 'a',
      nodes: {
        a: { lines: [L('hoNam', '……')], choices: [{ text: '', next: 'zzz', condition: { type: 'money', atLeast: 1 } }] },
        orphan: { lines: [], effects: [{ type: 'advanceQuest', quest: 'sub_debt', stage: 'nope' }] },
      },
    };
    const problems = validateGraph(bad).join('\n');
    expect(problems).toMatch(/bad text/);
    expect(problems).toMatch(/missing node zzz/);
    expect(problems).toMatch(/every choice is conditional/);
    expect(problems).toMatch(/bad choice text/);
    expect(problems).toMatch(/orphan: unreachable/);
    expect(problems).toMatch(/orphan: no lines/);
    expect(problems).toMatch(/unknown stage sub_debt\/nope/);
  });

  it('flags ellipses and placeholders', () => {
    for (const t of ['...', '…', '等等……', 'TODO', 'Lorem ipsum', '  ']) expect(bannedText(t), t).toBe(true);
    expect(bannedText('五二零，一三一四！')).toBe(false);
  });
});
