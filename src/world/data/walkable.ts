/**
 * Walkability = inside a WALK rect and clear of every collider that would
 * block a standing body. Colliders are bucketed on a coarse grid once, so a
 * query touches a handful of footprints instead of the whole city.
 */
import { COLLIDERS, colliderBottom, colliderTop, footprintContains } from './colliders';
import type { ColliderDef } from './colliders';
import { BOUNDS, WALK_RECTS } from './layout';
import { inRect } from './rect';

/** Only solids overlapping this height band block a body: skips floor slabs and the flyover deck. */
const BODY_Y0 = 0.3;
const BODY_Y1 = 1.8;
/** Character radius-ish margin kept from every solid. */
export const CLEARANCE = 0.3;

const GRID = 8;
const NX = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / GRID);
const NZ = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / GRID);

const cellX = (x: number): number => Math.min(NX - 1, Math.max(0, Math.floor((x - BOUNDS.minX) / GRID)));
const cellZ = (z: number): number => Math.min(NZ - 1, Math.max(0, Math.floor((z - BOUNDS.minZ) / GRID)));

/** Half extents of a collider's world-space XZ bounding box. */
function footprintHalf(c: ColliderDef): [number, number] {
  if (c.kind === 'cyl') return [c.r, c.r];
  const cos = Math.abs(Math.cos(c.rotY));
  const sin = Math.abs(Math.sin(c.rotY));
  return [c.hx * cos + c.hz * sin, c.hx * sin + c.hz * cos];
}

function buildGrid(solids: readonly ColliderDef[]): ColliderDef[][] {
  const grid: ColliderDef[][] = Array.from({ length: NX * NZ }, () => []);
  for (const c of solids) {
    const [hx, hz] = footprintHalf(c);
    const pad = CLEARANCE;
    for (let ix = cellX(c.x - hx - pad); ix <= cellX(c.x + hx + pad); ix++) {
      for (let iz = cellZ(c.z - hz - pad); iz <= cellZ(c.z + hz + pad); iz++) grid[ix + iz * NX].push(c);
    }
  }
  return grid;
}

export const BLOCKING_COLLIDERS: readonly ColliderDef[] = COLLIDERS.filter(
  (c) => colliderBottom(c) < BODY_Y1 && colliderTop(c) > BODY_Y0,
);

const GRID_CELLS = buildGrid(BLOCKING_COLLIDERS);

export function isWalkableXZ(x: number, z: number, clearance = CLEARANCE): boolean {
  if (!WALK_RECTS.some((r) => inRect(r, x, z))) return false;
  const cell = GRID_CELLS[cellX(x) + cellZ(z) * NX];
  for (const c of cell) if (footprintContains(c, x, z, clearance)) return false;
  return true;
}

/** Samples closer together than 2 x LINE_PAD: not even an 8 cm railing slips between two of them. */
const LINE_STEP = 0.25;
const LINE_PAD = 0.15;

/**
 * Nothing solid on the straight line between two points. Stricter than "reachable" (a bench
 * in the way fails it), which is what spawning wants: kerb railings split a street into two
 * sides that only meet at the crossings.
 */
export function clearLineXZ(x0: number, z0: number, x1: number, z1: number): boolean {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / LINE_STEP);
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const z = z0 + ((z1 - z0) * i) / n;
    for (const c of GRID_CELLS[cellX(x) + cellZ(z) * NX]) if (footprintContains(c, x, z, LINE_PAD)) return false;
  }
  return true;
}
