/**
 * Street furniture: one table that both the collider list and the mesh
 * builders read, so what you bump into is exactly what you see.
 *
 * Sized items use local axes: `w` along local X, `d` along local Z, the
 * serving/open "front" faces local +Z and the item is rotated by `yaw`.
 */
import { CROSSINGS, HENNESSY, JUNCTION, ROADWORKS, TRAM_ISLANDS, WATER } from './layout';
import { centerX, centerZ, width } from './rect';

export type FurnitureKind =
  | 'lamp'
  | 'signalPole'
  | 'bin'
  | 'hydrant'
  | 'payphone'
  | 'stall'
  | 'stallClosed'
  | 'newsstand'
  | 'fishballCart'
  | 'hawkerCart'
  | 'counter'
  | 'cookStall'
  | 'tableSet'
  | 'bench'
  | 'planter'
  | 'taxi'
  | 'minibus'
  | 'barrier'
  | 'tramShelter';

export interface Furniture {
  readonly kind: FurnitureKind;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly w: number;
  readonly d: number;
  /** Per-item variation (stall goods, canopy colour, vehicle livery). */
  readonly variant: number;
}

/** Default footprint (w × d) and height for each kind; `h` feeds colliders and meshes alike. */
export const FURNITURE_SPEC: Record<FurnitureKind, { w: number; d: number; h: number; round?: boolean }> = {
  lamp: { w: 0.3, d: 0.3, h: 8, round: true },
  signalPole: { w: 0.24, d: 0.24, h: 3.6, round: true },
  bin: { w: 0.6, d: 0.6, h: 1, round: true },
  hydrant: { w: 0.4, d: 0.4, h: 0.7, round: true },
  payphone: { w: 0.9, d: 0.6, h: 2.1 },
  stall: { w: 4, d: 1.7, h: 2.3 },
  stallClosed: { w: 4, d: 1.7, h: 2.1 },
  newsstand: { w: 3, d: 1.6, h: 2.4 },
  fishballCart: { w: 1.8, d: 1.1, h: 1.1 },
  hawkerCart: { w: 1.8, d: 1, h: 1.1 },
  counter: { w: 1.5, d: 0.6, h: 1.05 },
  cookStall: { w: 8, d: 2.5, h: 2.4 },
  tableSet: { w: 1.8, d: 1.8, h: 0.78, round: true },
  bench: { w: 2, d: 0.5, h: 0.5 },
  planter: { w: 3, d: 3, h: 0.9 },
  taxi: { w: 1.75, d: 4.5, h: 1.5 },
  minibus: { w: 2.2, d: 7, h: 2.6 },
  barrier: { w: 1, d: 0.3, h: 1 },
  tramShelter: { w: 5, d: 0.2, h: 2.5 },
};

const HALF_PI = Math.PI / 2;

function item(kind: FurnitureKind, x: number, z: number, yaw = 0, w?: number, d?: number, variant = 0): Furniture {
  const spec = FURNITURE_SPEC[kind];
  return { kind, x, z, yaw, w: w ?? spec.w, d: d ?? spec.d, variant };
}

/** x positions every `step` in [a, b] that stay clear of the given spans. */
function spaced(a: number, b: number, step: number, avoid: ReadonlyArray<readonly [number, number]>): number[] {
  const out: number[] = [];
  for (let x = a; x <= b; x += step) if (!avoid.some(([lo, hi]) => x > lo && x < hi)) out.push(x);
  return out;
}

const crossingSpans = CROSSINGS.map((c) => [c.x0 - 1.5, c.x1 + 1.5] as const);
/** No street furniture inside the junction: it is the Sogo showdown's approach and the title orbit's foreground. */
const junctionSpan = [JUNCTION.x0 - 1, JUNCTION.x1 + 1] as const;

