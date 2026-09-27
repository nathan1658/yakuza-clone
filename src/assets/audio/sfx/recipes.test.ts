import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../synth/rng';
import { fakeContext } from '../testing/fakeAudio';
import { RECIPES } from './recipes';
import type { AnySfx } from './types';

const ids = Object.keys(RECIPES) as AnySfx[];

describe('SFX recipes', () => {
  it('cover all 54 game ids plus the 3 internal ones', () => {
    expect(ids).toHaveLength(57);
  });

  it.each(ids)('%s renders every variant inside its duration', (id) => {
    const recipe = RECIPES[id];
    expect(recipe.dur).toBeGreaterThan(0);
    expect(recipe.level).toBeGreaterThan(0);
    expect(recipe.level).toBeLessThanOrEqual(0.95);
    for (let v = 0; v < (recipe.variants ?? 1); v++) {
      const { c, stats } = fakeContext();
      recipe.render({ c, out: c.destination, r: mulberry32(v + 1) });
      expect(stats.nodes).toBeGreaterThan(1);
      expect(stats.lastEvent).toBeLessThanOrEqual(recipe.dur + 0.05);
    }
  });
});
