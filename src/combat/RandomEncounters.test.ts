import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ringReady } from './RandomEncounters';

const at = (x: number, z: number) => ({ position: new Vector3(x, 0, z) });
const player = new Vector3(0, 0, 0);
const open = () => true;

describe('ringReady', () => {
  it("waits until one thug is in the player's face", () => {
    expect(ringReady(player, [at(9, 0), at(0, 10)], open)).toBe(false);
    expect(ringReady(player, [at(6, 0), at(0, 10)], open)).toBe(true);
  });

  it('never rings in a thug stranded too far out', () => {
    expect(ringReady(player, [at(2, 0), at(0, 18.5)], open)).toBe(false);
  });

  it('never rings in a thug on the far side of a railing', () => {
    const behindRailing = at(0, 5);
    expect(ringReady(player, [at(2, 0), behindRailing], (c) => c !== behindRailing)).toBe(false);
  });
});
