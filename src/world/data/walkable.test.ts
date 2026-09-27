import { describe, expect, it } from 'vitest';
import { ARENA } from './layout';
import { LOCATIONS } from './locations';
import { clearLineXZ } from './walkable';

describe('clearLineXZ', () => {
  it('passes over open floor', () => {
    // No collider comes within ARENA.radius of the plaza centre.
    const r = ARENA.radius - 0.2;
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2;
      expect(clearLineXZ(ARENA.x, ARENA.z, ARENA.x + Math.cos(t) * r, ARENA.z + Math.sin(t) * r)).toBe(true);
    }
  });

  it('stops at an 8 cm kerb railing', () => {
    // The loan shark stands 1.3 m south of the Hennessy railing; the road is on the other side.
    const c = LOCATIONS.substory_debt.position;
    expect(clearLineXZ(c.x, c.z, c.x, c.z - 3)).toBe(false);
    expect(clearLineXZ(c.x, c.z - 3, c.x, c.z)).toBe(false);
  });
});
