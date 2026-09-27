/**
 * The head: a sculpted ellipsoid (narrowing jaw, brow ridge, eye sockets,
 * cheekbones, muzzle, chin) plus eyes with lids, brows, nose, lips and ears.
 * Head.surf() is the one description of the skull that hair, caps, glasses
 * and headbands are built on, so they all sit on the same shape.
 */
import type { Look } from './body';
import {
  add, blend, cross, dot, KIND, luma, MeshBuilder, norm, paint, rigid, scale, smooth, sub, tint,
  type P, type Paint, type Ring, type V,
} from './MeshBuilder';

/** Skull radii and centre offset from the head joint (reference metres). */
const HEAD_R: P = [0.077, 0.114, 0.097];
const HEAD_C: P = [0, 0.105, 0.005];

interface Blob {
  c: P;
  s: P;
  a: number;
}

const frontZ = (x: number, y: number): number => HEAD_R[2] * Math.sqrt(Math.max(0, 1 - (x / HEAD_R[0]) ** 2 - (y / HEAD_R[1]) ** 2));

function pair(x: number, y: number, s: P, a: number, z = frontZ(x, y)): Blob[] {
  return [{ c: [x, y, z], s, a }, { c: [-x, y, z], s, a }];
}

function blobs(female: boolean): Blob[] {
  const k = female ? 0.55 : 1;
  return [
    ...pair(0.03, 0.03, [0.028, 0.011, 0.03], 0.0055 * k),
    { c: [0, 0.028, frontZ(0, 0.028)], s: [0.02, 0.01, 0.03], a: 0.003 * k },
    ...pair(0.033, 0.009, [0.017, 0.012, 0.022], -0.0105),
    ...pair(0.05, female ? -0.008 : -0.014, [0.02, 0.014, 0.03], female ? 0.0065 : 0.0055),
    ...pair(0.042, -0.048, [0.022, 0.022, 0.03], 0.002),
    { c: [0, -0.05, frontZ(0, -0.05)], s: [0.028, 0.022, 0.03], a: female ? 0.005 : 0.0065 },
    { c: [0, -0.092, frontZ(0, -0.092)], s: [0.017, 0.014, 0.03], a: female ? 0.005 : 0.008 },
    ...pair(0.066, 0.036, [0.02, 0.022, 0.03], -0.004),
    { c: [0, 0.012, frontZ(0, 0.012)], s: [0.008, 0.012, 0.02], a: 0.002 },
    ...pair(0.055, -0.07, [0.015, 0.02, 0.02], female ? 0.002 : 0.0045, -0.005),
  ];
}

const MALE = blobs(false);
const FEMALE = blobs(true);
const EYE_X = 0.033;
const EYE_Y = 0.009;
const EYE_R = 0.0118;
const EYE_WHITE = 0xefeae2;
const IRIS = 0x2b1c12;
const PUPIL = 0x050505;
const MOUTH = 0x3a1814;

export class Head {
  /** Skull centre in rig space (reference metres). */
  readonly c: V;
  readonly skin: Paint;
  private readonly blobs: readonly Blob[];

  constructor(private readonly b: MeshBuilder, private readonly look: Look) {
    this.c = b.at('head', HEAD_C[0], HEAD_C[1], HEAD_C[2]);
    this.blobs = look.female ? FEMALE : MALE;
    this.skin = paint(look.skinTone, KIND.skin, 0.52, 0, { colorAt: faceColor(this.c, look) });
  }

  /** Rig-space point on the skull at polar `th` (from +Y) and azimuth `ph` (0 front, PI/2 left), `grow` out along the normal. */
  surf(th: number, ph: number, grow = 0): V {
    return add(this.c, this.local(th, ph, grow));
  }

  normal(th: number, ph: number): V {
    const e = 1e-3;
    const dt = sub(this.local(th + e, ph, 0), this.local(th - e, ph, 0));
    const dp = sub(this.local(th, ph + e, 0), this.local(th, ph - e, 0));
    let n = norm(cross(dp, dt));
    const base = this.local(th, ph, 0);
    if (dot(n, base) < 0) n = scale(n, -1);
    // Degenerate at the poles: fall back to the radial direction.
    return Math.abs(Math.sin(th)) < 1e-2 ? norm(base) : n;
  }

  /** Point on the face at head-local (x, y), pushed `out` along the surface normal, with that normal. */
  face(x: number, y: number, out = 0): { p: V; n: V; th: number; ph: number } {
    const [rx, ry] = HEAD_R;
    let th = Math.acos(Math.min(0.99, Math.max(-0.99, y / ry)));
    let ph = Math.asin(Math.min(0.95, Math.max(-0.95, x / (rx * Math.sin(th)))));
    for (let i = 0; i < 6; i++) {
      const p = this.local(th, ph, 0);
      th += (p[1] - y) / (ry * Math.sin(th));
      ph += (x - p[0]) / (rx * Math.sin(th) * Math.max(0.2, Math.cos(ph)));
    }
    const n = this.normal(th, ph);
    return { p: add(this.surf(th, ph), scale(n, out)), n, th, ph };
  }

