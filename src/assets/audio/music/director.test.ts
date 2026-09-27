import { describe, expect, it } from 'vitest';
import type { GameModeId, MusicId, ZoneId } from '../../../core/types';
import { decideMusic, modeDuck, phaseLevel } from './director';
import { MusicDirector, type DirectorOut } from './MusicDirector';

describe('decideMusic', () => {
  it('maps deciding modes to tracks', () => {
    expect(decideMusic('title', null, false)).toBe('title');
    expect(decideMusic('freeRoam', 'percy', false)).toBe('explore_night');
    expect(decideMusic('freeRoam', 'typhoon', false)).toBe('explore_harbour');
    expect(decideMusic('combat', 'sogo', false)).toBe('combat_street');
    expect(decideMusic('combat', 'sogo', true)).toBe('combat_boss');
    expect(decideMusic('credits', 'sogo', false)).toBe('ending');
    expect(decideMusic('gameOver', 'percy', true)).toBe('none');
  });

  it('keeps the current track in dialogue, cutscene, heat action, menu and shop', () => {
    const keep: GameModeId[] = ['boot', 'dialogue', 'cutscene', 'heatAction', 'menu', 'shop'];
    for (const m of keep) expect(decideMusic(m, 'percy', false)).toBeNull();
  });

  it('ducks paused screens, talk and heat actions', () => {
    expect(modeDuck('menu')).toBe(0.5);
    expect(modeDuck('shop')).toBe(0.5);
    expect(modeDuck('heatAction')).toBe(0.5);
    expect(modeDuck('dialogue')).toBe(0.7);
    expect(modeDuck('combat')).toBe(1);
    expect(modeDuck('freeRoam')).toBe(1);
  });

  it('clamps boss phases to levels 1..3', () => {
    expect([0, 1, 2, 3, 4].map(phaseLevel)).toEqual([1, 1, 2, 3, 3]);
  });
});

function rig(start: GameModeId, zone: ZoneId = 'percy') {
  const log: string[] = [];
  const s = { mode: start, zone, level: 1, duck: 1 };
  const out: DirectorOut = {
    mode: () => s.mode,
    zone: () => s.zone,
    play: (id: MusicId) => log.push(id),
    setLevel: (l) => { s.level = l; },
    modeDuck: (d) => { s.duck = d; },
    gameOverSting: () => log.push('sting'),
  };
  const d = new MusicDirector(out);
  const go = (m: GameModeId) => { s.mode = m; d.onState(m); };
  return { d, s, log, go };
}

describe('MusicDirector', () => {
  it('plays victory, holds it through freeRoam, then resumes exploring', () => {
    const { d, log, go } = rig('combat');
    d.onCombatEnd(true);
    go('freeRoam');
    expect(log).toEqual(['victory']);
    d.onTrackEnd();
    expect(log).toEqual(['victory', 'explore_night']);
  });

  it('fades to silence after victory when not free roaming', () => {
    const { d, log, go } = rig('combat');
    d.onCombatEnd(true);
    go('cutscene');
    d.onTrackEnd();
    expect(log).toEqual(['victory', 'none']);
  });

  it('lets a new fight or a manual track cancel the victory hand-off', () => {
    const { d, log, go } = rig('combat');
    d.onCombatEnd(true);
    go('combat');
    d.onTrackEnd();
    expect(log).toEqual(['victory', 'combat_street']);
    d.onCombatEnd(true);
    d.onManual();
    d.onTrackEnd();
    expect(log).toEqual(['victory', 'combat_street', 'victory']);
  });

  it('switches to boss music whichever order combat:start and state:changed arrive in', () => {
    const a = rig('freeRoam', 'sogo');
    a.d.onCombatStart(true);
    a.go('combat');
    const b = rig('freeRoam', 'sogo');
    b.go('combat');
    b.d.onCombatStart(true);
    expect(a.log.at(-1)).toBe('combat_boss');
    expect(b.log.at(-1)).toBe('combat_boss');
  });

  it('tracks boss phases and resets them at the next fight', () => {
    const { d, s } = rig('combat');
    d.onBossPhase(3);
    expect(s.level).toBe(3);
    d.onCombatStart(false);
    expect(s.level).toBe(1);
  });

  it('crossfades between explore tracks on zone change only in free roam', () => {
    const { d, s, log, go } = rig('title');
    go('freeRoam');
    s.zone = 'typhoon';
    d.onZone();
    s.mode = 'dialogue';
    s.zone = 'percy';
    d.onZone();
    expect(log).toEqual(['explore_night', 'explore_harbour']);
  });

  it('stings then silences on game over, and ducks menus', () => {
    const { s, log, go } = rig('combat');
    go('gameOver');
    expect(log).toEqual(['sting', 'none']);
    go('menu');
    expect(s.duck).toBe(0.5);
    go('freeRoam');
    expect(s.duck).toBe(1);
  });
});
