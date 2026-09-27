import { describe, expect, it } from 'vitest';
import { compileTrack } from '../compile';
import { INSTRUMENTS, UNPITCHED } from '../instruments';
import { STEPS_PER_BAR, type TrackId } from '../types';
import { TRACKS } from './index';

const IDS: TrackId[] = [
  'title', 'explore_night', 'explore_harbour', 'tension',
  'combat_street', 'combat_boss', 'victory', 'ending',
];

describe('tracks', () => {
  it('covers every MusicId except none, keyed by its own id', () => {
    expect(Object.keys(TRACKS).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(TRACKS[id].id).toBe(id);
  });

  it.each(IDS)('%s compiles', (id) => {
    const t = compileTrack(TRACKS[id]);
    expect(t.form.length).toBeGreaterThan(0);
    expect(t.def.bpm).toBeGreaterThanOrEqual(60);
    expect(t.def.bpm).toBeLessThanOrEqual(170);
    expect(t.def.gain).toBeLessThanOrEqual(1);
  });

  it.each(IDS)('%s uses pitched instruments for notes and unpitched ones in grids', (id) => {
    for (const s of compileTrack(TRACKS[id]).form) {
      for (const { layer, pat } of s.layers) {
        if (layer.inst) expect(UNPITCHED.has(layer.inst), `${id}/${s.name}/${layer.pat}`).toBe(false);
        for (const evs of pat.at) for (const e of evs) {
          if (e.inst) expect(UNPITCHED.has(e.inst), `${id}/${s.name}/${layer.pat}:${e.inst}`).toBe(true);
          expect(INSTRUMENTS[e.inst ?? layer.inst!]).toBeTypeOf('function');
        }
      }
    }
  });

  it('keeps absolute melody notes in a sane register', () => {
    for (const id of IDS) for (const s of compileTrack(TRACKS[id]).form) for (const { layer, pat } of s.layers) {
      for (const evs of pat.at) for (const e of evs) {
        if (e.pitch.k !== 'abs') continue;
        const m = e.pitch.m + (layer.oct ?? 0);
        expect(m, `${id}/${layer.pat}`).toBeGreaterThanOrEqual(28);
        expect(m, `${id}/${layer.pat}`).toBeLessThanOrEqual(96);
      }
    }
  });

  it('victory is a one-shot of about four bars; the rest loop', () => {
    const v = compileTrack(TRACKS.victory);
    expect(v.def.loop).toBe(false);
    expect(v.form.reduce((n, s) => n + s.bars, 0)).toBe(4);
    for (const id of IDS) if (id !== 'victory') expect(TRACKS[id].loop).toBe(true);
    expect(STEPS_PER_BAR * v.stepDur * 4).toBeLessThan(10);
  });

  it('boss fight modulates up a whole tone at phase 3', () => {
    expect(TRACKS.combat_boss.levelTranspose?.[3]).toBe(2);
  });
});