  build(): void {
    const b = this.b;
    const head = rigid('head');
    const ROWS = 36;
    const COLS = 48;
    const pts: V[][] = [];
    const hints: V[][] = [];
    for (let i = 0; i <= ROWS; i++) {
      const th = (Math.PI * i) / ROWS;
      const row: V[] = [];
      const hint: V[] = [];
      for (let k = 0; k < COLS; k++) {
        const ph = (Math.PI * 2 * k) / COLS;
        row.push(this.surf(th, ph));
        hint.push(this.local(th, ph, 0));
      }
      pts.push(row);
      hints.push(hint);
    }
    b.grid(pts, hints, head, this.skin);
    this.eyes();
    this.brows();
    this.nose();
    this.mouth();
    this.ears();
  }

  private local(th: number, ph: number, grow: number): V {
    const [rx, ry, rz] = HEAD_R;
    const st = Math.sin(th);
    let x = rx * st * Math.sin(ph);
    const y = ry * Math.cos(th);
    let z = rz * st * Math.cos(ph);
    const nb = norm([x / (rx * rx), y / (ry * ry), z / (rz * rz)]);
    // The lower face narrows to the chin; the back of the lower skull tucks into the neck.
    x *= 1 - (this.look.female ? 0.24 : 0.2) * smooth(-0.025, -0.11, y) ** 1.1;
    if (z < 0) z *= (1 - 0.42 * smooth(-0.02, -0.11, y)) * (1 + 0.05 * Math.exp(-(((y - 0.03) / 0.05) ** 2)));
    let d = grow;
    for (const bl of this.blobs) {
      const dx = (x - bl.c[0]) / bl.s[0];
      const dy = (y - bl.c[1]) / bl.s[1];
      const dz = (z - bl.c[2]) / bl.s[2];
      d += bl.a * Math.exp(-(dx * dx + dy * dy + dz * dz));
    }
    return [x + nb[0] * d, y + nb[1] * d, z + nb[2] * d];
  }

  private eyes(): void {
    const b = this.b;
    const head = rigid('head');
    const white = paint(EYE_WHITE, KIND.eye, 0.08);
    const iris = paint(IRIS, KIND.eye, 0.06);
    const pupil = paint(PUPIL, KIND.eye, 0.05);
    const lid = paint(this.look.skinTone, KIND.skin, 0.5);
    const up: P = [Math.PI / 2, 0, 0];
    for (const x of [EYE_X, -EYE_X]) {
      const f = this.face(x, EYE_Y);
      const e = sub(f.p, scale(f.n, 0.0072));
      b.ellipsoid(e, [EYE_R, EYE_R, EYE_R], head, white, { segs: 12 });
      b.ellipsoid(e, [EYE_R + 0.0003, EYE_R + 0.0003, EYE_R + 0.0003], head, iris, { segs: 12, polar: [0, 0.5], rot: up });
      b.ellipsoid(e, [EYE_R + 0.0006, EYE_R + 0.0006, EYE_R + 0.0006], head, pupil, { segs: 8, polar: [0, 0.22], rot: up });
      // Upper lid down to just above the pupil, with a dark lash line at its edge; lower lid under the iris.
      const r = EYE_R + 0.0011;
      const lash = this.look.female ? 0.18 : 0.3;
      b.ellipsoid(e, [r + 0.0004, r, r], head, lid, { segs: 14, polar: [0, 1.2], rot: [0.12, 0, 0], bright: (_p, n) => (norm(n)[1] < 0.42 ? lash : 1) });
      b.ellipsoid(e, [r, r, r], head, lid, { segs: 14, polar: [2.1, Math.PI - 2.1], rot: [0.1, 0, 0], bright: (_p, n) => (norm(n)[1] > -0.55 ? 0.8 : 1) });
    }
  }

  private brows(): void {
    const hair = this.look.hairColor;
    // Bleached or grey hair keeps darker brows.
    const color = luma(hair) > 0.45 ? blend(hair, 0x2a2018, 0.7) : hair;
    const brow = paint(blend(color, this.look.skinTone, 0.18), KIND.hair, 0.7);
    const f = this.look.female;
    const arc: readonly (readonly [number, number, number])[] = f
      ? [[0.012, 0.029, 0.0012], [0.025, 0.034, 0.0014], [0.04, 0.034, 0.0011], [0.052, 0.028, 0.0006]]
      : [[0.011, 0.028, 0.0018], [0.025, 0.032, 0.0021], [0.041, 0.032, 0.0018], [0.054, 0.026, 0.001]];
    for (const side of [1, -1]) {
      const rings: Ring[] = arc.map(([x, y, h]) => {
        const s = this.face(side * x, y, 0.0009);
        return { c: s.p, rx: h, rz: 0.0011, n: 3, f: s.n };
      });
      this.b.sweep(rings, { sides: 8, sub: 3, capStart: true, capEnd: true }, rigid('head'), brow);
    }
  }

