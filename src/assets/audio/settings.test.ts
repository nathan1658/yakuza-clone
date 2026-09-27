import { describe, expect, it } from 'vitest';
import { DEFAULT_VOLUMES, SETTINGS_KEY, loadVolumes, saveVolumes, type KeyValueStore } from './settings';

function fakeStore(initial?: string): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SETTINGS_KEY, initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('settings', () => {
  it('returns defaults with no storage or an empty store', () => {
    expect(loadVolumes(null)).toEqual(DEFAULT_VOLUMES);
    expect(loadVolumes(fakeStore())).toEqual({ master: 0.8, music: 0.6, sfx: 0.9, ambience: 0.7 });
  });

  it('round-trips volumes', () => {
    const s = fakeStore();
    saveVolumes(s, { master: 0.5, music: 0.1, sfx: 1, ambience: 0 });
    expect(loadVolumes(s)).toEqual({ master: 0.5, music: 0.1, sfx: 1, ambience: 0 });
  });

  it('preserves fields owned by other modules', () => {
    const s = fakeStore(JSON.stringify({ subtitles: true, volume: { master: 0.3 } }));
    saveVolumes(s, { ...DEFAULT_VOLUMES, music: 0.2 });
    const raw = JSON.parse(s.data.get(SETTINGS_KEY) ?? '{}');
    expect(raw.subtitles).toBe(true);
    expect(raw.volume.music).toBe(0.2);
  });

  it('survives corrupt JSON and clamps bad values', () => {
    expect(loadVolumes(fakeStore('{not json'))).toEqual(DEFAULT_VOLUMES);
    const s = fakeStore(JSON.stringify({ volume: { master: 7, music: -1, sfx: 'loud', ambience: null } }));
    expect(loadVolumes(s)).toEqual({ master: 1, music: 0, sfx: 0.9, ambience: 0.7 });
  });

  it('never throws when the store throws', () => {
    const angry: KeyValueStore = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    };
    expect(loadVolumes(angry)).toEqual(DEFAULT_VOLUMES);
    expect(() => saveVolumes(angry, DEFAULT_VOLUMES)).not.toThrow();
  });
});
