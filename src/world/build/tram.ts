/**
 * Hennessy trams: the car model, built once in its own frame (data/trams
 * CAR) and shared by every car, and the overhead line, whose contact wires
 * and the arms carrying them off the kerbside lamp posts go in the batch.
 */
import type { BufferGeometry } from 'three';
import { FURNITURE } from '../data/furniture';
import type { Furniture } from '../data/furniture';
import { HENNESSY } from '../data/layout';
import { CAR } from '../data/trams';
import type { Batcher } from '../rendering/Batcher';
import type { MatKey } from '../rendering/materials';
import { MeshBuilder } from '../rendering/MeshBuilder';

const GREEN = 0x14553a;
const CREAM = 0xe8dfc4;
const ROOF = 0x8b8f90;
const DARK = 0x1b1d1f;
/** Saloon light, kept under the bloom threshold: lit windows, not lamps. */
const GLASS = 0xf3f1e2;
const HEADLAMP = 0xfff3d6;
const TAIL = 0xff2a1a;
const WIRE = 0x25272a;
const ARM = 0x2d3833;

/** Contact wire height; the trolley pole's shoe rides just under it. */
const WIRE_Y = 5.8;
const WIRE_R = 0.012;
const ARM_Y = 6.25;
/** Wire lengths, so each piece is culled with the batch cell it lies in. */
const SEG = 50;
/** Offsets off the body so paint and glass never fight it. */
const PAINT = 0.004;
const GLAZE = 0.008;
const LOWER_GLASS = [1.02, 1.88] as const;
const UPPER_GLASS = [2.86, 3.52] as const;
const SIDES = [1, -1] as const;

/** A panel on a flank, +1 right (+Z) or -1 left, from a to b along the car. */
function flank(m: MeshBuilder, side: 1 | -1, a: number, b: number, y0: number, y1: number, out: number): void {
  const z = side * (CAR.flank + out);
  if (side > 0) m.wall(a, z, b, z, y0, y1);
  else m.wall(b, z, a, z, y0, y1);
}

/** A panel on an end, +1 nose (+X) or -1 tail, from a to b across the car. */
function end(m: MeshBuilder, e: 1 | -1, a: number, b: number, y0: number, y1: number, out: number): void {
  const x = e * (CAR.end + out);
  if (e > 0) m.wall(x, b, x, a, y0, y1);
  else m.wall(x, a, x, b, y0, y1);
}

/** `n` panes between a and b with `gap` between neighbours. */
function panes(a: number, b: number, n: number, gap: number, pane: (a: number, b: number) => void): void {
  const step = (b - a) / n;
  for (let i = 0; i < n; i++) pane(a + i * step + gap / 2, a + (i + 1) * step - gap / 2);
}

/** Square rod of half-width r from A to B; B must not be straight above A. */
function rod(m: MeshBuilder, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): void {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const flat = Math.hypot(bx - ax, bz - az);
  const [dx, dy, dz] = [(bx - ax) / len, (by - ay) / len, (bz - az) / len];
  // u lies level across the rod, v = d × u; together they go round it.
  const ux = (-(bz - az) / flat) * r;
  const uz = ((bx - ax) / flat) * r;
  const [vx, vy, vz] = [dy * uz, dz * ux - dx * uz, -dy * ux];
  const ring = [
    [ux + vx, vy, uz + vz],
    [vx - ux, vy, vz - uz],
    [-ux - vx, -vy, -uz - vz],
    [ux - vx, -vy, uz - vz],
  ] as const;
  for (let k = 0; k < 4; k++) {
    const [px, py, pz] = ring[(k + 1) % 4]!;
    const [qx, qy, qz] = ring[k]!;
    m.quad(ax + px, ay + py, az + pz, bx + px, by + py, bz + pz, bx + qx, by + qy, bz + qz, ax + qx, ay + qy, az + qz);
  }
}

export interface TramModel {
  /** Paintwork, trucks, roof and trolley pole: lit, casts shadows. */
  readonly body: BufferGeometry;
  /** The lit saloons, headlamp and tail lamps. */
  readonly glow: BufferGeometry;
}

