import { describe, expect, it } from 'vitest';
import { StoryState } from './StoryState';

describe('StoryState (narrative saveable)', () => {
  it('round-trips through JSON', () => {
    const a = new StoryState();
    a.beat = 'ch2_ambush';
    a.pendingFight = 'typhoon_ambush';
    a.setFlag('pager_picked', true);
    a.setFlag('debt_route', 'fought');
    a.setFlag('count', 3);
    a.quests.complete('main_ch1');
    a.quests.start('main_ch2', 'promenade');
    a.quests.unlock('sub_pager');

    const b = new StoryState();
    b.deserialize(JSON.parse(JSON.stringify(a.serialize())));
    expect(b.serialize()).toEqual(a.serialize());
  });

  it('falls back to new-game values for invalid data', () => {
    const s = new StoryState();
    s.deserialize({ v: 1, beat: 'ch9_nowhere', pendingFight: 'random_street', flags: { ok: true, bad: { x: 1 }, nan: NaN } });
    expect(s.beat).toBe('ch1_meet_chicken');
    expect(s.pendingFight).toBeNull();
    expect(s.getFlag('ok')).toBe(true);
    expect(s.getFlag('bad')).toBeUndefined();
    expect(s.getFlag('nan')).toBeUndefined();
    expect(s.quests.status('main_ch1')).toBe('active');

    s.setFlag('x', true);
    s.deserialize({ v: 2, beat: 'postgame' });
    expect(s.beat).toBe('ch1_meet_chicken');
    expect(s.getFlag('x')).toBeUndefined();
    s.deserialize(null);
    expect(s.serialize().flags).toEqual({});
  });

  it('reset() clears everything', () => {
    const s = new StoryState();
    s.beat = 'postgame';
    s.setFlag('game_cleared', true);
    s.quests.complete('main_ch1');
    s.reset();
    expect(s.beat).toBe('ch1_meet_chicken');
    expect(s.getFlag('game_cleared')).toBeUndefined();
    expect(s.quests.status('main_ch1')).toBe('active');
  });
});