function hennessy(): Furniture[] {
  const out: Furniture[] = [];
  const avoid = [...crossingSpans, junctionSpan];
  for (const x of spaced(-146, 146, 22, avoid)) out.push(item('lamp', x, HENNESSY.northKerb - 0.6));
  for (const x of spaced(-135, 146, 22, avoid)) out.push(item('lamp', x, HENNESSY.southKerb + 0.6, Math.PI));
  for (const c of CROSSINGS) {
    for (const x of [c.x0 - 0.6, c.x1 + 0.6]) {
      out.push(item('signalPole', x, HENNESSY.northKerb - 0.45));
      out.push(item('signalPole', x, HENNESSY.southKerb + 0.45));
    }
  }
  for (const x of [JUNCTION.x0 - 0.5, JUNCTION.x1 + 0.5]) {
    out.push(item('signalPole', x, HENNESSY.northKerb - 0.45));
    out.push(item('signalPole', x, HENNESSY.southKerb + 0.45));
  }
  for (const x of [-130, -100, -40, 20, 125]) out.push(item('bin', x, 0.45));
  for (const x of [-135, -95, -50, 30, 130]) out.push(item('bin', x, 23.55));
  for (const x of [-110, -52, 36, 128]) out.push(item('hydrant', x, HENNESSY.northKerb - 0.75));
  out.push(item('newsstand', -30, 1.0, 0));
  out.push(item('payphone', 20, 23.4, Math.PI));
  out.push(item('payphone', 56, 23.4, Math.PI));
  out.push(item('hawkerCart', -118, 22.8, Math.PI));
  // A taxi rank and a minibus stop in the westbound kerb lane.
  out.push(item('taxi', -135, 18, -HALF_PI, undefined, undefined, 0));
  out.push(item('taxi', -40, 18, -HALF_PI, undefined, undefined, 1));
  out.push(item('minibus', 128, 17.8, -HALF_PI, undefined, undefined, 1));
  for (const isl of TRAM_ISLANDS) {
    const z = isl.track === 'N' ? isl.rect.z0 + 0.25 : isl.rect.z1 - 0.25;
    out.push(item('tramShelter', centerX(isl.rect), z, isl.track === 'N' ? 0 : Math.PI, Math.min(8, width(isl.rect) - 6)));
  }
  const r = ROADWORKS;
  out.push(item('barrier', centerX(r), r.z0 - 0.05, 0, width(r) + 0.3));
  out.push(item('barrier', centerX(r), r.z1 + 0.05, 0, width(r) + 0.3));
  out.push(item('barrier', r.x0 - 0.05, centerZ(r), HALF_PI, r.z1 - r.z0));
  out.push(item('barrier', r.x1 + 0.05, centerZ(r), HALF_PI, r.z1 - r.z0));
  return out;
}

/** Percy Street: hawker stalls on both pavements, shuttered ones in 東星's north end. */
function percy(): Furniture[] {
  const out: Furniture[] = [];
  const west: Array<[number, boolean]> = [[-14, false], [-26, false], [-48, false], [-76, false], [-98, true], [-116, true]];
  const east: Array<[number, boolean]> = [[-10, false], [-32, false], [-54, false], [-62, false], [-86, true], [-102, true]];
  west.forEach(([z, closed], i) => out.push(item(closed ? 'stallClosed' : 'stall', -71.15, z, HALF_PI, 4, 1.7, i)));
  east.forEach(([z, closed], i) => out.push(item(closed ? 'stallClosed' : 'stall', -56.85, z, -HALF_PI, 4, 1.7, i + 3)));
  // Kerbside lamps, staggered so each pavement gets its own pools of light.
  for (const z of [-8, -36, -58, -82, -106, -126]) out.push(item('lamp', -68.3, z, HALF_PI));
  for (const z of [-16, -44, -70, -94, -118]) out.push(item('lamp', -59.7, z, -HALF_PI));
  out.push(item('fishballCart', -58.6, -24, -HALF_PI));
  out.push(item('counter', -71.7, -39.25, HALF_PI, 1.5, 0.6));
  out.push(item('payphone', -56.5, -46, -HALF_PI));
  out.push(item('minibus', -66.9, -80.5, Math.PI, undefined, undefined, 0));
  out.push(item('taxi', -61.1, -69.75, Math.PI, undefined, undefined, 2));
  out.push(item('taxi', -61.1, -109.75, Math.PI, undefined, undefined, 3));
  for (const z of [-20, -66, -92, -122]) out.push(item('bin', -71.6, z - 0.5));
  return out;
}

/** The dai pai dong alley: cooking stall at the dead end, tables on the edges, open floor for the brawl. */
function alley(): Furniture[] {
  return [
    item('cookStall', -96.75, -60, HALF_PI, 8, 2.5, 0),
    item('tableSet', -92, -64.3),
    item('tableSet', -86.5, -64.3),
    item('tableSet', -93.5, -60),
    item('tableSet', -93.5, -55),
    item('bin', -78, -52.45),
    item('bin', -74.5, -52.45),
  ];
}

