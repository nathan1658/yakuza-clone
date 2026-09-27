/**
 * The typhoon shelter: sea wall, pier and gangway, the crab boat, every
 * moored hull and the Gloucester Road flyover over the promenade path.
 * Boats go on the bobbing materials; everything that is walked on or next
 * to stays still.
 */
import { SEA_WALL } from '../data/colliders';
import { BOATS, BOAT_SIZE, CRAB_CANOPY } from '../data/harbour';
import type { Boat } from '../data/harbour';
import { FLYOVER, WALK, WATER } from '../data/layout';
import { mulberry32, pick, range } from '../data/rng';
import type { Rng } from '../data/rng';
import type { Batcher } from '../rendering/Batcher';
import type { LightSource } from '../rendering/LightRig';
import type { MatKey } from '../rendering/materials';
import type { MeshBuilder } from '../rendering/MeshBuilder';

const GRANITE = 0x77716a;
const COPING = 0x8e8980;
const ALGAE = 0x23261f;
const CONCRETE = 0x6a6862;
const PILE = 0x4e4a44;
const TIMBER = 0x5a4632;
const SODIUM = 0xffac5c;
const TUBE = 0xe8fff0;

/** [lz, half width, sheer height] from stern to bow, plus bottom depth and bottom width scale. */
interface HullForm {
  readonly stations: readonly (readonly [number, number, number])[];
  readonly bottom: number;
  readonly keel: number;
  readonly deck: number;
}

const SAMPAN: HullForm = {
  stations: [[-3.7, 0.75, 0.55], [-2.2, 1.05, 0.45], [0.6, 1.1, 0.45], [2.4, 0.8, 0.6], [3.7, 0.08, 0.95]],
  bottom: -0.35, keel: 0.55, deck: 0.25,
};
const JUNK: HullForm = {
  stations: [[-8.5, 2.0, 2.6], [-6.5, 2.4, 2.1], [0, 2.4, 1.5], [5.5, 1.8, 1.7], [8.5, 0.4, 2.4]],
  bottom: -0.9, keel: 0.5, deck: 1.2,
};
const YACHT: HullForm = {
  stations: [[-6, 1.6, 1.2], [-3, 1.8, 1.3], [2, 1.7, 1.45], [4.5, 1.1, 1.65], [6, 0.08, 1.9]],
  bottom: -0.6, keel: 0.45, deck: 1.1,
};

const SAMPAN_HULL = [0x5a4632, 0x3e4a3a, 0x6a5a48, 0x2e3a4a, 0x7a3a28] as const;
const CANVAS = [0x2c3848, 0x3a5040, 0x8a5028, 0x5a5a50, 0x6a2a24] as const;
const SAMPAN_ARCH: readonly (readonly [number, number])[] = [[-0.98, 0.3], [-0.9, 1.25], [-0.5, 1.7], [0.5, 1.7], [0.9, 1.25], [0.98, 0.3]];

/** Emits one boat in its own frame: +Z is the bow, y is height above the water. */
class Craft {
  private m!: MeshBuilder;
  private g!: MeshBuilder;
  private x = 0;
  private z = 0;
  private c = 1;
  private s = 0;

  constructor(private readonly batch: Batcher<MatKey>, readonly lights: LightSource[]) {}

  begin(b: Boat, amp: number): void {
    this.x = b.x;
    this.z = b.z;
    this.c = Math.cos(b.yaw);
    this.s = Math.sin(b.yaw);
    const phase = (b.seed % 628) / 100;
    this.m = this.batch.at('boat', b.x, b.z).data(b.x, b.z, phase, amp);
    this.g = this.batch.at('boatGlow', b.x, b.z).data(b.x, b.z, phase, amp);
  }

  private wx(lx: number, lz: number): number {
    return this.x + lx * this.c + lz * this.s;
  }

  private wz(lx: number, lz: number): number {
    return this.z - lx * this.s + lz * this.c;
  }

  /** Quad from four local corners [lx, y, lz]. */
  quad(hex: number, a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): void {
    const y = WATER.level;
    this.m.color(hex).quad(
      this.wx(a[0]!, a[2]!), y + a[1]!, this.wz(a[0]!, a[2]!),
      this.wx(b[0]!, b[2]!), y + b[1]!, this.wz(b[0]!, b[2]!),
      this.wx(c[0]!, c[2]!), y + c[1]!, this.wz(c[0]!, c[2]!),
      this.wx(d[0]!, d[2]!), y + d[1]!, this.wz(d[0]!, d[2]!),
    );
  }

