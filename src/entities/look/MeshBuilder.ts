/**
 * Accumulates smooth, skinned surfaces into one BufferGeometry. Everything is
 * authored in reference metres (a REF_HEIGHT body) and scaled on write, so a
 * look is modelled once for every height. Vertices carry up to four bone
 * influences, so limbs bend as one continuous skin instead of stacked parts.
 *
 * The workhorse is sweep(): a closed cross-section (superellipse with angular
 * bumps, or an open-front "band" with thickness) carried along a path of
 * rings, Catmull-Rom smoothed, optionally domed at the ends. Normals come
 * from the finished grid, oriented by the cross-section, so any surface the
 * sweep can describe shades smoothly without hand-written normals.
 */
import { BufferGeometry, Color, Float32BufferAttribute, Uint16BufferAttribute, Uint32BufferAttribute } from 'three';
import type { BoneName } from '../../core/types';
import { bindPosition, boneIndex, REF_HEIGHT, type Proportions } from '../rig/skeleton';

export type P = readonly [number, number, number];
export type V = [number, number, number];

/** [bone, weight] pairs; weights are normalised on write. */
export type Skin = readonly (readonly [BoneName, number])[];
export type SkinFn = (p: P) => Skin;

/** Surface kinds the character shader knows (see rig/materials.ts). */
export const KIND = {
  plain: 0, skin: 1, knit: 2, woven: 3, denim: 4, leather: 5, hair: 6, floral: 7,
  wool: 8, rubber: 9, metal: 10, glass: 11, eye: 12, tattoo: 13,
} as const;

export interface Paint {
  /** sRGB hex. */
  readonly color: number;
  readonly rough: number;
  readonly metal: number;
  readonly kind: number;
  /** Pattern colour (sRGB hex): print, ink. */
  readonly accent?: number;
  /** Self-illumination, emissive = albedo × glow. */
  readonly glow?: number;
  /** Per-vertex colour override (reference-space position → sRGB hex). */
  readonly colorAt?: (p: P) => number;
}

export interface Bump {
  /** Centre angle: 0 = front (+f), PI/2 = side (+s). */
  readonly a: number;
  /** Angular width (radians, Gaussian sigma-ish). */
  readonly w: number;
}

export interface Ring {
  c: P;
  rx: number;
  rz: number;
  /** Superellipse exponent: 2 ellipse, higher is boxier. */
  n?: number;
  /** Relative radius bump per SweepOpts.bumps entry. */
  h?: readonly number[];
  /** Front reference direction for this ring. */
  f?: P;
  /** Band shape: open front angle and wall thickness. */
  gap?: number;
  thick?: number;
}

export interface SweepOpts {
  /** Points around the cross-section (per arc for bands). */
  sides: number;
  bumps?: readonly Bump[];
  /** Front / side reference directions (default +Z / +X). */
  front?: P;
  side?: P;
  /** Catmull-Rom rings per span (1 = rings as given). */
  sub?: number;
  capStart?: boolean;
  capEnd?: boolean;
  /** How far a cap domes out, as a fraction of the end ring's smaller radius (default 0.9). */
  dome?: number;
  /** 'band': open-front slab (Ring.gap, Ring.thick) instead of a closed tube. */
  shape?: 'ring' | 'band';
  /** Band only: where the opening is centred (0 front, PI back). */
  phase?: number;
  /** Per-vertex brightness multiplier from reference position and ring parameter u (0..1). */
  shade?: (p: P, u: number, k: number) => number;
  /** Per-vertex accent override (hair strand direction). */
  accent?: (p: P, t: P) => P;
}

const _c = new Color();
const TAU = Math.PI * 2;

