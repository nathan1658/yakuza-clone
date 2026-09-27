import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { LocationId, ZoneId } from '../../core/types';
import { LOTS } from './buildings';
import { COLLIDERS, colliderTop, footprintContains, footprintDistance } from './colliders';
import { ARENA, BOUNDS, HENNESSY, WALK, WALK_RECTS } from './layout';
import { HOTSPOTS, LOCATIONS } from './locations';
import { MINIMAP } from './minimap';
import { PEDESTRIAN_PATHS } from './paths';
import { inRect, rectsOverlap } from './rect';
import { mulberry32 } from './rng';
import { sampleRing } from './spawnRing';
import { PROP_SPAWNS, TERRITORIES } from './spawns';
import { TriggerSet } from './TriggerSet';
import { BLOCKING_COLLIDERS, isWalkableXZ } from './walkable';
import { zoneAt } from './zones';

const inBounds = (x: number, z: number): boolean =>
  x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ;

describe('locations and hotspots', () => {
  const ids = Object.keys(LOCATIONS) as LocationId[];

  it('has all 22 anchors, walkable, in bounds, on the ground', () => {
    expect(ids).toHaveLength(22);
    for (const id of ids) {
      const { position: p, yaw } = LOCATIONS[id];
      expect(inBounds(p.x, p.z), id).toBe(true);
      expect(isWalkableXZ(p.x, p.z), id).toBe(true);
      expect(p.y).toBe(0);
      expect(Number.isFinite(yaw)).toBe(true);
    }
  });

  it('puts each anchor in the expected zone', () => {
    const expected: Record<ZoneId, LocationId[]> = {
      percy: ['player_start', 'percy_curry_fishball', 'percy_alley', 'percy_north', 'percy_payphone'],
      hennessy: ['hennessy_center', 'hennessy_newsstand', 'hennessy_payphone', 'substory_pager', 'substory_debt'],
      sogo: ['sogo_crossing', 'sogo_plaza', 'sogo_plaza_entry', 'sogo_payphone', 'sogo_dai_pai_dong'],
      typhoon: ['typhoon_entry', 'typhoon_promenade', 'typhoon_pier', 'typhoon_crab_boat', 'typhoon_payphone'],
    };
    for (const [zone, locs] of Object.entries(expected)) {
      for (const id of locs) expect(zoneAt(LOCATIONS[id].position.x, LOCATIONS[id].position.z), id).toBe(zone);
    }
  });

  it('has 9 unique walkable hotspots with the agreed labels', () => {
    expect(new Set(HOTSPOTS.map((h) => h.id)).size).toBe(9);
    const labels = { vendor: '購買', payphone: '打電話', pickup: '拾起' };
    for (const h of HOTSPOTS) {
      expect(isWalkableXZ(h.position.x, h.position.z), h.id).toBe(true);
      expect(h.label).toBe(labels[h.kind]);
      expect(h.kind === 'vendor').toBe(h.shopId !== undefined);
    }
  });
});

describe('boss arena', () => {
  it(`keeps every solid collider ≥ ${ARENA.radius} m (XZ) from sogo_plaza`, () => {
    const plaza = LOCATIONS.sogo_plaza.position;
    expect([plaza.x, plaza.z]).toEqual([ARENA.x, ARENA.z]);
    for (const c of COLLIDERS) {
      if (colliderTop(c) <= 0.05) continue; // the ground slab under the whole city
      expect(footprintDistance(c, ARENA.x, ARENA.z), JSON.stringify(c)).toBeGreaterThanOrEqual(ARENA.radius);
    }
  });

  it('is open floor all the way round', () => {
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      expect(isWalkableXZ(ARENA.x + Math.cos(t) * 13, ARENA.z + Math.sin(t) * 13)).toBe(true);
    }
  });
});

describe('zones', () => {
  it('splits the map along street mouths', () => {
    expect(zoneAt(0, 12)).toBe('hennessy');
    expect(zoneAt(-64, -0.5)).toBe('hennessy');
    expect(zoneAt(-64, -2)).toBe('percy');
    expect(zoneAt(-20, -30)).toBe('percy');
    expect(zoneAt(60, 12)).toBe('sogo');
    expect(zoneAt(82, -30)).toBe('sogo');
    expect(zoneAt(-63, -145)).toBe('typhoon');
    expect(zoneAt(20, -190)).toBe('typhoon');
  });
});

