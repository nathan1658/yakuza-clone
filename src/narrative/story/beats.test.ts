import { describe, expect, it } from 'vitest';
import { BARKS } from '../scripts/barks';
import { NPCS, npcDef, placementFor } from '../scripts/npcs';
import { questDef } from '../scripts/quests';
import { BEATS, BEAT_IDS, beatInRange, nextBeat, type BeatId } from './beats';

const noFlags = () => undefined;

describe('beat table', () => {
  it('lists every beat once, in BEAT_IDS order', () => {
    expect(BEATS.map((b) => b.id)).toEqual([...BEAT_IDS]);
  });

  it('chapters never go backwards and end in the post-game', () => {
    const chapters = BEATS.map((b) => b.chapter);
    expect([...chapters].sort()).toEqual(chapters);
    expect(BEATS.at(-1)?.trigger.kind).toBe('none');
    expect(nextBeat('postgame')).toBeNull();
  });

  it('quest stages exist and advance in quest order', () => {
    for (const b of BEATS) {
      if (!b.quest) continue;
      const stages = questDef(b.quest.id).stages.map((s) => s.id);
      expect(stages, b.id).toContain(b.quest.stage);
    }
    for (const q of ['main_ch1', 'main_ch2', 'main_ch3'] as const) {
      const used = BEATS.filter((b) => b.quest?.id === q).map((b) => b.quest?.stage);
      expect(used).toEqual(questDef(q).stages.map((s) => s.id));
    }
  });

  it('story fights are never the random encounter', () => {
    for (const b of BEATS) expect(b.encounter).not.toBe('random_street');
  });

  it('talk triggers point at NPCs present during that beat', () => {
    for (const b of BEATS) {
      if (b.trigger.kind !== 'talk') continue;
      const def = npcDef(b.trigger.npc);
      expect(def, b.id).toBeDefined();
      if (def) expect(placementFor(def, b.id, noFlags), b.id).not.toBeNull();
    }
  });

  it('the first beat of a chapter is not auto (a chapter skip lands on it)', () => {
    for (const [i, b] of BEATS.entries()) {
      if (i > 0 && BEATS[i - 1]?.chapter !== b.chapter) expect(b.trigger.kind, b.id).not.toBe('auto');
    }
  });
});

describe('npc placements', () => {
  it('have sane beat ranges and unique ids', () => {
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(NPCS.length);
    for (const n of NPCS) {
      expect(n.id.startsWith('npc_'), n.id).toBe(true);
      for (const p of n.placements) {
        if (p.from && p.until) expect(beatInRange(p.from, undefined, p.until), n.id).toBe(true);
      }
    }
  });

  it('山雞 moves with the story', () => {
    const chicken = npcDef('npc_chicken');
    if (!chicken) throw new Error('npc_chicken missing');
    const at = (beat: BeatId) => placementFor(chicken, beat, noFlags)?.at ?? null;
    expect(at('ch1_meet_chicken')).toBe('percy_informant');
    expect(at('ch2_ambush')).toBe('percy_north');
    expect(at('ch3_boss')).toBeNull();
    expect(at('postgame')).toBe('percy_informant');
  });

  it('substory NPCs appear only once substories unlock', () => {
    const debtor = npcDef('npc_debtor');
    if (!debtor) throw new Error('npc_debtor missing');
    expect(placementFor(debtor, 'ch2_ambush', noFlags)).toBeNull();
    expect(placementFor(debtor, 'ch2_ambush', (k) => k === 'substories_unlocked')).not.toBeNull();
  });

  it('bark ranges are valid', () => {
    for (const b of BARKS) {
      if (b.from && b.until) expect(beatInRange(b.from, undefined, b.until), b.npc).toBe(true);
    }
  });
});
