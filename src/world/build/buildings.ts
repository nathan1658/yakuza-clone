import { LOTS } from '../data/buildings';
import { SOGO } from '../data/layout';
import type { FacadeStyle, Side } from '../data/layout';
import { centerX, centerZ } from '../data/rect';
import type { Rect } from '../data/rect';
import { mulberry32, pick } from '../data/rng';
import type { Batcher } from '../rendering/Batcher';
import type { MatKey } from '../rendering/materials';

/** Must match FACADE_BAYS / FACADE_LIT order in shaders.ts. */
const STYLE_ID: Readonly<Record<FacadeStyle, number>> = { tong: 0, concrete: 1, commercial: 2, low: 3 };
const SIDE_STYLE = 4;
const BAY_WIDTH = [3.2, 1.6, 1.8, 3.0, 5.5];

/** Faded paint of forty monsoons: tong lau pastels, stained concrete, dark office cladding. */
const PALETTE: Readonly<Record<FacadeStyle, readonly number[]>> = {
  tong: [0xb4a48c, 0x98aca2, 0xb89c98, 0xa2a2b2, 0xaaa88e, 0xc0b8a6, 0x9c8a80],
  concrete: [0x96928a, 0x8a8882, 0xa49c8c, 0x7c8086, 0x8e8478],
  commercial: [0x4a5058, 0x3e4650, 0x55585c, 0x485048],
  low: [0x8a8680, 0x9a9488, 0x7a7670, 0x86807a],
};

const ROOF = 0x2c2a28;
const SOGO_FACE = 0xb4b2ac;

/** Wall endpoints per side, ordered so MeshBuilder.wall faces outwards. */
function edge(r: Rect, side: Side): readonly [number, number, number, number] {
  switch (side) {
    case 'N': return [r.x1, r.z0, r.x0, r.z0];
    case 'S': return [r.x0, r.z1, r.x1, r.z1];
    case 'E': return [r.x1, r.z1, r.x1, r.z0];
    case 'W': return [r.x0, r.z0, r.x0, r.z1];
  }
}

const SIDES: readonly Side[] = ['N', 'S', 'E', 'W'];

/**
 * One building mass: four procedural facades and a flat roof. `fronts` lists
 * the street sides (shops below, full window rhythm above); the rest get the
 * sparse side-wall pattern. Bays are centred on each wall so no window is cut.
 */
function mass(b: Batcher<MatKey>, r: Rect, height: number, style: FacadeStyle, fronts: string, seed: number, grit: number, hex: number): void {
  const m = b.at('facade', centerX(r), centerZ(r)).color(hex, 1 - grit * 0.3);
  for (const side of SIDES) {
    const kind = fronts.includes(side) ? STYLE_ID[style] : SIDE_STYLE;
    const [x0, z0, x1, z1] = edge(r, side);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const bay = BAY_WIDTH[kind];
    m.data(kind, seed % 1000, grit, height).wall(x0, z0, x1, z1, 0, height, -(len % bay) / 2);
  }
  b.at('flat', centerX(r), centerZ(r)).color(ROOF).data(0).floor(r.x0, r.x1, r.z0, r.z1, height);
}

/** Every lot from the block plan (backdrops included), plus Sogo's department store. */
export function buildBuildings(b: Batcher<MatKey>): void {
  for (const lot of LOTS) {
    const hex = pick(mulberry32(lot.seed), PALETTE[lot.style]);
    mass(b, lot.rect, lot.height, lot.style, lot.front ?? '', lot.seed, lot.grit, hex);
  }
  mass(b, SOGO.west, SOGO.height, 'commercial', 'NE', 101, 0, SOGO_FACE);
  mass(b, SOGO.centre, SOGO.height, 'commercial', 'N', 102, 0, SOGO_FACE);
  mass(b, SOGO.east, SOGO.height, 'commercial', 'NW', 103, 0, SOGO_FACE);
  mass(b, SOGO.wing, SOGO.wingHeight, 'commercial', 'NW', 104, 0, SOGO_FACE);
}
