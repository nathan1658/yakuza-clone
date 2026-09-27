/**
 * Lot subdivision: every block is cut into a ring of street-facing strips
 * (one per front, first front owns the corners), each strip into narrow lots,
 * and whatever is left in the middle becomes one low "core" lot nobody sees
 * from the street. Pure data: colliders and meshes are both derived from it.
 */
import { BLOCKS } from './layout';
import type { BlockDef, FacadeStyle, Side } from './layout';
import { depth, rect, width } from './rect';
import type { Rect } from './rect';
import { hashString, mulberry32, range } from './rng';
import type { Rng } from './rng';

export interface Lot {
  readonly id: string;
  readonly rect: Rect;
  readonly height: number;
  /** Street-facing side, or null for the hidden core of a block. */
  readonly front: Side | null;
  readonly style: FacadeStyle;
  readonly seed: number;
  readonly grit: number;
  readonly backdrop: boolean;
}

interface StyleShape {
  /** Lot frontage range (m). */
  readonly w: readonly [number, number];
  /** Strip depth range (m). */
  readonly d: readonly [number, number];
}

const STYLE_SHAPE: Record<FacadeStyle, StyleShape> = {
  tong: { w: [7, 12], d: [11, 16] },
  concrete: { w: [12, 20], d: [14, 20] },
  commercial: { w: [18, 28], d: [18, 26] },
  low: { w: [6, 12], d: [8, 12] },
};

export const GROUND_FLOOR_H = 4.5;
export const FLOOR_H = 3;

/** A strip thinner than this is not worth a separate core: the strip takes it. */
const MIN_CORE = 6;

/** Street-side strip of `r` on `side` with depth d, plus the remaining rect. */
function carve(r: Rect, side: Side, d: number): [Rect, Rect] {
  switch (side) {
    case 'N':
      return [rect(r.x0, r.x1, r.z0, r.z0 + d), rect(r.x0, r.x1, r.z0 + d, r.z1)];
    case 'S':
      return [rect(r.x0, r.x1, r.z1 - d, r.z1), rect(r.x0, r.x1, r.z0, r.z1 - d)];
    case 'W':
      return [rect(r.x0, r.x0 + d, r.z0, r.z1), rect(r.x0 + d, r.x1, r.z0, r.z1)];
    case 'E':
      return [rect(r.x1 - d, r.x1, r.z0, r.z1), rect(r.x0, r.x1 - d, r.z0, r.z1)];
  }
}

const alongX = (side: Side): boolean => side === 'N' || side === 'S';

/** Cut [a, b] into pieces of random length in [lo, hi]; a short tail merges into the last piece. */
export function cutSpan(a: number, b: number, lo: number, hi: number, rng: Rng): number[] {
  const cuts = [a];
  let at = a;
  while (b - at > hi) {
    at += range(rng, lo, hi);
    cuts.push(at);
  }
  if (b - at < lo && cuts.length > 1) cuts.pop();
  cuts.push(b);
  return cuts;
}

/** Heights snap to whole storeys so window rows line up with the roof. */
function storeyHeight(style: FacadeStyle, minH: number, maxH: number, rng: Rng): number {
  if (style === 'low') return range(rng, minH, maxH);
  const lo = Math.ceil((minH - GROUND_FLOOR_H) / FLOOR_H);
  const hi = Math.floor((maxH - GROUND_FLOOR_H) / FLOOR_H);
  const floors = lo + Math.floor(rng() * (hi - lo + 1));
  return GROUND_FLOOR_H + floors * FLOOR_H;
}

function stripLots(block: BlockDef, strip: Rect, side: Side, rng: Rng, out: Lot[]): void {
  const shape = STYLE_SHAPE[block.style];
  const [a, b] = alongX(side) ? [strip.x0, strip.x1] : [strip.z0, strip.z1];
  const cuts = cutSpan(a, b, shape.w[0], shape.w[1], rng);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const r = alongX(side) ? rect(cuts[i], cuts[i + 1], strip.z0, strip.z1) : rect(strip.x0, strip.x1, cuts[i], cuts[i + 1]);
    out.push({
      id: `${block.id}_${side}${i}`,
      rect: r,
      height: storeyHeight(block.style, block.minH, block.maxH, rng),
      front: side,
      style: block.style,
      seed: Math.floor(rng() * 0xffffff),
      grit: block.grit,
      backdrop: block.backdrop ?? false,
    });
  }
}

export function blockLots(block: BlockDef): Lot[] {
  const rng = mulberry32(hashString(block.id));
  const shape = STYLE_SHAPE[block.style];
  const lots: Lot[] = [];
  let rest = block.rect;
  for (const side of block.fronts) {
    if (width(rest) < 0.01 || depth(rest) < 0.01) break;
    const span = alongX(side) ? depth(rest) : width(rest);
    let d = Math.min(span, range(rng, shape.d[0], shape.d[1]));
    if (span - d < MIN_CORE) d = span;
    const [strip, remaining] = carve(rest, side, d);
    stripLots(block, strip, side, rng, lots);
    rest = remaining;
  }
  if (width(rest) > 0.01 && depth(rest) > 0.01) {
    const fronts = lots.filter((l) => l.front !== null);
    const avg = fronts.reduce((s, l) => s + l.height, 0) / Math.max(1, fronts.length);
    lots.push({
      id: `${block.id}_core`,
      rect: rest,
      height: Math.max(block.minH * 0.6, avg * 0.7),
      front: null,
      style: block.style,
      seed: Math.floor(rng() * 0xffffff),
      grit: block.grit,
      backdrop: block.backdrop ?? false,
    });
  }
  return lots;
}

/** Every lot in the city, in a stable order. */
export const LOTS: readonly Lot[] = BLOCKS.flatMap(blockLots);