  box(hex: number, lx: number, lz: number, y0: number, y1: number, hw: number, hd: number, glow = 1): void {
    const m = glow > 1 ? this.g : this.m;
    m.color(hex, glow).box(this.wx(lx, lz), WATER.level + (y0 + y1) / 2, this.wz(lx, lz), hw, (y1 - y0) / 2, hd, Math.atan2(this.s, this.c));
  }

  cyl(hex: number, lx: number, lz: number, y0: number, y1: number, r: number): void {
    this.m.color(hex).cylinder(this.wx(lx, lz), this.wz(lx, lz), WATER.level + y0, WATER.level + y1, r, 5);
  }

  light(lx: number, y: number, lz: number, color: number, intensity: number): void {
    this.lights.push({ x: this.wx(lx, lz), y: WATER.level + y, z: this.wz(lx, lz), color, intensity });
  }

  hull(f: HullForm, hex: number, deckHex: number): void {
    const st = f.stations;
    for (let i = 0; i + 1 < st.length; i++) {
      const [z0, w0, h0] = st[i]!;
      const [z1, w1, h1] = st[i + 1]!;
      for (const side of [1, -1]) {
        this.quad(hex, [side * w0 * f.keel, f.bottom, z0], [side * w1 * f.keel, f.bottom, z1], [side * w1, h1, z1], [side * w0, h0, z0]);
      }
      const d0 = Math.min(f.deck, h0) - 0.02;
      const d1 = Math.min(f.deck, h1) - 0.02;
      this.quad(deckHex, [-w0 * 0.94, d0, z0], [w0 * 0.94, d0, z0], [w1 * 0.94, d1, z1], [-w1 * 0.94, d1, z1]);
    }
    const [zs, ws, hs] = st[0]!;
    this.quad(hex, [-ws * f.keel, f.bottom, zs], [ws * f.keel, f.bottom, zs], [ws, hs, zs], [-ws, hs, zs]);
  }
}

function sampan(k: Craft, b: Boat, rng: Rng, lit: boolean): void {
  k.begin(b, 1);
  k.hull(SAMPAN, pick(rng, SAMPAN_HULL), 0x3a2c20);
  const canvas = pick(rng, CANVAS);
  const back = range(rng, -2.6, -2.2);
  const front = range(rng, 0.6, 1.1);
  for (let i = 0; i + 1 < SAMPAN_ARCH.length; i++) {
    const [x0, y0] = SAMPAN_ARCH[i]!;
    const [x1, y1] = SAMPAN_ARCH[i + 1]!;
    k.quad(canvas, [x0, y0, back], [x0, y0, front], [x1, y1, front], [x1, y1, back]);
  }
  // Stern sweep oar and whatever is stacked on the foredeck.
  k.box(0x4a3a2a, 0, -4.7, 0.5, 0.58, 0.04, 1.1);
  if (rng() < 0.7) k.box(pick(rng, [0x6a5a40, 0x2a5a8a, 0x8a3a2a]), range(rng, -0.4, 0.4), 1.9, 0.25, 0.25 + range(rng, 0.3, 0.6), 0.3, 0.3);
  if (b.lamp === null) return;
  k.box(b.lamp, 0, front - 0.15, 1.28, 1.52, 0.12, 0.12, 3);
  if (lit) k.light(0, 1.2, front, b.lamp, 18);
}

function junk(k: Craft, b: Boat, rng: Rng): void {
  k.begin(b, 0.4);
  k.hull(JUNK, 0x4a2c1a, 0x5a4230);
  k.box(0x5a3a24, 0, -2.5, 1.2, 3.0, 1.6, 1.5);
  k.box(0xffc070, 0, -2.5, 2.1, 2.45, 1.62, 1.2, 1.6);
  const sail = pick(rng, [0x7a2a18, 0x8a4a28, 0x6a2418]);
  for (const [lz, h, span] of [[4.5, 11, 4.2], [0.5, 15, 6], [-6.5, 8, 3.2]] as const) {
    k.cyl(0x2a1e14, 0, lz, 1.2, 1.2 + h, 0.12);
    const y0 = 2.6;
    const y1 = 1.2 + h - 0.6;
    k.quad(sail, [0, y0, lz + 0.6], [0, y0, lz - span], [0, y1 + 1.2, lz - span * 1.15], [0, y1, lz + 0.4]);
    k.box(0xfff0d0, 0, lz, 1.2 + h, 1.45 + h, 0.1, 0.1, 3);
  }
}