  private nose(): void {
    const b = this.b;
    const head = rigid('head');
    const skin = paint(tint(this.look.skinTone, 1.02, 0.95, 0.93), KIND.skin, 0.45);
    const k = this.look.female ? 0.85 : 1;
    const ridge: [number, number, number, number][] = [
      [0.014, -0.001, 0.0055, 0.0035], [0.001, 0.005, 0.0056 * k, 0.0048], [-0.012, 0.0095, 0.0064 * k, 0.0062],
      [-0.019, 0.0112, 0.0079 * k, 0.0072], [-0.025, 0.0085, 0.0072 * k, 0.0056], [-0.028, 0.004, 0.0052 * k, 0.0035],
    ];
    const rings: Ring[] = ridge.map(([y, out, rx, rz]) => ({ c: this.face(0, y, out).p, rx, rz }));
    b.sweep(rings, { sides: 12, sub: 3, capEnd: true }, head, skin);
    for (const x of [1, -1]) {
      b.ellipsoid(this.face(x * 0.0094 * k, -0.0222, 0.001).p, [0.0048 * k, 0.0046, 0.0056], head, skin, { segs: 10 });
      const hole = paint(0x2a1210, KIND.skin, 0.6);
      b.ellipsoid(this.face(x * 0.0052 * k, -0.0268, 0.0042).p, [0.0026 * k, 0.0014, 0.0034], head, hole, { segs: 8 });
    }
  }

  private mouth(): void {
    const b = this.b;
    const head = rigid('head');
    const f = this.look.female;
    const lip = paint(blend(this.look.skinTone, f ? 0xa8404a : 0x96504a, f ? 0.45 : 0.3), KIND.skin, 0.4);
    const w = f ? 0.019 : 0.021;
    const line = (y: number, heights: readonly number[], out: number, pt: Paint, depth: number) => {
      const xs = [-1, -0.55, 0, 0.55, 1];
      const rings: Ring[] = xs.map((u, i) => {
        const s = this.face(u * w, y + Math.abs(u) * 0.0012, out);
        return { c: s.p, rx: depth, rz: heights[i], n: 2.2, f: [0, 1, 0] };
      });
      b.sweep(rings, { sides: 10, sub: 3, capStart: true, capEnd: true, side: [0, 0, 1] }, head, pt);
    };
    line(-0.0462, [0.001, 0.0027, 0.0032, 0.0027, 0.001], -0.0008, lip, 0.0026);
    line(-0.0552, [0.001, 0.0032, 0.0038, 0.0032, 0.001], -0.001, lip, 0.0032);
    line(-0.0506, [0.0006, 0.0008, 0.0008, 0.0008, 0.0006], 0.0012, paint(MOUTH, KIND.skin, 0.6), 0.0024);
  }

  private ears(): void {
    const b = this.b;
    const head = rigid('head');
    const skin = paint(tint(this.look.skinTone, 1.03, 0.92, 0.9), KIND.skin, 0.55);
    const inner = paint(tint(this.look.skinTone, 0.82, 0.7, 0.68), KIND.skin, 0.6);
    for (const side of [1, -1]) {
      const th = Math.PI / 2 + 0.04;
      const ph = side * (Math.PI / 2 + 0.13);
      const n = this.normal(th, ph);
      const c = this.surf(th, ph, 0.004);
      // The ear's face turns outward-forward, flaring away from the skull at the back.
      const rot: P = [-0.2, -side * 0.38, 0];
      b.ellipsoid(c, [0.0068, 0.0295, 0.0185], head, skin, { segs: 12, rot });
      b.ellipsoid(add(c, scale(n, 0.0042)), [0.0028, 0.018, 0.0105], head, inner, { segs: 10, rot });
      b.ellipsoid(add(c, [0, -0.027, 0.004]), [0.0055, 0.0075, 0.0065], head, skin, { segs: 8 });
    }
  }
}

/** Skin colour across the head: warm cheeks, faint shadows under the eyes, stubble shadow on men. */
function faceColor(c: P, look: Look): (p: P) => number {
  const skin = look.skinTone;
  const warm = tint(skin, 1.05, 0.84, 0.82);
  const stubble = tint(skin, 0.7, 0.72, 0.78);
  const under = tint(skin, 0.86, 0.8, 0.84);
  return (p) => {
    const x = Math.abs(p[0] - c[0]);
    const y = p[1] - c[1];
    const z = p[2] - c[2];
    const front = smooth(-0.01, 0.04, z);
    const g = (dx: number, dy: number) => Math.exp(-(dx * dx + dy * dy));
    let col = blend(skin, warm, 0.3 * front * g((x - 0.045) / 0.02, (y + 0.024) / 0.018));
    col = blend(col, under, 0.35 * front * g((x - 0.031) / 0.014, (y + 0.006) / 0.006));
    if (!look.female) {
      const jaw = smooth(-0.036, -0.06, y) * smooth(-0.03, 0.02, z);
      const lip = front * g(x / 0.02, (y + 0.04) / 0.005);
      col = blend(col, stubble, 0.12 * Math.max(jaw, lip));
    }
    return col;
  };
}
