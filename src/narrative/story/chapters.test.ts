import { describe, expect, it } from 'vitest';
import { chapterSkipPlan } from './chapters';

describe('chapterSkipPlan', () => {
  it('chapter 1 is a clean start', () => {
    const p = chapterSkipPlan(1);
    expect(p).toMatchObject({ chapter: 1, beat: 'ch1_meet_chicken', flags: {}, completed: [], unlocked: [], items: [], money: 0 });
  });

  it('chapter 2 carries everything chapter 1 set', () => {
    const p = chapterSkipPlan(2);
    expect(p.beat).toBe('ch2_go_typhoon');
    expect(p.flags).toEqual({ ch1_done: true, substories_unlocked: true, random_on: true });
    expect(p.completed).toEqual(['main_ch1']);
    expect(p.unlocked).toEqual(['sub_debt', 'sub_pager']);
    expect(p.items).toEqual([['curry_fishball', 2]]);
    expect(p.money).toBeGreaterThan(0);
  });

  it('chapter 3 carries chapters 1 and 2', () => {
    const p = chapterSkipPlan(3);
    expect(p.beat).toBe('ch3_crossing');
    expect(p.flags).toEqual({ ch1_done: true, substories_unlocked: true, random_on: true, ch2_done: true });
    expect(p.completed).toEqual(['main_ch1', 'main_ch2']);
    expect(p.items).toEqual([['curry_fishball', 2], ['first_aid_plaster', 2]]);
  });

  it('clamps nonsense to chapter 1', () => {
    expect(chapterSkipPlan(0).chapter).toBe(1);
    expect(chapterSkipPlan(7).chapter).toBe(1);
    expect(chapterSkipPlan(Number.NaN).chapter).toBe(1);
  });
});