function lanes(): Furniture[] {
  return [
    item('bin', 8.45, 40),
    item('bin', 15.55, 52),
    item('bin', -23.55, -18),
    item('bin', -16.45, -34),
    item('lamp', 76.6, -12, HALF_PI),
    item('lamp', 87.4, -30, -HALF_PI),
    item('taxi', 84, -20, Math.PI, undefined, undefined, 4),
  ];
}

function typhoon(): Furniture[] {
  const out: Furniture[] = [];
  // Keep the pier/gangway mouths and the chapter-2 ambush stretch (x≈-45) open.
  const avoid = [[-60, -26], [16.8, 23.2]] as const;
  // Lamps stand in the parapet: a post 0.45 m off the wall is a snag nobody fits past.
  for (const x of spaced(-145, 55, 20, avoid)) out.push(item('lamp', x, WATER.shoreZ));
  for (const x of [-140, -120, -10, 10, 30, 50]) out.push(item('bench', x, -173.2, Math.PI));
  out.push(item('tableSet', -104, -157));
  out.push(item('tableSet', -94, -157));
  out.push(item('stall', -99, -151, Math.PI, 5, 2, 6));
  out.push(item('payphone', -80, -150.6, Math.PI));
  out.push(item('bin', -70, -150.45));
  out.push(item('bin', -20, -150.45));
  // Floating crab restaurant deck.
  out.push(item('counter', 20, -189.75, 0, 6, 1.5));
  for (const [x, z] of [[14.5, -186.5], [25.5, -186.5], [14.5, -192.5], [25.5, -192.5]]) out.push(item('tableSet', x, z));
  return out;
}

function sogo(): Furniture[] {
  return [
    item('cookStall', 49.75, 41, HALF_PI, 10, 3.5, 1),
    // The stall's own seating; the tables Crow flips are combat props around sogo_dai_pai_dong.
    item('tableSet', 55.5, 44),
    item('tableSet', 55.5, 38),
    item('planter', 58.5, 27.5),
    item('planter', 112.5, 27.5),
    item('lamp', 52.5, 25.5, Math.PI),
    item('lamp', 114, 25.5, Math.PI),
  ];
}

export const FURNITURE: readonly Furniture[] = [...hennessy(), ...percy(), ...alley(), ...lanes(), ...typhoon(), ...sogo()];

/** Straight railing runs (x0,z0)→(x1,z1). Each becomes one thin collider and one merged mesh strip. */
export interface Railing {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

const rail = (x0: number, z0: number, x1: number, z1: number): Railing => ({ x0, z0, x1, z1 });

function hennessyRails(): Railing[] {
  const n = HENNESSY.northKerb - 0.15;
  const s = HENNESSY.southKerb + 0.15;
  // Gaps: zebra crossings, Percy's carriageway mouth, the roadworks, the junction.
  const north: Array<[number, number]> = [[-149.5, -78], [-74, -68], [-60, -14], [-10, 28], [112, 149.5]];
  const south: Array<[number, number]> = [[-149.5, -78], [-74, -14], [-10, 48], [112, 149.5]];
  const out = [...north.map(([a, b]) => rail(a, n, b, n)), ...south.map(([a, b]) => rail(a, s, b, s))];
  for (const isl of TRAM_ISLANDS) {
    const z = isl.track === 'N' ? isl.rect.z0 + 0.05 : isl.rect.z1 - 0.05;
    out.push(rail(isl.rect.x0 + 0.5, z, isl.rect.x1 - 0.5, z));
  }
  return out;
}

function harbourRails(): Railing[] {
  return [
    // Pier
    rail(-33.9, -175, -33.9, -195.9),
    rail(-28.1, -175, -28.1, -195.9),
    rail(-33.9, -195.9, -28.1, -195.9),
    // Gangway
    rail(18.9, -175, 18.9, -183),
    rail(21.1, -175, 21.1, -183),
    // Crab boat deck (open at the gangway)
    rail(11.1, -183.1, 18.8, -183.1),
    rail(21.2, -183.1, 28.9, -183.1),
    rail(11.1, -183.1, 11.1, -194.9),
    rail(28.9, -183.1, 28.9, -194.9),
    rail(11.1, -194.9, 28.9, -194.9),
  ];
}

export const RAILINGS: readonly Railing[] = [...hennessyRails(), ...harbourRails()];
export const RAILING_HEIGHT = 1.05;
export const RAILING_THICKNESS = 0.08;