function yacht(k: Craft, b: Boat): void {
  k.begin(b, 0.6);
  k.hull(YACHT, 0xe8e8e4, 0x8a6a48);
  k.box(0xe8e8e4, 0, -0.8, 1.1, 2.2, 1.1, 2.2);
  if (b.lamp === null) k.box(0x1a2028, 0, -0.8, 1.6, 1.9, 1.12, 2.0);
  else k.box(b.lamp, 0, -0.8, 1.6, 1.9, 1.12, 2.0, 1.6);
  k.cyl(0xc8c8c8, 0, 1.5, 2.2, 15, 0.08);
  k.box(0xfff0d0, 0, 1.5, 15, 15.25, 0.08, 0.08, 3);
}

function boats(k: Craft): void {
  for (const b of BOATS) {
    const rng = mulberry32(b.seed);
    if (b.kind === 'sampan') sampan(k, b, rng, b.z > WATER.shoreZ - BOAT_SIZE.sampan.len - 8);
    else if (b.kind === 'junk') junk(k, b, rng);
    else yacht(k, b);
  }
}

function seaWall(b: Batcher<MatKey>): void {
  const z = SEA_WALL.z;
  const h = SEA_WALL.half;
  for (const [x0, x1] of SEA_WALL.runs) {
    const m = b.at('flat', (x0 + x1) / 2, z).data(0);
    m.color(GRANITE).aabb(x0, x1, WATER.level - 0.6, SEA_WALL.top - 0.1, z - h, z + h);
    m.color(COPING).aabb(x0, x1, SEA_WALL.top - 0.1, SEA_WALL.top + 0.03, z - h - 0.07, z + h + 0.07);
    m.color(ALGAE).aabb(x0, x1, WATER.level - 0.6, WATER.level + 0.55, z - h - 0.05, z - h);
  }
}

/** Deck fascia round the walkways over the water, and the pier's piles. */
function decks(b: Batcher<MatKey>): void {
  const fascia = (x0: number, z0: number, x1: number, z1: number): void => {
    b.at('flat', (x0 + x1) / 2, (z0 + z1) / 2).data(0).color(TIMBER).aabb(x0, x1, -0.35, 0.01, z0, z1);
  };
  const p = WALK.pier;
  fascia(p.x0 - 0.12, p.z0 - 0.12, p.x0, p.z1);
  fascia(p.x1, p.z0 - 0.12, p.x1 + 0.12, p.z1);
  fascia(p.x0, p.z0 - 0.12, p.x1, p.z0);
  const g = WALK.gangway;
  fascia(g.x0 - 0.1, g.z0, g.x0, g.z1);
  fascia(g.x1, g.z0, g.x1 + 0.1, g.z1);
  const m = b.at('flat', (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
  m.color(PILE);
  for (let z = p.z1 - 3; z > p.z0; z -= 3.5) {
    for (const x of [p.x0 + 0.2, p.x1 - 0.2]) m.cylinder(x, z, WATER.level - 1.2, -0.35, 0.18, 6);
  }
}

/** A moored barge: red hull, tarp roof on posts, lantern strings, two tubes. */
function crabBoat(b: Batcher<MatKey>, lights: LightSource[]): void {
  const d = WALK.crabDeck;
  const g = WALK.gangway;
  const cx = (d.x0 + d.x1) / 2;
  const cz = (d.z0 + d.z1) / 2;
  const m = b.at('flat', cx, cz).data(0);
  const low = WATER.level - 0.6;
  const t = 0.18;
  m.color(0x6a1c16);
  m.aabb(d.x0 - t, d.x1 + t, low, 0.3, d.z0 - t, d.z0);
  m.aabb(d.x0 - t, d.x0, low, 0.3, d.z0, d.z1 + t);
  m.aabb(d.x1, d.x1 + t, low, 0.3, d.z0, d.z1 + t);
  m.aabb(d.x0, g.x0, low, 0.3, d.z1, d.z1 + t);
  m.aabb(g.x1, d.x1, low, 0.3, d.z1, d.z1 + t);
  m.aabb(g.x0, g.x1, low, -0.02, d.z1, d.z1 + t);
  // A white band round the hull, just above the waterline.
  const e = t + 0.02;
  m.color(0xe8e2d4);
  m.aabb(d.x0 - e, d.x1 + e, -0.55, -0.4, d.z0 - e, d.z0 - t);
  m.aabb(d.x0 - e, d.x1 + e, -0.55, -0.4, d.z1 + t, d.z1 + e);
  m.aabb(d.x0 - e, d.x0 - t, -0.55, -0.4, d.z0 - t, d.z1 + t);
  m.aabb(d.x1 + t, d.x1 + e, -0.55, -0.4, d.z0 - t, d.z1 + t);
  // Canopy on posts along the railing lines.
  const i = CRAB_CANOPY.inset;
  const roof = CRAB_CANOPY.y;
  m.color(0x8a2a1c).box(cx, roof + CRAB_CANOPY.thickness / 2, cz, (d.x1 - d.x0) / 2 - i, CRAB_CANOPY.thickness / 2, (d.z1 - d.z0) / 2 - i, 0, true);
  m.color(0x3a3a3c);
  for (const x of [d.x0 + i, cx - 4.5, cx + 4.5, d.x1 - i]) {
    for (const z of [d.z0 + i, d.z1 - i]) m.cylinder(x, z, 0, roof, 0.07, 6);
  }
  const glow = b.at('glow', cx, cz).data(0);
  const lantern = [0xff3020, 0xff6a30] as const;
  let n = 0;
  const string = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0.75; s < len; s += 1.5, n++) {
      const x = x0 + ((x1 - x0) * s) / len;
      const z = z0 + ((z1 - z0) * s) / len;
      glow.color(lantern[n % 2]!, 3).box(x, roof - 0.25, z, 0.13, 0.16, 0.13);
    }
  };
  string(d.x0 + i, d.z0 + i, d.x1 - i, d.z0 + i);
  string(d.x0 + i, d.z1 - i, d.x1 - i, d.z1 - i);
  string(d.x0 + i, d.z0 + i, d.x0 + i, d.z1 - i);
  string(d.x1 - i, d.z0 + i, d.x1 - i, d.z1 - i);
  for (const x of [cx - 4.5, cx + 4.5]) {
    glow.color(TUBE, 4).box(x, roof - 0.06, cz, 0.6, 0.03, 0.04);
    lights.push({ x, y: roof - 0.4, z: cz, color: 0xfff0d8, intensity: 70 });
  }
}

