/**
 * Every static collider in the world as plain data. World registers exactly
 * this list with physics, and isWalkable() and the tests read the same list,
 * so "walkable" and "solid" can never disagree.
 */
import { LOTS } from './buildings';
import { FURNITURE, FURNITURE_SPEC, RAILINGS, RAILING_HEIGHT, RAILING_THICKNESS } from './furniture';
import type { Furniture, Railing } from './furniture';
import { FLYOVER, SOGO, WALK } from './layout';
import type { Rect } from './rect';

/** Oriented box: centre, half extents, rotation about +Y (local +Z faces (sin rotY, 0, cos rotY)). */
export interface BoxCollider {
  readonly kind: 'box';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
  readonly rotY: number;
}

export interface CylinderCollider {
  readonly kind: 'cyl';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly hh: number;
  readonly r: number;
}

export type ColliderDef = BoxCollider | CylinderCollider;

const halfHeight = (c: ColliderDef): number => (c.kind === 'box' ? c.hy : c.hh);
export const colliderBottom = (c: ColliderDef): number => c.y - halfHeight(c);
export const colliderTop = (c: ColliderDef): number => c.y + halfHeight(c);

/** Axis-aligned box from a rect and a vertical span. */
export function rectBox(r: Rect, y0: number, y1: number): BoxCollider {
  return {
    kind: 'box',
    x: (r.x0 + r.x1) / 2,
    y: (y0 + y1) / 2,
    z: (r.z0 + r.z1) / 2,
    hx: (r.x1 - r.x0) / 2,
    hy: (y1 - y0) / 2,
    hz: (r.z1 - r.z0) / 2,
    rotY: 0,
  };
}

const span = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 });

function furnitureCollider(f: Furniture): ColliderDef {
  const spec = FURNITURE_SPEC[f.kind];
  if (spec.round) return { kind: 'cyl', x: f.x, y: spec.h / 2, z: f.z, hh: spec.h / 2, r: f.w / 2 };
  return { kind: 'box', x: f.x, y: spec.h / 2, z: f.z, hx: f.w / 2, hy: spec.h / 2, hz: f.d / 2, rotY: f.yaw };
}

/** A railing run becomes one thin box whose local X follows the run. */
function railingCollider(r: Railing): BoxCollider {
  const dx = r.x1 - r.x0;
  const dz = r.z1 - r.z0;
  return {
    kind: 'box',
    x: (r.x0 + r.x1) / 2,
    y: RAILING_HEIGHT / 2,
    z: (r.z0 + r.z1) / 2,
    hx: Math.hypot(dx, dz) / 2,
    hy: RAILING_HEIGHT / 2,
    hz: RAILING_THICKNESS / 2,
    rotY: Math.atan2(-dz, dx),
  };
}

export const SEA_WALL = { z: -175, half: 0.25, top: 1.05, bottom: -2, runs: [[-150, -34], [-28, 18.8], [21.2, 60]] } as const;

function harbourColliders(): BoxCollider[] {
  const wall = SEA_WALL.runs.map(([a, b]) =>
    rectBox(span(a, b, SEA_WALL.z - SEA_WALL.half, SEA_WALL.z + SEA_WALL.half), SEA_WALL.bottom, SEA_WALL.top),
  );
  // Pier, gangway and the crab boat deck are floors at y = 0 over the water.
  const decks = [WALK.pier, WALK.gangway, WALK.crabDeck].map((r) => rectBox(r, -1, 0));
  // Anything that still ends up in the water lands here instead of falling forever.
  const seabed = rectBox(span(-270, 270, -420, -175), -3.5, -2.5);
  return [...wall, ...decks, seabed];
}

/** Invisible walls where the streets run on visually but the map ends. */
const END_WALLS: readonly BoxCollider[] = [
  rectBox(span(-150.5, -150, 0, 24), 0, 6),
  rectBox(span(150, 150.5, 0, 24), 0, 6),
  rectBox(span(-150.5, -150, -175, -150), 0, 6),
];

const GROUND = rectBox(span(-270, 270, -175, 100), -1, 0);

const SOGO_COLLIDERS: readonly BoxCollider[] = [
  rectBox(SOGO.west, 0, SOGO.height),
  rectBox(SOGO.centre, 0, SOGO.height),
  rectBox(SOGO.east, 0, SOGO.height),
  rectBox(SOGO.wing, 0, SOGO.wingHeight),
];

/** Only the stretch over the playable area: it keeps the camera out of the deck. */
const FLYOVER_DECK = rectBox(span(-150, 160, FLYOVER.z0, FLYOVER.z1), FLYOVER.deckY - FLYOVER.thickness, FLYOVER.deckY);

export const COLLIDERS: readonly ColliderDef[] = [
  GROUND,
  ...LOTS.filter((l) => !l.backdrop).map((l) => rectBox(l.rect, 0, l.height)),
  ...SOGO_COLLIDERS,
  ...FURNITURE.map(furnitureCollider),
  ...RAILINGS.map(railingCollider),
  ...harbourColliders(),
  ...END_WALLS,
  FLYOVER_DECK,
];

/** Does collider c's XZ footprint, grown by `pad`, contain (x, z)? */
export function footprintContains(c: ColliderDef, x: number, z: number, pad: number): boolean {
  const dx = x - c.x;
  const dz = z - c.z;
  if (c.kind === 'cyl') return dx * dx + dz * dz <= (c.r + pad) * (c.r + pad);
  const cos = Math.cos(c.rotY);
  const sin = Math.sin(c.rotY);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) <= c.hx + pad && Math.abs(lz) <= c.hz + pad;
}

/** Horizontal distance from (x, z) to collider c's footprint (0 inside). */
export function footprintDistance(c: ColliderDef, x: number, z: number): number {
  const dx = x - c.x;
  const dz = z - c.z;
  if (c.kind === 'cyl') return Math.max(0, Math.hypot(dx, dz) - c.r);
  const cos = Math.cos(c.rotY);
  const sin = Math.sin(c.rotY);
  const ex = Math.max(0, Math.abs(dx * cos - dz * sin) - c.hx);
  const ez = Math.max(0, Math.abs(dx * sin + dz * cos) - c.hz);
  return Math.hypot(ex, ez);
}