describe('walkability', () => {
  it('rejects buildings, water and railings', () => {
    expect(isWalkableXZ(-100, -20)).toBe(false); // N1
    expect(isWalkableXZ(0, -185)).toBe(false); // harbour
    expect(isWalkableXZ(0, 4.85)).toBe(false); // Hennessy kerb railing
    expect(isWalkableXZ(0, -175)).toBe(false); // sea wall
  });

  it('allows the road, the crossings and the pier', () => {
    expect(isWalkableXZ(0, 12)).toBe(true);
    expect(isWalkableXZ(-12, 4.85)).toBe(true);
    expect(isWalkableXZ(-31, -175)).toBe(true);
  });

  it('keeps ≥ 12 × 9 m of clear floor in the dai pai dong alley', () => {
    for (let x = -91; x <= -73; x += 0.5) {
      for (let z = -62.8; z <= -53.2; z += 0.5) expect(isWalkableXZ(x, z), `${x},${z}`).toBe(true);
    }
  });

  it('keeps both tram envelopes clear of solids between the invisible end walls', () => {
    for (const track of [HENNESSY.trackN, HENNESSY.trackS]) {
      for (let x = -149.5; x <= 149.5; x += 0.5) {
        for (const dz of [-HENNESSY.tramHalfWidth, 0, HENNESSY.tramHalfWidth]) {
          const hit = BLOCKING_COLLIDERS.find((c) => footprintContains(c, x, track + dz, 0));
          expect(hit, `${x},${track + dz}`).toBeUndefined();
        }
      }
    }
  });
});

describe('buildings', () => {
  it('has no degenerate lots and none on a walkable street', () => {
    for (const lot of LOTS) {
      expect(lot.rect.x1 - lot.rect.x0, lot.id).toBeGreaterThan(0.5);
      expect(lot.rect.z1 - lot.rect.z0, lot.id).toBeGreaterThan(0.5);
      if (lot.backdrop) continue;
      for (const w of WALK_RECTS) expect(rectsOverlap(lot.rect, w), lot.id).toBe(false);
    }
  });
});

