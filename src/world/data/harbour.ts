/**
 * Causeway Bay typhoon shelter: who is moored where. Sampans raft up in
 * rows off the promenade and lie along the sea wall, junks ride further out,
 * yachts sit off the yacht club to the east, and 蝦叔's sampan lies along the
 * pier beside the spot where he stands. Pure data; nothing here collides.
 */
import { SEA_WALL } from './colliders';
import { WALK } from './layout';
import { hashString, mulberry32, pick, range } from './rng';
import type { Rng } from './rng';
import type { SignDef } from './signs';

export type BoatKind = 'sampan' | 'junk' | 'yacht';

export interface Boat {
  readonly kind: BoatKind;
  readonly x: number;
  readonly z: number;
  /** Bow direction: (sin yaw, 0, cos yaw). */
  readonly yaw: number;
  readonly seed: number;
  /** Lantern colour, or null when nobody is aboard. */
  readonly lamp: number | null;
}

export const BOAT_SIZE: Readonly<Record<BoatKind, { readonly len: number; readonly beam: number }>> = {
  sampan: { len: 7.4, beam: 2.2 },
  junk: { len: 17, beam: 4.8 },
  yacht: { len: 12, beam: 3.6 },
};

const LANTERN = [0xff4a2a, 0xff6a30, 0xffc070, 0xffe0a0] as const;
const HALF_PI = Math.PI / 2;

const lamp = (rng: Rng, chance: number): number | null => (rng() < chance ? pick(rng, LANTERN) : null);

/** 蝦叔's boat, alongside the pier's west rail where typhoon_pier faces. */
export const SHRIMP_SAMPAN: Boat = {
  kind: 'sampan',
  x: WALK.pier.x0 - 0.35 - BOAT_SIZE.sampan.beam / 2,
  z: -188,
  yaw: Math.PI,
  seed: 0x5a1b,
  lamp: 0xffc070,
};

/** Rafted clusters, bows to the harbour, in rows north of the pier and the crab boat. */
function rows(rng: Rng): Boat[] {
  const out: Boat[] = [];
  const { beam } = BOAT_SIZE.sampan;
  for (const z of [-206, -216.5, -227]) {
    let x = -148 + range(rng, 0, 8);
    while (x < 56) {
      const n = 2 + Math.floor(rng() * 4);
      for (let i = 0; i < n && x < 56; i++, x += beam + 0.35) {
        out.push({ kind: 'sampan', x, z: z + range(rng, -0.6, 0.6), yaw: Math.PI + range(rng, -0.06, 0.06), seed: Math.floor(rng() * 1e6), lamp: lamp(rng, 0.45) });
      }
      x += range(rng, 6, 16);
    }
  }
  return out;
}

/** Tied up bow-to-stern along the sea wall, clear of the pier, gangway and crab boat. */
function alongWall(rng: Rng): Boat[] {
  const z = SEA_WALL.z - SEA_WALL.half - 0.35 - BOAT_SIZE.sampan.beam / 2;
  return [-138, -120, -97, -76, -54, -8, 42].map((x) => ({
    kind: 'sampan' as const,
    x,
    z,
    yaw: rng() < 0.5 ? HALF_PI : -HALF_PI,
    seed: Math.floor(rng() * 1e6),
    lamp: lamp(rng, 0.6),
  }));
}

function outer(rng: Rng): Boat[] {
  const junks: Boat[] = [
    [-120, -262, 2.6],
    [-55, -255, 3.3],
    [15, -270, 2.9],
    [88, -262, 3.5],
  ].map(([x, z, yaw]) => ({ kind: 'junk', x, z, yaw, seed: Math.floor(rng() * 1e6), lamp: 0xfff0d0 }));
  const yachts: Boat[] = [
    [66, -205, Math.PI],
    [70.2, -205.6, Math.PI],
    [74.4, -205.2, Math.PI],
    [104, -222, 2.8],
    [124, -212, 3.3],
  ].map(([x, z, yaw]) => ({ kind: 'yacht', x, z, yaw, seed: Math.floor(rng() * 1e6), lamp: lamp(rng, 0.5) }));
  return [...junks, ...yachts];
}

function buildBoats(): Boat[] {
  const rng = mulberry32(hashString('harbour'));
  return [SHRIMP_SAMPAN, ...alongWall(rng), ...rows(rng), ...outer(rng)];
}

export const BOATS: readonly Boat[] = buildBoats();

/** The crab boat's canopy: its roof and the sign on its promenade side. */
export const CRAB_CANOPY = { y: 3.4, thickness: 0.15, inset: 0.2 } as const;

/** Lit board on the crab boat's roof edge, read from the promenade across the water. */
export const HARBOUR_SIGNS: readonly SignDef[] = [
  {
    text: '避風塘炒蟹', kind: 'box', vertical: false,
    x: (WALK.crabDeck.x0 + WALK.crabDeck.x1) / 2, y: CRAB_CANOPY.y + CRAB_CANOPY.thickness + 0.95, z: WALK.crabDeck.z1 - 0.4,
    yaw: 0, w: 8.2, h: 1.7, depth: 0.2, twoSided: false, mount: 0,
    color: 0xc81820, panel: 0xf6d23a, mode: 'steady', font: 'serif', shape: 'board', power: 1, phase: 0,
  },
];
