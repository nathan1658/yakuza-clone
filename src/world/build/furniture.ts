import { FURNITURE, RAILINGS, RAILING_HEIGHT, RAILING_THICKNESS } from '../data/furniture';
import type { Furniture, FurnitureKind } from '../data/furniture';
import { zoneAt } from '../data/zones';
import type { Batcher } from '../rendering/Batcher';
import type { LightSource } from '../rendering/LightRig';
import type { MatKey } from '../rendering/materials';
import type { MeshBuilder } from '../rendering/MeshBuilder';

const SODIUM = 0xffac5c;
const MERCURY = 0xe0e8ff;
const WARM = 0xffc890;
const TUBE = 0xe8fff0;

const STEEL_GREEN = 0x3c5a48;
const CANVAS = [0xa8302a, 0x2a5a8a, 0xc88a2a, 0x3a7a4a, 0xb8b0a0, 0x8a3a6a, 0x2a6a6a];
const GOODS = [0xc84a3a, 0x3a6ab8, 0xe0c040, 0xe8e8e0, 0x4a9a5a, 0xd87aa0, 0x2a2a2a, 0xe08a30];

/**
 * Local-space kit for one item: front is local +Z, `w` runs along local X.
 * Parts land in the batch cells of the item itself.
 */
class Kit {
  flat!: MeshBuilder;
  glow!: MeshBuilder;
  f!: Furniture;
  private c = 1;
  private s = 0;

  constructor(private readonly batch: Batcher<MatKey>, readonly lights: LightSource[]) {}

  begin(f: Furniture): void {
    this.f = f;
    this.c = Math.cos(f.yaw);
    this.s = Math.sin(f.yaw);
    this.flat = this.batch.at('flat', f.x, f.z).data(0);
    this.glow = this.batch.at('glow', f.x, f.z).data(0);
  }

  x(lx: number, lz: number): number {
    return this.f.x + lx * this.c + lz * this.s;
  }

  z(lx: number, lz: number): number {
    return this.f.z - lx * this.s + lz * this.c;
  }

  /** Box from y0 to y1 centred at local (lx, lz) with half width/depth. */
  box(m: MeshBuilder, hex: number, lx: number, lz: number, y0: number, y1: number, hw: number, hd: number, scale = 1, bottom = false): void {
    m.color(hex, scale).box(this.x(lx, lz), (y0 + y1) / 2, this.z(lx, lz), hw, (y1 - y0) / 2, hd, this.f.yaw, bottom);
  }

  cyl(hex: number, lx: number, lz: number, y0: number, y1: number, r: number, segments = 6): void {
    this.flat.color(hex).cylinder(this.x(lx, lz), this.z(lx, lz), y0, y1, r, segments);
  }

  light(lx: number, y: number, lz: number, color: number, intensity: number): void {
    this.lights.push({ x: this.x(lx, lz), y, z: this.z(lx, lz), color, intensity });
  }
}

type Maker = (k: Kit, f: Furniture) => void;

function wheels(k: Kit, hw: number, hd: number): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(k.flat, 0x141414, sx * hw, sz * hd, 0, 0.55, 0.13, 0.3);
}

function lights(k: Kit, hw: number, hd: number, y: number): void {
  for (const sx of [-1, 1]) {
    k.box(k.glow, 0xfff4e0, sx * hw, hd + 0.01, y, y + 0.12, 0.14, 0.01, 4);
    k.box(k.glow, 0xff2010, sx * hw, -hd - 0.01, y, y + 0.12, 0.12, 0.01, 1.5);
  }
}

