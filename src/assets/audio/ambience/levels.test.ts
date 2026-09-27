import { describe, expect, it } from 'vitest';
import { ambienceTargets, type AmbienceInput, type LayerLevels, percyDistance, seamless } from './levels';

const out = (): LayerLevels => ({ rain: 0, drips: 0, city: 0, harbour: 0, neon: 0 });
const street: AmbienceInput = { mode: 'freeRoam', zone: 'hennessy', weather: 'rain', x: 0, z: 12 };

describe('ambienceTargets', () => {
  it('follows the weather', () => {
    expect(ambienceTargets({ ...street, weather: 'clear' }, out()).rain).toBe(0);
    expect(ambienceTargets({ ...street, weather: 'drizzle' }, out()).rain).toBeCloseTo(0.35);
    expect(ambienceTargets(street, out()).rain).toBe(1);
    expect(ambienceTargets({ ...street, weather: 'clear' }, out()).drips).toBeGreaterThan(0);
  });
  it('swaps city for harbour in the typhoon shelter', () => {
    const h = ambienceTargets({ ...street, zone: 'typhoon' }, out());
    expect(h.harbour).toBe(1);
    expect(h.city).toBeLessThan(0.5);
    expect(ambienceTargets(street, out()).harbour).toBe(0);
  });
  it('hums near Percy Street and fades out over 25 m', () => {
    expect(ambienceTargets({ ...street, x: -64, z: -60 }, out()).neon).toBe(1);
    expect(ambienceTargets({ ...street, x: -44, z: -60 }, out()).neon).toBeCloseTo(0.52);
    expect(ambienceTargets({ ...street, x: 40, z: 12 }, out()).neon).toBe(0);
    expect(percyDistance(-64, 5)).toBe(5);
  });
  it('halves everything during fights', () => {
    const calm = ambienceTargets(street, out());
    const fight = ambienceTargets({ ...street, mode: 'combat' }, out());
    expect(fight.city).toBe(calm.city / 2);
    expect(fight.rain).toBe(calm.rain / 2);
  });
  it('writes into the given object', () => {
    const o = out();
    expect(ambienceTargets(street, o)).toBe(o);
  });
});

describe('seamless', () => {
  it('returns loopLen samples whose wrap-around is continuous', () => {
    const loopLen = 1000;
    const data = new Float32Array(1200).map((_, i) => Math.sin(i * 0.05));
    const loop = seamless(data, loopLen);
    expect(loop.length).toBe(loopLen);
    expect(loop[0]).toBeCloseTo(Math.sin(loopLen * 0.05));
    const jump = Math.abs(loop[0] - loop[loopLen - 1]);
    expect(jump).toBeLessThan(0.06);
    expect(loop[500]).toBeCloseTo(Math.sin(500 * 0.05));
  });
});
