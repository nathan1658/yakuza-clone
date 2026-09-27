import { describe, expect, it } from 'vitest';
import { HEAT_ACTIONS, selectHeatAction, type HeatCue, type HeatQuery } from './heatTable';

const q = (over: Partial<HeatQuery> = {}): HeatQuery => ({
  heat: 50, finisher: false, isBoss: false, targetState: 'idle', grabbing: false, weapon: null, wallBehind: false, ...over,
});
const pick = (over: Partial<HeatQuery>): string | undefined => selectHeatAction(q(over))?.id;

describe('selectHeatAction', () => {
  it('needs a bar of heat', () => {
    expect(pick({ heat: 32, targetState: 'downed' })).toBeUndefined();
    expect(pick({ heat: 33, targetState: 'downed' })).toBe('curb_stomp');
  });

  it('picks by what is in hand', () => {
    expect(pick({ weapon: 'folding_chair' })).toBe('chair_crusher');
    expect(pick({ weapon: 'wooden_stool' })).toBe('chair_crusher');
    expect(pick({ weapon: 'beer_bottle' })).toBe('bottle_baptism');
    expect(pick({ weapon: 'traffic_cone' })).toBe('cone_head');
  });

  it('grabs throw, or slam into a wall', () => {
    expect(pick({ grabbing: true, targetState: 'grabbed' })).toBe('shoulder_throw');
    expect(pick({ grabbing: true, targetState: 'grabbed', wallBehind: true })).toBe('wall_slam');
    expect(pick({ wallBehind: true })).toBe('wall_slam');
  });

  it('a full bar unlocks the rush, a reeling target the combo', () => {
    expect(pick({ heat: 99 })).toBeUndefined();
    expect(pick({ heat: 100 })).toBe('rage_rush');
    expect(pick({ targetState: 'staggered' })).toBe('stagger_rush');
  });

  it('nothing on a body in mid-air or out cold', () => {
    for (const s of ['airborne', 'knockdown', 'gettingUp', 'ko', 'heatLocked'] as const) {
      expect(pick({ heat: 100, targetState: s, wallBehind: true })).toBeUndefined();
    }
  });

  it('the boss only while staggered or held, the finisher regardless of heat', () => {
    expect(pick({ isBoss: true, heat: 100 })).toBeUndefined();
    expect(pick({ isBoss: true, targetState: 'staggered' })).toBe('stagger_rush');
    expect(pick({ isBoss: true, heat: 0, finisher: true })).toBe('crow_killer');
  });
});

describe('HEAT_ACTIONS scripts', () => {
  const sorted = (cues: readonly HeatCue[]): boolean => cues.every((c, i) => i === 0 || cues[i - 1].at <= c.at);

  it('cues are in order and land inside the script', () => {
    for (const a of Object.values(HEAT_ACTIONS)) {
      expect(sorted(a.cues), a.id).toBe(true);
      expect(a.cues[a.cues.length - 1].at, a.id).toBeLessThan(a.duration);
      expect(a.cues.some((c) => c.do === 'hit'), a.id).toBe(true);
    }
  });

  it('only the finisher prompts, and its miss hits the player', () => {
    const withQte = Object.values(HEAT_ACTIONS).filter((a) => a.qte);
    expect(withQte.map((a) => a.id)).toEqual(['crow_killer']);
    const qte = HEAT_ACTIONS.crow_killer.qte!;
    expect(sorted(qte.fail)).toBe(true);
    expect(qte.fail.some((c) => c.do === 'hit' && c.on === 'player')).toBe(true);
    expect(HEAT_ACTIONS.crow_killer.cues.some((c) => c.do === 'hit' && c.lethal && c.at > qte.at)).toBe(true);
  });

  it('costs follow the design', () => {
    expect(HEAT_ACTIONS.rage_rush.cost).toBe(100);
    expect(HEAT_ACTIONS.crow_killer.cost).toBe(0);
    expect(HEAT_ACTIONS.chair_crusher.cost).toBe(33);
  });
});
