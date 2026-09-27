import { describe, expect, it } from 'vitest';
import { fakeContext } from '../testing/fakeAudio';
import { Sequencer } from './Sequencer';
import { TRACKS } from './tracks';
import type { TrackId } from './types';

const IDS = Object.keys(TRACKS) as TrackId[];

/** Drive a Sequencer through `seconds` of lookahead ticks on a fake clock. */
function run(id: TrackId, seconds: number, level = 1) {
  const { c, stats, ctx } = fakeContext();
  const s = new Sequencer(c, TRACKS[id], c.destination, 0.05);
  s.level = level;
  for (ctx.currentTime = 0; ctx.currentTime < seconds; ctx.currentTime += 0.025) s.advance(ctx.currentTime, 0.12);
  return { s, stats, ctx };
}

describe('track playback on a strict fake context', () => {
  it.each(IDS)('%s schedules every instrument without Web Audio errors', (id) => {
    const { stats } = run(id, 90);
    expect(stats.nodes).toBeGreaterThan(100);
  });

  it('boss phases 2 and 3 play the extra layers without errors', () => {
    const calm = run('combat_boss', 12, 1).stats.nodes;
    expect(run('combat_boss', 12, 2).stats.nodes).toBeGreaterThan(calm);
    expect(run('combat_boss', 12, 3).stats.nodes).toBeGreaterThan(run('combat_boss', 12, 2).stats.nodes);
  });

  it('victory ends after its four bars and reports finished after the tail', () => {
    const { s, ctx } = run('victory', 12);
    expect(s.done).toBe(true);
    expect(s.finished(ctx.currentTime)).toBe(true);
    const bars = 4 * (60 / TRACKS.victory.bpm) * 4;
    expect(s.finished(bars + 0.05 + 1)).toBe(false);
  });

  it('a non-looping track scheduled past its end in one call stops cleanly', () => {
    const { c } = fakeContext();
    const s = new Sequencer(c, TRACKS.victory, c.destination, 0.05);
    expect(() => s.advance(0, 20)).not.toThrow();
    expect(s.done).toBe(true);
  });

  it('resyncs instead of bursting after a long stall', () => {
    const { c, stats, ctx } = fakeContext();
    const s = new Sequencer(c, TRACKS.combat_street, c.destination, 0.05);
    s.advance(0, 0.12);
    const before = stats.nodes;
    ctx.currentTime = 30;
    s.advance(30, 0.12);
    expect(stats.nodes - before).toBeLessThan(400);
  });
});