/** One car, nose along +X, rails at y = 0. */
export function buildTramModel(): TramModel {
  const { flank: W, end: L, skirt, roof } = CAR;
  const m = new MeshBuilder();
  m.color(GREEN).box(0, (skirt + roof) / 2, 0, L, (roof - skirt) / 2, W);
  m.color(CREAM);
  for (const [y0, y1] of [CAR.lowerBand, CAR.upperBand]) {
    for (const s of SIDES) flank(m, s, -L, L, y0, y1, PAINT);
    for (const e of SIDES) end(m, e, -W, W, y0, y1, PAINT);
  }
  // Folding doors on the left, the island side: in at the back, out at the front.
  m.color(DARK);
  for (const x of [-4.75, 4.75]) flank(m, -1, x - 0.5, x + 0.5, 0.42, 1.9, GLAZE);
  m.color(ROOF).box(0, roof + 0.07, 0, L - 0.2, 0.07, W - 0.12);
  m.color(DARK);
  for (const x of [-3.3, 3.3]) m.box(x, 0.2, 0, 0.95, 0.12, W - 0.2);
  for (const e of SIDES) m.box(e * (L + 0.1), 0.3, 0, 0.1, 0.05, W - 0.15);
  // The trolley pole trails back from its base to the wire.
  m.box(-1.3, roof + 0.2, 0, 0.3, 0.06, 0.22);
  rod(m, -1.3, roof + 0.24, 0, -4.4, WIRE_Y - 0.03, 0, 0.03);

  const g = new MeshBuilder();
  const [l0, l1] = LOWER_GLASS;
  const [u0, u1] = UPPER_GLASS;
  g.color(GLASS, 0.8);
  panes(-5.4, 5.4, 8, 0.16, (a, b) => flank(g, 1, a, b, l0, l1, GLAZE));
  panes(-4.15, 4.15, 6, 0.16, (a, b) => flank(g, -1, a, b, l0, l1, GLAZE));
  for (const e of SIDES) panes(-0.85, 0.85, 2, 0.12, (a, b) => end(g, e, a, b, l0 + 0.08, l1, GLAZE));
  g.color(GLASS, 0.7);
  for (const s of SIDES) panes(-5.4, 5.4, 9, 0.16, (a, b) => flank(g, s, a, b, u0, u1, GLAZE));
  for (const e of SIDES) panes(-0.85, 0.85, 3, 0.12, (a, b) => end(g, e, a, b, u0, u1, GLAZE));
  g.color(HEADLAMP, 3.5).box(L + 0.04, 0.72, 0, 0.03, 0.09, 0.14);
  g.color(TAIL, 2.5);
  for (const z of [-0.72, 0.72]) g.box(-L - 0.04, 0.72, z, 0.03, 0.06, 0.08);
  return { body: m.build(), glow: g.build() };
}

/** The contact wire a kerbside Hennessy lamp post carries an arm to, if any. */
function wireFor(f: Furniture): number | null {
  if (f.kind !== 'lamp') return null;
  if (f.z > HENNESSY.northKerb - 1 && f.z < HENNESSY.northKerb) return HENNESSY.trackN;
  if (f.z > HENNESSY.southKerb && f.z < HENNESSY.southKerb + 1) return HENNESSY.trackS;
  return null;
}

/** A contact wire over each track, hung from arms off the kerbside lamp posts. */
export function buildOverhead(b: Batcher<MatKey>): void {
  for (const z of [HENNESSY.trackN, HENNESSY.trackS]) {
    for (let x = -HENNESSY.farX + SEG / 2; x < HENNESSY.farX; x += SEG) {
      b.at('flat', x, z).color(WIRE).box(x, WIRE_Y, z, SEG / 2, WIRE_R, WIRE_R, 0, true);
    }
  }
  for (const f of FURNITURE) {
    const wire = wireFor(f);
    if (wire === null) continue;
    const tip = wire + Math.sign(wire - f.z) * 0.3;
    const m = b.at('flat', f.x, f.z).color(ARM);
    m.box(f.x, ARM_Y, (f.z + tip) / 2, 0.035, 0.035, Math.abs(tip - f.z) / 2, 0, true);
    rod(m, f.x, ARM_Y + 1.1, f.z, f.x, ARM_Y + 0.03, (f.z + wire) / 2, 0.015);
    m.box(f.x, (WIRE_Y + ARM_Y) / 2, wire, 0.012, (ARM_Y - WIRE_Y) / 2, 0.012);
  }
}
