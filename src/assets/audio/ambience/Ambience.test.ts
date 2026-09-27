import { describe, expect, it } from 'vitest';
import type { PlaySfxOptions } from '../../../core/types';
import type { AnySfx } from '../sfx/types';
import { fakeContext } from '../testing/fakeAudio';
import { Ambience } from './Ambience';
import type { AmbienceInput } from './levels';

interface Shot { id: AnySfx; dist: number; north: number; volume: number }

function run(input: AmbienceInput, seconds: number): Shot[] {
  const { c, ctx } = fakeContext();
  const shots: Shot[] = [];
  const amb = new Ambience(c as AudioContext, c.destination, (id: AnySfx, o: PlaySfxOptions) => {
    const p = o.position!;
    shots.push({ id, dist: Math.hypot(p.x - input.x, p.z - input.z), north: input.z - p.z, volume: o.volume! });
  });
  for (let t = 0; t < seconds; t += 0.1) {
    ctx.currentTime = t;
    amb.update(0.1, input);
  }
  amb.dispose();
  return shots;
}

const street: AmbienceInput = { mode: 'freeRoam', zone: 'percy', weather: 'rain', x: -64, z: -60 };

describe('Ambience one-shots', () => {
  it('scatters horns and tram bells around the listener in the city, never harbour sounds', () => {
    const shots = run(street, 300);
    const ids = new Set(shots.map((s) => s.id));
    expect(ids).toEqual(new Set(['car_horn', 'tram_bell']));
    for (const s of shots) expect(s.dist).toBeGreaterThanOrEqual(12);
    for (const s of shots) expect(s.dist).toBeLessThanOrEqual(35);
  });

  it('puts rope creaks and ship horns on the water side at the typhoon shelter', () => {
    const shots = run({ ...street, zone: 'typhoon', x: 0, z: -150 }, 300);
    const harbour = shots.filter((s) => s.id === 'rope_creak' || s.id === 'ship_horn');
    expect(harbour.some((s) => s.id === 'ship_horn')).toBe(true);
    for (const s of harbour) expect(s.north).toBeGreaterThan(0);
  });

  it('plays one-shots quieter during combat', () => {
    const calm = run(street, 300).filter((s) => s.id === 'car_horn');
    const fight = run({ ...street, mode: 'combat' }, 300).filter((s) => s.id === 'car_horn');
    expect(fight[0].volume).toBeCloseTo(calm[0].volume / 2);
  });
});
