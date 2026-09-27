import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../synth/rng';
import { fakeContext } from '../testing/fakeAudio';
import { BEDS } from './beds';
import { LAYERS } from './levels';

describe('ambience beds', () => {
  it.each(LAYERS)('%s renders inside its loop + tail window', (id) => {
    const bed = BEDS[id];
    const { c, stats } = fakeContext();
    const len = bed.seconds + bed.tail;
    bed.render({ c, out: c.destination, r: mulberry32(1) }, len);
    expect(stats.nodes).toBeGreaterThan(3);
    expect(stats.lastEvent).toBeLessThanOrEqual(len + 0.1);
    expect(bed.tail).toBeLessThan(bed.seconds);
  });
});
