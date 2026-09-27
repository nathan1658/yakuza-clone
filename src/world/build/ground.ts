import { CROSSINGS, HENNESSY, JUNCTION, TRAM_ISLANDS, WALK, WATER } from '../data/layout';
import { centerX, centerZ, rect, splitRect } from '../data/rect';
import type { Rect } from '../data/rect';
import type { Batcher } from '../rendering/Batcher';
import type { MatKey } from '../rendering/materials';

/** Surface ids must match GROUND_FRAGMENT. `puddles` scales how much water collects. */
interface Surface {
  readonly id: number;
  readonly hex: number;
  readonly puddles: number;
}

const ASPHALT: Surface = { id: 0, hex: 0x303036, puddles: 0.8 };
const TILES: Surface = { id: 1, hex: 0x70625e, puddles: 1 };
const CONCRETE: Surface = { id: 2, hex: 0x605e5a, puddles: 1 };
const WOOD: Surface = { id: 3, hex: 0x4a3628, puddles: 0.25 };
const STONE: Surface = { id: 4, hex: 0x7a726a, puddles: 1 };
const FAR: Surface = { id: 0, hex: 0x1e1e22, puddles: 0.4 };

const KERB: Surface = { id: 2, hex: 0x8c8980, puddles: 0.5 };
const ISLAND: Surface = { id: 2, hex: 0x6e6b66, puddles: 0.6 };
const WHITE: Surface = { id: 5, hex: 0xd8d8ce, puddles: 0.6 };
const YELLOW: Surface = { id: 5, hex: 0xd4a62a, puddles: 0.6 };
const RAIL: Surface = { id: 5, hex: 0x9a9ca2, puddles: 0 };

/** Paint layers stack a few millimetres apart so crossings over rails never fight. */
const LINE_Y = 0.002;
const RAIL_Y = 0.004;

const HALF_ROAD = 270;

const PAVING: ReadonlyArray<readonly [Surface, Rect]> = [
  // Hennessy Road: carriageway, pavements, and the mouths of Percy Street and East Point Road.
  [ASPHALT, rect(-HALF_ROAD, HALF_ROAD, HENNESSY.northKerb, HENNESSY.southKerb)],
  [TILES, rect(-HALF_ROAD, -68, 0, HENNESSY.northKerb)],
  [ASPHALT, rect(-68, -60, 0, HENNESSY.northKerb)],
  [TILES, rect(-60, 77, 0, HENNESSY.northKerb)],
  [ASPHALT, rect(77, 87, 0, HENNESSY.northKerb)],
  [TILES, rect(87, HALF_ROAD, 0, HENNESSY.northKerb)],
  [TILES, rect(-HALF_ROAD, HALF_ROAD, HENNESSY.southKerb, 24)],
  // Percy Street.
  [ASPHALT, rect(-68, -60, -130, 0)],
  [TILES, rect(-72, -68, -130, 0)],
  [TILES, rect(-60, -56, -130, 0)],
  [CONCRETE, WALK.alley],
  [CONCRETE, WALK.path],
  [CONCRETE, WALK.cannon],
  // East Point Road and Pennington Street.
  [ASPHALT, rect(77, 87, -40, 0)],
  [TILES, rect(74, 77, -40, 0)],
  [TILES, rect(87, 90, -40, 0)],
  [ASPHALT, WALK.pennington],
  // Sogo plaza and the harbour front.
  [STONE, WALK.plaza],
  [STONE, WALK.sogoEntrance],
  [TILES, WALK.promenade],
  [ASPHALT, rect(60, HALF_ROAD, -148, -130)],
  [WOOD, WALK.pier],
  [WOOD, WALK.gangway],
  [WOOD, WALK.crabDeck],
];

