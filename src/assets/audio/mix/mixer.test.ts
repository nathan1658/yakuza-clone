import { describe, expect, it } from 'vitest';
import { fakeContext } from '../testing/fakeAudio';
import { DEFAULT_VOLUMES } from '../settings';
import { mergeDuck } from './duck';
import { softClipCurve } from './clip';
import { Mixer } from './Mixer';

describe('mergeDuck', () => {
  const idle = { amount: 0, until: 0 };
  it('starts a fresh duck', () => {
    expect(mergeDuck(idle, 10, 0.5, 2)).toEqual({ amount: 0.5, until: 12 });
  });
  it('keeps the deepest amount and the latest end while overlapping', () => {
    const a = mergeDuck(idle, 0, 0.7, 2);
    expect(mergeDuck(a, 1, 0.3, 0.5)).toEqual({ amount: 0.7, until: 2 });
    expect(mergeDuck(a, 1, 0.3, 3)).toEqual({ amount: 0.7, until: 4 });
  });
  it('forgets an expired duck and clamps input', () => {
    const a = mergeDuck(idle, 0, 0.9, 1);
    expect(mergeDuck(a, 5, 2, -1)).toEqual({ amount: 1, until: 5 });
  });
});

describe('Mixer', () => {
  it('builds the graph and accepts volume, mode duck and overlapping ducks', () => {
    const { c, ctx } = fakeContext();
    const m = new Mixer(c, DEFAULT_VOLUMES);
    m.setVolume('master', 0.5);
    m.setVolume('music', 0);
    m.setModeDuck(0.5);
    m.duck(0.5, 2);
    ctx.currentTime = 1;
    m.duck(0.8, 0.2);
    m.dispose();
    expect(m.music.gain.value).toBe(DEFAULT_VOLUMES.music);
  });
});

describe('softClipCurve', () => {
  const curve = softClipCurve(0.8, 4097);
  const xAt = (i: number) => (i / (curve.length - 1)) * 2 - 1;
  it('leaves normal levels untouched', () => {
    for (let i = 0; i < curve.length; i++) {
      if (Math.abs(xAt(i)) <= 0.8) expect(curve[i]).toBeCloseTo(xAt(i), 6);
    }
  });
  it('is monotonic, odd and stays below full scale', () => {
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    expect(curve[0]).toBeCloseTo(-curve[curve.length - 1], 6);
    expect(curve[curve.length - 1]).toBeLessThan(0.96);
  });
});