export const add = (a: P, b: P): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: P, b: P): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: P, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: P, b: P): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: P): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: P): V => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mix = (a: P, b: P, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Scale a colour's brightness. */
export function shade(hex: number, f: number): number {
  const c = (s: number) => Math.min(255, Math.round(((hex >> s) & 255) * f));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** Scale each channel of a colour. */
export function tint(hex: number, r: number, g: number, b: number): number {
  const c = (s: number, f: number) => Math.min(255, Math.round(((hex >> s) & 255) * f));
  return (c(16, r) << 16) | (c(8, g) << 8) | c(0, b);
}

/** Perceived brightness 0..1 of an sRGB hex colour. */
export function luma(hex: number): number {
  return (0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255)) / 255;
}

/** Blend two sRGB hex colours. */
export function blend(a: number, b: number, t: number): number {
  const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

export function paint(color: number, kind: number, rough: number, metal = 0, extra: Partial<Paint> = {}): Paint {
  return { color, kind, rough, metal, ...extra };
}

/** Rigid binding to one bone. */
export const rigid = (bone: BoneName): SkinFn => {
  const skin: Skin = [[bone, 1]];
  return () => skin;
};

function wrapAngle(a: number): number {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

/** Superellipse point at angle th (0 = front) with angular bumps, in the ring's (side, front) plane. */
export function ringPoint(r: Ring, th: number, bumps: readonly Bump[] | undefined, grow = 0): [number, number] {
  const n = r.n ?? 2;
  const s = Math.sin(th);
  const c = Math.cos(th);
  const e = 2 / n;
  let x = (r.rx + grow) * Math.sign(s) * Math.abs(s) ** e;
  let z = (r.rz + grow) * Math.sign(c) * Math.abs(c) ** e;
  if (bumps && r.h) {
    let m = 1;
    for (let i = 0; i < bumps.length; i++) {
      const d = wrapAngle(th - bumps[i].a) / bumps[i].w;
      m += (r.h[i] ?? 0) * Math.exp(-d * d);
    }
    x *= m;
    z *= m;
  }
  return [x, z];
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function lerpRing(a: Ring, b: Ring, t: number): Ring {
  return {
    c: mix(a.c, b.c, t), rx: lerp(a.rx, b.rx, t), rz: lerp(a.rz, b.rz, t), n: lerp(a.n ?? 2, b.n ?? 2, t),
    h: a.h && b.h ? a.h.map((v, i) => lerp(v, b.h![i] ?? 0, t)) : a.h ?? b.h,
    f: a.f && b.f ? norm(mix(a.f, b.f, t)) : a.f ?? b.f,
    gap: a.gap !== undefined && b.gap !== undefined ? lerp(a.gap, b.gap, t) : a.gap ?? b.gap,
    thick: a.thick !== undefined && b.thick !== undefined ? lerp(a.thick, b.thick, t) : a.thick ?? b.thick,
  };
}

/** Catmull-Rom through ring centres; ring sizes follow the same spline (clamped positive). */
function subdivide(rings: readonly Ring[], sub: number): Ring[] {
  if (sub <= 1 || rings.length < 2) return [...rings];
  const out: Ring[] = [];
  const last = rings.length - 1;
  for (let i = 0; i < last; i++) {
    const r0 = rings[Math.max(0, i - 1)];
    const r1 = rings[i];
    const r2 = rings[i + 1];
    const r3 = rings[Math.min(last, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const r = lerpRing(r1, r2, t);
      r.c = [0, 1, 2].map((a) => catmull(r0.c[a], r1.c[a], r2.c[a], r3.c[a], t)) as V;
      r.rx = Math.max(1e-4, catmull(r0.rx, r1.rx, r2.rx, r3.rx, t));
      r.rz = Math.max(1e-4, catmull(r0.rz, r1.rz, r2.rz, r3.rz, t));
      out.push(r);
    }
  }
  out.push(rings[last]);
  return out;
}

/** Gram-Schmidt `ref` against unit `t`; falls back to `alt` when parallel. */
function perp(ref: P, t: P, alt: P): V {
  let v = sub(ref, scale(t, dot(ref, t)));
  if (len(v) < 1e-4) v = sub(alt, scale(t, dot(alt, t)));
  return norm(v);
}

export class MeshBuilder {
  /** Height scale relative to the reference body. */
  readonly s: number;
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];
  readonly acc: number[] = [];
  readonly mat: number[] = [];
  readonly skI: number[] = [];
  readonly skW: number[] = [];
  readonly idx: number[] = [];

  constructor(readonly p: Proportions) {
    this.s = p.H / REF_HEIGHT;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Bind joint of `bone` plus an offset, in reference metres. */
  at(bone: BoneName, dx = 0, dy = 0, dz = 0): V {
    const j = bindPosition(this.p, bone);
    return [j[0] / this.s + dx, j[1] / this.s + dy, j[2] / this.s + dz];
  }

  vertex(p: P, n: P, skin: Skin, pt: Paint, bright = 1, accent?: P): number {
    const s = this.s;
    this.pos.push(p[0] * s, p[1] * s, p[2] * s);
    this.nrm.push(n[0], n[1], n[2]);
    _c.set(pt.colorAt ? pt.colorAt(p) : pt.color).multiplyScalar(bright);
    this.col.push(_c.r, _c.g, _c.b);
    if (accent) this.acc.push(accent[0], accent[1], accent[2]);
    else {
      _c.set(pt.accent ?? pt.color);
      this.acc.push(_c.r, _c.g, _c.b);
    }
    this.mat.push(pt.rough, pt.metal, pt.kind, pt.glow ?? 0);
    let total = 0;
    for (let i = 0; i < 4; i++) total += skin[i]?.[1] ?? 0;
    for (let i = 0; i < 4; i++) {
      const inf = skin[i];
      this.skI.push(inf ? boneIndex(inf[0]) : 0);
      this.skW.push(inf && total > 0 ? inf[1] / total : i === 0 && total <= 0 ? 1 : 0);
    }
    return this.pos.length / 3 - 1;
  }

  /**
   * Quad grid from rows of points (each row a closed loop unless `openRows`).
   * `hint` gives an outward direction per point: normals are finite
   * differences of the grid, flipped to agree with it, and so is every quad.
   */
  grid(
    pts: readonly (readonly P[])[], hint: readonly (readonly P[])[], skin: SkinFn, pt: Paint,
    bright?: (i: number, k: number, p: P) => number, accent?: (i: number, k: number, p: P) => P, openRows = false,
    hex?: (i: number, k: number) => number,
  ): void {
    const R = pts.length;
    const K = pts[0].length;
    const base = this.vertexCount;
    for (let i = 0; i < R; i++) {
      const row = pts[i];
      for (let k = 0; k < K; k++) {
        const p = row[k];
        const kp = openRows ? Math.min(K - 1, k + 1) : (k + 1) % K;
        const km = openRows ? Math.max(0, k - 1) : (k - 1 + K) % K;
        const du = sub(row[kp], row[km]);
        const dv = sub(pts[Math.min(R - 1, i + 1)][k], pts[Math.max(0, i - 1)][k]);
        let n = cross(du, dv);
        const h = hint[i][k];
        if (len(n) < 1e-9) n = [h[0], h[1], h[2]];
        n = norm(n);
        if (dot(n, h) < 0) n = scale(n, -1);
        this.vertex(p, n, skin(p), hex ? { ...pt, color: hex(i, k), colorAt: undefined } : pt, bright ? bright(i, k, p) : 1, accent?.(i, k, p));
      }
    }
    const cols = openRows ? K - 1 : K;
    for (let i = 0; i < R - 1; i++) {
      for (let k = 0; k < cols; k++) {
        const k1 = (k + 1) % K;
        const a = base + i * K + k;
        const b = base + i * K + k1;
        const c = base + (i + 1) * K + k1;
        const d = base + (i + 1) * K + k;
        // Diagonals, so a quad with a collapsed edge (a pole) still has a direction.
        const face = cross(sub(pts[i + 1][k1], pts[i][k]), sub(pts[i + 1][k], pts[i][k1]));
        const want = add(add(hint[i][k], hint[i][k1]), add(hint[i + 1][k], hint[i + 1][k1]));
        if (dot(face, want) >= 0) this.idx.push(a, b, c, a, c, d);
        else this.idx.push(a, c, b, a, d, c);
      }
    }
  }

  /** Carry a cross-section along rings (see SweepOpts). */
  sweep(rings: readonly Ring[], o: SweepOpts, skin: SkinFn, pt: Paint): void {
    const rs = subdivide(rings, o.sub ?? 1);
    const n = rs.length;
    if (n < 2) return;
    const F = o.front ?? [0, 0, 1];
    const S = o.side ?? [1, 0, 0];
    const band = o.shape === 'band';
    const pts: P[][] = [];
    const hints: P[][] = [];
    const tangents: V[] = [];
    const us: number[] = [];
    let total = 0;
    const dist = [0];
    for (let i = 1; i < n; i++) dist.push((total += len(sub(rs[i].c, rs[i - 1].c))));
    for (let i = 0; i < n; i++) {
      const t = norm(sub(rs[Math.min(n - 1, i + 1)].c, rs[Math.max(0, i - 1)].c));
      tangents.push(t);
      const r = rs[i];
      const f = perp(r.f ?? F, t, S);
      const sv = perp(S, t, cross(t, f));
      const side = sub(sv, scale(f, dot(sv, f)));
      const s = len(side) < 1e-4 ? cross(t, f) : norm(side);
      const row: P[] = [];
      const hint: P[] = [];
      const push = (x: number, z: number, hx: number, hz: number) => {
        row.push(add(r.c, add(scale(s, x), scale(f, z))));
        hint.push(add(scale(s, hx), scale(f, hz)));
      };
      if (band) {
        const gap = r.gap ?? 0.6;
        const th = r.thick ?? 0.01;
        const m = o.sides;
        const a0 = (o.phase ?? 0) + gap / 2;
        for (let k = 0; k <= m; k++) {
          const a = a0 + ((TAU - gap) * k) / m;
          const [x, z] = ringPoint(r, a, o.bumps);
          push(x, z, Math.sin(a), Math.cos(a));
        }
        for (let k = m; k >= 0; k--) {
          const a = a0 + ((TAU - gap) * k) / m;
          const [x, z] = ringPoint(r, a, o.bumps, -th);
          push(x, z, -Math.sin(a), -Math.cos(a));
        }
        // The two lips of the opening face into it: tilt their hints that way.
        const lip = (a: number, sign: number) => add(scale(s, sign * Math.cos(a)), scale(f, -sign * Math.sin(a)));
        const e0 = lip(a0, -1);
        const e1 = lip(a0 + TAU - gap, 1);
        hint[0] = add(hint[0], e0);
        hint[2 * m + 1] = add(hint[2 * m + 1], e0);
        hint[m] = add(hint[m], e1);
        hint[m + 1] = add(hint[m + 1], e1);
      } else {
        for (let k = 0; k < o.sides; k++) {
          const a = (TAU * k) / o.sides;
          const [x, z] = ringPoint(r, a, o.bumps);
          const [hx, hz] = ringPoint(r, a + 1e-3, o.bumps);
          const [px, pz] = ringPoint(r, a - 1e-3, o.bumps);
          // Outward = the loop's tangent turned a quarter (the loop runs clockwise in (s, f)).
          push(x, z, -(hz - pz), hx - px);
        }
      }
      pts.push(row);
      hints.push(hint);
      us.push(total > 0 ? dist[i] / total : i / (n - 1));
    }
    const dome = (end: boolean) => {
      const i = end ? n - 1 : 0;
      const t = scale(tangents[i], end ? 1 : -1);
      const r = rs[i];
      const reach = Math.min(r.rx, r.rz) * (o.dome ?? 0.9);
      const c = r.c;
      const rows: P[][] = [];
      const hs: P[][] = [];
      for (const [k, out] of [[0.72, 0.5], [0.34, 0.87], [0, 1]] as const) {
        rows.push(pts[i].map((p) => add(add(c, scale(sub(p, c), k)), scale(t, reach * out))));
        hs.push(pts[i].map((_p, j) => norm(add(scale(norm(hints[i][j]), k), scale(t, out + 0.05)))));
      }
      return { rows, hs };
    };
    if (o.capStart) {
      const { rows, hs } = dome(false);
      pts.unshift(...rows.reverse());
      hints.unshift(...hs.reverse());
      us.unshift(0, 0, 0);
    }
    if (o.capEnd) {
      const { rows, hs } = dome(true);
      pts.push(...rows);
      hints.push(...hs);
      us.push(1, 1, 1);
    }
    const bright = o.shade ? (i: number, k: number, p: P) => o.shade!(p, us[i], k) : undefined;
    const accent = o.accent
      ? (i: number, _k: number, p: P) => o.accent!(p, tangents[Math.min(n - 1, Math.max(0, i - (o.capStart ? 3 : 0)))])
      : undefined;
    this.grid(pts, hints, skin, pt, bright, accent);
  }

  /** Ellipsoid with radii r, rotated by Euler XYZ `rot`; `polar` keeps only [start, length] of the angle from +Y. */
  ellipsoid(c: P, r: P, skin: SkinFn, pt: Paint, o: { segs?: number; rot?: P; polar?: readonly [number, number]; bright?: (p: P, n: P) => number } = {}): void {
    const segs = o.segs ?? 12;
    const [p0, pl] = o.polar ?? [0, Math.PI];
    const rows = Math.max(3, Math.ceil((segs * 0.6 * pl) / Math.PI));
    const [cx, cy, cz] = rotation(o.rot ?? [0, 0, 0]);
    const pts: P[][] = [];
    const hints: P[][] = [];
    for (let i = 0; i <= rows; i++) {
      const th = p0 + (pl * i) / rows;
      const row: P[] = [];
      const hint: P[] = [];
      for (let k = 0; k < segs; k++) {
        const ph = (TAU * k) / segs;
        const u: P = [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];
        const l: P = [u[0] * r[0], u[1] * r[1], u[2] * r[2]];
        row.push(add(c, rot3(cx, cy, cz, l)));
        hint.push(rot3(cx, cy, cz, [u[0] / r[0], u[1] / r[1], u[2] / r[2]]));
      }
      pts.push(row);
      hints.push(hint);
    }
    const bright = o.bright ? (i: number, k: number, p: P) => o.bright!(p, hints[i][k]) : undefined;
    this.grid(pts, hints, skin, pt, bright);
  }

  /** Torus of major radius R and tube radius r in the XY plane, then rotated by `rot`. */
  torus(c: P, R: number, r: number, skin: SkinFn, pt: Paint, o: { rot?: P; seg?: number; tube?: number; flat?: number } = {}): void {
    const seg = o.seg ?? 20;
    const [ax, ay, az] = rotation(o.rot ?? [0, 0, 0]);
    const rings: Ring[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (TAU * i) / seg;
      rings.push({ c: add(c, rot3(ax, ay, az, [Math.cos(a) * R, Math.sin(a) * R, 0])), rx: r, rz: r * (o.flat ?? 1), f: rot3(ax, ay, az, [Math.cos(a), Math.sin(a), 0]) });
    }
    // Close the loop exactly: the last ring duplicates the first.
    this.sweep(rings, { sides: o.tube ?? 6, side: rot3(ax, ay, az, [0, 0, 1]) }, skin, pt);
  }

  /** Rounded box (superellipsoid) of half extents `h`, rotated by `rot`. */
  box(c: P, h: P, skin: SkinFn, pt: Paint, o: { rot?: P; round?: number; segs?: number } = {}): void {
    const e = o.round ?? 0.25;
    const segs = o.segs ?? 12;
    const rows = Math.ceil(segs / 2);
    const [ax, ay, az] = rotation(o.rot ?? [0, 0, 0]);
    const sp = (x: number) => Math.sign(x) * Math.abs(x) ** e;
    const pts: P[][] = [];
    const hints: P[][] = [];
    for (let i = 0; i <= rows; i++) {
      const th = (Math.PI * i) / rows;
      const row: P[] = [];
      const hint: P[] = [];
      for (let k = 0; k < segs; k++) {
        const ph = (TAU * k) / segs;
        const l: P = [h[0] * sp(Math.sin(th)) * sp(Math.sin(ph)), h[1] * sp(Math.cos(th)), h[2] * sp(Math.sin(th)) * sp(Math.cos(ph))];
        row.push(add(c, rot3(ax, ay, az, l)));
        hint.push(rot3(ax, ay, az, [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)]));
      }
      pts.push(row);
      hints.push(hint);
    }
    this.grid(pts, hints, skin, pt);
  }

  build(ao: Float32Array): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('accent', new Float32BufferAttribute(this.acc, 3));
    g.setAttribute('mat', new Float32BufferAttribute(this.mat, 4));
    g.setAttribute('ao', new Float32BufferAttribute(ao, 1));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.skI, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.skW, 4));
    g.setAttribute('hullNormal', new Float32BufferAttribute(smoothNormals(this.pos, this.nrm), 3));
    g.setIndex(this.vertexCount > 65535 ? new Uint32BufferAttribute(this.idx, 1) : new Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}

type M3 = readonly [P, P, P];

/** Rows of the XYZ Euler rotation matrix. */
function rotation(e: P): M3 {
  const [a, b, c] = e;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
}

function rot3(r0: P, r1: P, r2: P, v: P): V {
  return [dot(r0, v), dot(r1, v), dot(r2, v)];
}

/** Normals averaged over coincident vertices, so an inflated outline hull has no cracks at seams. */
function smoothNormals(pos: readonly number[], nrm: readonly number[]): Float32Array {
  const out = new Float32Array(nrm.length);
  const groups = new Map<number, number[]>();
  // 0.1 mm cells packed exactly into one number (16 bits per axis covers ±3.2 m).
  const q = (x: number) => Math.round(x * 1e4) + 32768;
  for (let i = 0; i < pos.length; i += 3) {
    const key = q(pos[i]) + q(pos[i + 1]) * 65536 + q(pos[i + 2]) * 4294967296;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(i);
  }
  for (const list of groups.values()) {
    let x = 0, y = 0, z = 0;
    for (const i of list) {
      x += nrm[i]; y += nrm[i + 1]; z += nrm[i + 2];
    }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of list) {
      out[i] = x / l; out[i + 1] = y / l; out[i + 2] = z / l;
    }
  }
  return out;
}
