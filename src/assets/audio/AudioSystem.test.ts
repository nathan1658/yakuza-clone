import { describe, expect, it } from 'vitest';
import type { GameContext, GameEvents, GameModeId, ZoneId } from '../../core/types';
import { AudioSystem } from './AudioSystem';

/** Just enough of GameContext for the pre-unlock path (node has no AudioContext). */
function harness() {
  const handlers = new Map<keyof GameEvents, Set<(p: unknown) => void>>();
  const game = { mode: 'boot' as GameModeId, zone: 'percy' as ZoneId };
  const events = {
    on(type: keyof GameEvents, h: (p: unknown) => void) {
      const set = handlers.get(type) ?? new Set();
      handlers.set(type, set.add(h));
      return () => set.delete(h);
    },
  };
  const emit = <K extends keyof GameEvents>(type: K, payload: GameEvents[K]) => {
    for (const h of handlers.get(type) ?? []) h(payload);
  };
  const to = (mode: GameModeId) => {
    const from = game.mode;
    game.mode = mode;
    emit('state:changed', { from, to: mode, payload: undefined });
  };
  const ctx = {
    events,
    state: { get mode() { return game.mode; } },
    world: { get currentZone() { return game.zone; }, weather: 'rain' },
  } as unknown as GameContext;
  const audio = new AudioSystem(ctx);
  audio.init();
  return { audio, game, emit, to, handlers };
}

describe('AudioSystem before unlock', () => {
  it('stays silent and safe without Web Audio', async () => {
    const { audio } = harness();
    await expect(audio.unlock()).resolves.toBeUndefined();
    expect(() => {
      audio.playSfx('punch_heavy');
      audio.duck(0.5, 2);
      audio.update({ dt: 0.016, realDt: 0.016, elapsed: 0, realElapsed: 0, frame: 0 });
      audio.lateUpdate();
    }).not.toThrow();
  });

  it('remembers the music the game asks for (agreement #13)', () => {
    const { audio, game, emit, to } = harness();
    to('title');
    expect(audio.currentMusic).toBe('title');
    game.zone = 'typhoon';
    to('freeRoam');
    expect(audio.currentMusic).toBe('explore_harbour');
    emit('combat:start', { encounterId: 'boss' as never, enemyIds: [], isBoss: true });
    to('combat');
    expect(audio.currentMusic).toBe('combat_boss');
    emit('combat:end', { encounterId: 'boss' as never, victory: true, moneyEarned: 0 });
    to('freeRoam');
    expect(audio.currentMusic).toBe('victory');
    audio.playMusic('tension');
    expect(audio.currentMusic).toBe('tension');
    to('menu');
    expect(audio.currentMusic).toBe('tension');
  });

  it('clamps volumes and unsubscribes on dispose', () => {
    const { audio, to, handlers } = harness();
    audio.setVolume('music', 2);
    audio.setVolume('sfx', Number.NaN);
    expect(audio.getVolume('music')).toBe(1);
    expect(audio.getVolume('sfx')).toBe(0.9);
    audio.dispose();
    to('title');
    expect(audio.currentMusic).toBe('none');
    expect([...handlers.values()].every((s) => s.size === 0)).toBe(true);
  });
});