/** Deck, parapets, hammerhead piers, lamps, and the tubes lighting the path underneath. */
function flyover(b: Batcher<MatKey>, lights: LightSource[]): void {
  const { z0, z1, deckY, thickness, x0, x1, pierX } = FLYOVER;
  const zc = (z0 + z1) / 2;
  const under = deckY - thickness;
  for (let x = x0; x < x1; x += 50) {
    const xe = Math.min(x + 50, x1);
    const m = b.at('flat', (x + xe) / 2, zc).data(0);
    m.color(CONCRETE).box((x + xe) / 2, (under + deckY) / 2, zc, (xe - x) / 2, thickness / 2, (z1 - z0) / 2, 0, true);
    m.color(0x7a7870);
    for (const z of [z0 + 0.2, z1 - 0.2]) m.box((x + xe) / 2, deckY + 0.55, z, (xe - x) / 2, 0.55, 0.2);
  }
  for (const x of pierX) {
    const m = b.at('flat', x, zc).data(0).color(0x5e5c56);
    m.box(x, (under - 1) / 2, zc, 0.8, (under - 1) / 2, 1.6);
    m.box(x, under - 0.5, zc, 0.9, 0.5, (z1 - z0) / 2 - 0.8);
  }
  for (let x = x0 + 18; x < x1; x += 36) {
    for (const z of [z0 + 0.2, z1 - 0.2]) {
      b.at('flat', x, z).data(0).color(0x4a4c4e).cylinder(x, z, deckY + 1.1, deckY + 6, 0.1, 5);
      const inward = z < zc ? 1 : -1;
      b.at('glow', x, z).data(0).color(SODIUM, 3).box(x, deckY + 5.95, z + inward * 0.9, 0.2, 0.06, 0.45);
    }
  }
  const path = WALK.path;
  const px = (path.x0 + path.x1) / 2;
  const glow = b.at('glow', px, zc).data(0);
  for (const dz of [-2.5, 2.5]) glow.color(TUBE, 4).box(px, under - 0.05, zc + dz, 1.2, 0.03, 0.05);
  lights.push({ x: px, y: under - 0.6, z: zc, color: TUBE, intensity: 45 });
}

/** Everything in the shelter; returns the lights worth pooling. */
export function buildHarbour(b: Batcher<MatKey>): LightSource[] {
  const lights: LightSource[] = [];
  seaWall(b);
  decks(b);
  crabBoat(b, lights);
  flyover(b, lights);
  boats(new Craft(b, lights));
  return lights;
}