const KERBS: readonly Rect[] = [
  rect(-HALF_ROAD, -68, HENNESSY.northKerb - 0.3, HENNESSY.northKerb),
  rect(-60, 77, HENNESSY.northKerb - 0.3, HENNESSY.northKerb),
  rect(87, HALF_ROAD, HENNESSY.northKerb - 0.3, HENNESSY.northKerb),
  rect(-HALF_ROAD, HALF_ROAD, HENNESSY.southKerb, HENNESSY.southKerb + 0.3),
  rect(-68.3, -68, -130, HENNESSY.northKerb),
  rect(-60, -59.7, -130, HENNESSY.northKerb),
  rect(76.7, 77, -40, HENNESSY.northKerb),
  rect(87, 87.3, -40, HENNESSY.northKerb),
];

function lay(b: Batcher<MatKey>, key: 'ground' | 'paint', s: Surface, r: Rect, y = 0): void {
  for (const p of splitRect(r, 50)) {
    b.at(key, centerX(p), centerZ(p)).color(s.hex).data(s.id, s.puddles).floor(p.x0, p.x1, p.z0, p.z1, y);
  }
}

/** Lane markings stop short of the zebra crossings and leave the Sogo junction box clear. */
const LINE_GAPS: ReadonlyArray<readonly [number, number]> = [
  ...CROSSINGS.map((c) => [c.x0 - 1, c.x1 + 1] as const),
  [JUNCTION.x0, JUNCTION.x1],
];

const painted = (x: number): boolean => !LINE_GAPS.some(([a, b]) => x > a && x < b);

function dashes(b: Batcher<MatKey>, s: Surface, z: number, width: number, dash: number, gap: number): void {
  for (let x = -HALF_ROAD; x < HALF_ROAD; x += dash + gap) {
    if (painted(x) && painted(x + dash)) lay(b, 'paint', s, rect(x, x + dash, z - width / 2, z + width / 2), LINE_Y);
  }
}

function paintHennessy(b: Batcher<MatKey>): void {
  for (const k of KERBS) lay(b, 'paint', KERB, k);
  dashes(b, WHITE, 8.5, 0.12, 3, 6);
  dashes(b, WHITE, 15.5, 0.12, 3, 6);
  dashes(b, YELLOW, 11.85, 0.1, 6, 0);
  dashes(b, YELLOW, 12.15, 0.1, 6, 0);
  // Tram rails run straight through everything.
  for (const track of [HENNESSY.trackN, HENNESSY.trackS]) {
    for (const side of [-1, 1]) {
      const z = track + (side * HENNESSY.gauge) / 2;
      lay(b, 'paint', RAIL, rect(-HALF_ROAD, HALF_ROAD, z - 0.035, z + 0.035), RAIL_Y);
    }
  }
  for (const { rect: r } of TRAM_ISLANDS) {
    lay(b, 'paint', ISLAND, r);
    lay(b, 'paint', YELLOW, rect(r.x0, r.x1, r.z0, r.z0 + 0.12), LINE_Y);
    lay(b, 'paint', YELLOW, rect(r.x0, r.x1, r.z1 - 0.12, r.z1), LINE_Y);
  }
  // Zebra bars lie along the traffic, stepping across the road every metre.
  for (const c of CROSSINGS) {
    for (let z = c.z0 + 0.6; z + 0.5 <= c.z1 - 0.4; z += 1) {
      lay(b, 'paint', WHITE, rect(c.x0 + 0.1, c.x1 - 0.1, z, z + 0.5), LINE_Y);
    }
  }
}

/** Streets, pavements, road paint, the far city floor and the harbour water. */
export function buildGround(b: Batcher<MatKey>): void {
  for (const [s, r] of PAVING) lay(b, 'ground', s, r);
  paintHennessy(b);
  b.at('ground', 0, 0).color(FAR.hex).data(FAR.id, FAR.puddles).floor(-900, 900, WATER.shoreZ, 900, -0.1);
  const w = WATER.rect;
  b.at('water', 0, w.z1).color(0x0a141c).floor(w.x0, w.x1, w.z0, w.z1, WATER.level);
}