const MAKERS: Readonly<Record<FurnitureKind, Maker>> = {
  lamp(k, f) {
    const hex = zoneAt(f.x, f.z) === 'sogo' ? MERCURY : SODIUM;
    k.cyl(0x5a5e62, 0, 0, 0, 7.9, 0.1);
    k.box(k.flat, 0x5a5e62, 0, 0.8, 7.78, 7.88, 0.05, 0.8);
    k.box(k.flat, 0x34363a, 0, 1.6, 7.62, 7.9, 0.2, 0.38);
    k.box(k.glow, hex, 0, 1.6, 7.56, 7.62, 0.15, 0.3, 6, true);
    k.light(0, 7.3, 1.6, hex, 160);
  },
  signalPole(k) {
    k.cyl(0x4a4c50, 0, 0, 0, 3.6, 0.08);
    k.box(k.flat, 0x1e2022, 0, 0, 2.3, 3.2, 0.17, 0.14);
    for (const side of [-1, 1]) {
      k.box(k.glow, 0xff3018, 0, side * 0.145, 2.8, 3.1, 0.11, 0.006, 3);
      k.box(k.flat, 0x103018, 0, side * 0.145, 2.4, 2.7, 0.11, 0.006);
    }
  },
  bin(k) {
    k.cyl(0x2f5a3a, 0, 0, 0, 0.95, 0.3, 8);
    k.cyl(0x1c2a20, 0, 0, 0.95, 1.0, 0.31, 8);
  },
  hydrant(k) {
    k.cyl(0xa0281e, 0, 0, 0, 0.55, 0.15, 8);
    k.cyl(0xc8a030, 0, 0, 0.55, 0.7, 0.11, 8);
    k.box(k.flat, 0xa0281e, 0, 0, 0.3, 0.42, 0.24, 0.05);
  },
  payphone(k) {
    k.box(k.flat, 0x8a8d90, 0, 0, 0, 1.9, 0.45, 0.3);
    k.box(k.flat, 0xd0621c, 0, 0.05, 1.9, 2.1, 0.5, 0.36);
    k.box(k.flat, 0x1c1e20, 0, 0.3, 1.0, 1.6, 0.3, 0.012);
    k.box(k.glow, 0xffe6c0, 0, 0.41, 1.93, 2.07, 0.36, 0.01, 1.6);
    k.light(0, 1.8, 0.6, 0xfff0dc, 12);
  },
  stall(k, f) {
    const hw = f.w / 2;
    k.box(k.flat, STEEL_GREEN, 0, 0, 0, 0.95, hw, f.d / 2);
    k.box(k.flat, 0x6a5a48, 0, 0.05, 0.95, 1.0, hw + 0.05, f.d / 2);
    for (let i = 0; i < 5; i++) {
      const top = 1.12 + ((f.variant * 7 + i * 3) % 4) * 0.06;
      k.box(k.flat, GOODS[(f.variant + i * 3) % GOODS.length], -hw + 0.4 + i * (f.w - 0.8) / 4, 0.25, 1.0, top, 0.32, 0.3);
    }
    k.box(k.flat, STEEL_GREEN, 0, -f.d / 2 + 0.1, 1.0, 2.2, hw, 0.08);
    for (let i = 0; i < 4; i++) {
      k.box(k.flat, GOODS[(f.variant * 2 + i) % GOODS.length], -hw + 0.5 + i * (f.w - 1) / 3, -f.d / 2 + 0.2, 1.3, 2.05, 0.35, 0.03);
    }
    k.box(k.flat, CANVAS[f.variant % CANVAS.length], 0, 0.15, 2.2, 2.3, hw + 0.15, f.d / 2 + 0.3);
    k.box(k.glow, 0xffd8a0, 0, f.d / 2, 2.14, 2.2, hw - 0.2, 0.02, 5, true);
    k.light(0, 2.0, f.d / 2 + 0.3, WARM, 50);
  },
  stallClosed(k, f) {
    k.box(k.flat, STEEL_GREEN, 0, 0, 0, 2.0, f.w / 2, f.d / 2);
    k.box(k.flat, 0x2e4538, 0, 0, 2.0, 2.1, f.w / 2 + 0.05, f.d / 2 + 0.05);
  },
  newsstand(k, f) {
    k.box(k.flat, 0x5a4a3a, 0, -0.2, 0, 2.1, f.w / 2, f.d / 2 - 0.2);
    k.box(k.flat, 0x2c4a6a, 0, 0.1, 2.1, 2.4, f.w / 2 + 0.1, f.d / 2 + 0.1);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 6; i++) {
        const y = 0.9 + row * 0.38;
        k.box(k.flat, GOODS[(row * 5 + i * 3) % GOODS.length], -1.2 + i * 0.48, f.d / 2 - 0.39, y, y + 0.3, 0.2, 0.012);
      }
    }
    k.box(k.glow, 0xfff4e0, 0, f.d / 2, 2.05, 2.1, f.w / 2 - 0.1, 0.03, 3, true);
    k.light(0, 2.0, f.d / 2 + 0.5, 0xfff0dc, 40);
  },
  fishballCart(k) {
    k.box(k.flat, 0xa8aeb2, 0, 0, 0.3, 0.95, 0.9, 0.55);
    for (const sx of [-1, 1]) k.box(k.flat, 0x141414, sx * 0.92, 0, 0, 0.5, 0.04, 0.25);
    k.cyl(0xc0c4c8, -0.4, 0, 0.95, 1.2, 0.26, 8);
    k.cyl(0xc0c4c8, 0.35, 0, 0.95, 1.15, 0.22, 8);
    k.cyl(0x606060, 0.8, -0.4, 0.95, 2.2, 0.025, 4);
    k.box(k.glow, 0xffc880, 0.8, -0.4, 2.1, 2.2, 0.06, 0.06, 8, true);
    k.light(0.8, 2.0, -0.4, WARM, 35);
  },
  hawkerCart(k) {
    k.box(k.flat, 0x6a4a2a, 0, 0, 0.3, 0.95, 0.9, 0.5);
    for (const sx of [-1, 1]) k.box(k.flat, 0x141414, sx * 0.92, 0, 0, 0.5, 0.04, 0.25);
    for (let i = 0; i < 4; i++) k.box(k.flat, GOODS[(i * 5 + 1) % GOODS.length], -0.6 + i * 0.4, 0, 0.95, 1.1, 0.16, 0.35);
    k.box(k.glow, 0xffc880, 0.7, -0.35, 1.9, 2.0, 0.06, 0.06, 8, true);
    k.cyl(0x606060, 0.7, -0.35, 0.95, 1.95, 0.025, 4);
    k.light(0.7, 1.8, -0.35, WARM, 25);
  },
  counter(k, f) {
    k.box(k.flat, 0x8a3a28, 0, 0, 0, 0.92, f.w / 2, f.d / 2);
    k.box(k.glow, 0xfff0d0, 0, 0, 0.92, 1.05, f.w / 2 - 0.03, f.d / 2 - 0.02, 1.2);
    k.light(0, 2.2, f.d / 2 + 0.6, WARM, 30);
  },
  cookStall(k, f) {
    const hw = f.w / 2;
    const hd = f.d / 2;
    k.box(k.flat, STEEL_GREEN, 0, -hd + 0.5, 0, 1.0, hw, 0.5);
    k.box(k.flat, STEEL_GREEN, 0, -hd + 0.05, 1.0, 2.3, hw, 0.05);
    k.cyl(0x1a1a1a, -hw + 1.2, -hd + 0.5, 1.0, 1.15, 0.3, 8);
    k.cyl(0x1a1a1a, -hw + 2.2, -hd + 0.5, 1.0, 1.15, 0.3, 8);
    k.box(k.flat, 0x2e6a4a, 0, 0.2, 2.3, 2.4, hw + 0.2, hd + 0.3);
    for (const sx of [-1, 1]) k.cyl(0x505458, sx * (hw - 0.05), hd - 0.05, 0, 2.3, 0.04, 4);
    for (const sx of [-1, 1]) k.box(k.glow, TUBE, sx * hw * 0.5, 0.4, 2.22, 2.27, 0.6, 0.03, 6, true);
    k.light(0, 2.1, 0.6, TUBE, 90);
  },
  tableSet(k) {
    k.cyl(0x4a4a4a, 0, 0, 0, 0.72, 0.04, 4);
    k.cyl(0x8a7258, 0, 0, 0.72, 0.76, 0.5, 10);
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) k.cyl(0xb02a24, sx * 0.72, sz * 0.72, 0, 0.45, 0.16, 6);
  },
  bench(k, f) {
    k.box(k.flat, 0x6a4a30, 0, 0, 0.42, 0.5, f.w / 2, f.d / 2);
    for (const sx of [-1, 1]) k.box(k.flat, 0x3a3a3a, sx * (f.w / 2 - 0.15), 0, 0, 0.42, 0.04, f.d / 2 - 0.05);
  },
  planter(k, f) {
    k.box(k.flat, 0x8a867e, 0, 0, 0, 0.9, f.w / 2, f.d / 2);
    k.box(k.flat, 0x2a4a2a, 0, 0, 0.9, 1.5, f.w / 2 - 0.25, f.d / 2 - 0.25);
  },
  taxi(k, f) {
    const hw = f.w / 2;
    const hd = f.d / 2;
    k.box(k.flat, 0xb01818, 0, 0, 0.3, 0.95, hw, hd);
    k.box(k.flat, 0x22262c, 0, -0.15, 0.95, 1.4, hw - 0.07, 1.15);
    k.box(k.flat, 0xc8c8c8, 0, -0.15, 1.4, 1.46, hw - 0.1, 1.1);
    k.box(k.glow, 0xfff2c0, 0, 0.1, 1.46, 1.6, 0.25, 0.1, 3);
    wheels(k, hw - 0.1, hd - 0.8);
    lights(k, hw - 0.25, hd, 0.62);
  },
  minibus(k, f) {
    const hw = f.w / 2;
    const hd = f.d / 2;
    k.box(k.flat, 0xe6dfc6, 0, 0, 0.35, 1.3, hw, hd);
    k.box(k.flat, 0x22262c, 0, 0, 1.3, 2.2, hw - 0.02, hd - 0.05);
    k.box(k.flat, f.variant === 1 ? 0x1a7a3a : 0xb02020, 0, 0, 2.2, 2.6, hw, hd);
    k.box(k.glow, 0xffa040, 0, hd + 0.005, 2.28, 2.5, 0.6, 0.005, 3);
    wheels(k, hw - 0.12, hd - 1.2);
    lights(k, hw - 0.3, hd, 0.7);
  },
  barrier(k, f) {
    const n = Math.max(1, Math.round(f.w));
    const seg = f.w / n;
    for (let i = 0; i < n; i++) {
      k.box(k.flat, i % 2 ? 0xd8d8d0 : 0xc02020, -f.w / 2 + seg * (i + 0.5), 0, 0.1, 1.0, seg / 2, f.d / 2);
    }
  },
  tramShelter(k, f) {
    const hw = f.w / 2;
    k.box(k.flat, 0x3a4a52, 0, 0, 0.3, 2.3, hw, 0.05);
    for (const sx of [-1, 1]) k.cyl(0x606468, sx * (hw - 0.1), 0, 0, 2.5, 0.05);
    k.box(k.flat, 0x2a5a3a, 0, 0.5, 2.4, 2.55, hw + 0.1, 0.7);
    k.box(k.glow, 0xf0e8d8, hw - 0.8, 0.06, 0.6, 2.0, 0.6, 0.01, 2);
    k.box(k.flat, 0x707070, 0, 0.3, 0.45, 0.5, hw - 0.6, 0.15);
  },
};

function railings(b: Batcher<MatKey>): void {
  const t = RAILING_THICKNESS / 2;
  for (const r of RAILINGS) {
    const dx = r.x1 - r.x0;
    const dz = r.z1 - r.z0;
    const len = Math.hypot(dx, dz);
    const rot = Math.atan2(-dz, dx);
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const m = b.at('flat', cx, cz).color(0x7a8284).data(0);
    m.box(cx, RAILING_HEIGHT - 0.03, cz, len / 2, 0.03, t, rot);
    m.box(cx, 0.5, cz, len / 2, 0.02, t * 0.6, rot);
    const posts = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= posts; i++) {
      const u = i / posts;
      m.box(r.x0 + dx * u, RAILING_HEIGHT / 2, r.z0 + dz * u, t, RAILING_HEIGHT / 2, t, rot);
    }
  }
}

/** Every furniture item and railing as merged static meshes; returns the light sources they carry. */
export function buildFurniture(b: Batcher<MatKey>): LightSource[] {
  const kit = new Kit(b, []);
  for (const f of FURNITURE) {
    kit.begin(f);
    MAKERS[f.kind](kit, f);
  }
  railings(b);
  return kit.lights;
}