describe('spawn points', () => {
  const walkable = (x: number, z: number): boolean => isWalkableXZ(x, z);

  it('returns walkable, separated points inside the ring', () => {
    const c = LOCATIONS.sogo_plaza.position;
    const pts = sampleRing(mulberry32(7), c.x, c.z, 3, 8, 6, walkable);
    expect(pts).toHaveLength(6);
    for (const [x, z] of pts) {
      const r = Math.hypot(x - c.x, z - c.z);
      expect(r).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(r).toBeLessThanOrEqual(8 + 1e-9);
      expect(walkable(x, z)).toBe(true);
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('returns fewer points, never bad ones, when the ring is mostly walls', () => {
    const pts = sampleRing(mulberry32(3), -100, -20, 0, 20, 8, walkable);
    for (const [x, z] of pts) expect(walkable(x, z)).toBe(true);
    expect(sampleRing(mulberry32(3), -100, -20, 0, 10, 8, walkable)).toHaveLength(0);
  });
});

describe('triggers', () => {
  function harness() {
    const log: string[] = [];
    const set = new TriggerSet(
      (id) => log.push(`enter:${id}`),
      (id) => log.push(`exit:${id}`),
    );
    return { log, set };
  }

  it('emits enter and exit on the edges only', () => {
    const { log, set } = harness();
    set.add({ id: 's', shape: { type: 'sphere', center: new Vector3(0, 1, 0), radius: 2 } });
    set.update(5, 0, 1.8, 0);
    set.update(1, 0, 1.8, 0);
    set.update(1.5, 0, 1.8, 0);
    set.update(5, 0, 1.8, 0);
    expect(log).toEqual(['enter:s', 'exit:s']);
  });

  it('removes a once trigger after it fires', () => {
    const { log, set } = harness();
    set.add({ id: 'o', shape: { type: 'sphere', center: new Vector3(0, 0, 0), radius: 1 }, once: true });
    set.update(0, 0, 1.8, 0);
    set.update(5, 0, 1.8, 0);
    set.update(0, 0, 1.8, 0);
    expect(log).toEqual(['enter:o']);
    expect(set.size).toBe(0);
  });

  it('tests boxes against the body height and removes silently', () => {
    const { log, set } = harness();
    set.add({ id: 'b', shape: { type: 'box', min: new Vector3(-1, 3, -1), max: new Vector3(1, 5, 1) } });
    set.update(0, 0, 1.8, 0);
    set.update(0, 2, 3.8, 0);
    set.remove('b');
    set.update(9, 0, 1.8, 9);
    expect(log).toEqual(['enter:b']);
  });
});

describe('prop spawns and territories', () => {
  it('places every prop on walkable ground in its own zone', () => {
    expect(PROP_SPAWNS.length).toBeGreaterThanOrEqual(24);
    for (const p of PROP_SPAWNS) {
      expect(isWalkableXZ(p.position.x, p.position.z), `${p.kind}@${p.position.x},${p.position.z}`).toBe(true);
      expect(p.zone).toBe(zoneAt(p.position.x, p.position.z));
    }
  });

  it('stocks the tutorial alley and the arena edge', () => {
    const inAlley = PROP_SPAWNS.filter((p) => inRect(WALK.alley, p.position.x, p.position.z));
    const count = (kind: string) => inAlley.filter((p) => p.kind === kind).length;
    expect(count('folding_chair')).toBeGreaterThanOrEqual(3);
    expect(count('beer_bottle')).toBeGreaterThanOrEqual(2);
    expect(count('wooden_stool')).toBeGreaterThanOrEqual(1);
    const brawl = LOCATIONS.percy_alley.position;
    expect(inAlley.some((p) => p.kind === 'folding_chair' && p.position.distanceTo(brawl) < 6)).toBe(true);
    const plaza = LOCATIONS.sogo_plaza.position;
    const edgeChairs = PROP_SPAWNS.filter((p) => p.kind === 'folding_chair' && p.position.distanceTo(plaza) < 24);
    expect(edgeChairs.length).toBeGreaterThanOrEqual(2);
    expect(PROP_SPAWNS.filter((p) => p.kind === 'traffic_cone').length).toBeGreaterThanOrEqual(3);
  });

  it('defines Tung Shing turf with a sane box and zone', () => {
    for (const t of TERRITORIES) {
      expect(t.min.x).toBeLessThan(t.max.x);
      expect(t.min.z).toBeLessThan(t.max.z);
      expect(t.encounterChance).toBeCloseTo(0.15);
      expect(t.zone).toBe(zoneAt((t.min.x + t.max.x) / 2, (t.min.z + t.max.z) / 2));
    }
  });
});

describe('pedestrian paths', () => {
  it('keeps every path ≥ 0.5 m clear of solids', () => {
    for (const path of PEDESTRIAN_PATHS) {
      for (let i = 1; i < path.length; i++) {
        const [ax, az] = path[i - 1];
        const [bx, bz] = path[i];
        const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
        for (let s = 0; s <= steps; s++) {
          const x = ax + ((bx - ax) * s) / steps;
          const z = az + ((bz - az) * s) / steps;
          expect(isWalkableXZ(x, z, 0.5), `${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
        }
      }
    }
  });
});

describe('minimap', () => {
  it('has closed, non-degenerate polygons and labels inside its bounds', () => {
    const b = MINIMAP.bounds;
    for (const s of MINIMAP.shapes) {
      expect(s.points.length).toBeGreaterThanOrEqual(3);
      const first = s.points[0];
      const last = s.points[s.points.length - 1];
      expect(first.x === last.x && first.z === last.z).toBe(false);
      let area = 0;
      for (let i = 0; i < s.points.length; i++) {
        const p = s.points[i];
        const q = s.points[(i + 1) % s.points.length];
        area += p.x * q.z - q.x * p.z;
      }
      expect(Math.abs(area)).toBeGreaterThan(0);
    }
    for (const l of MINIMAP.labels) {
      expect(l.x >= b.minX && l.x <= b.maxX && l.z >= b.minZ && l.z <= b.maxZ, l.text).toBe(true);
    }
    const kinds = new Set(MINIMAP.shapes.map((s) => s.kind));
    expect([...kinds].sort()).toEqual(['building', 'plaza', 'rail', 'road', 'sidewalk', 'water']);
  });
});
