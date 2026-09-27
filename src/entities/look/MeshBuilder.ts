/**
 * Accumulates low-poly parts into one rigidly skinned BufferGeometry.
 * Every part belongs to one bone (skin weight 1). Sizes are in reference
 * metres (a 1.78 m body) and scale with the character's height.
 */
import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4,
  Quaternion, SphereGeometry, TorusGeometry, Uint16BufferAttribute, Vector3,
} from 'three';
import type { BoneName } from '../../core/types';
import { bindPosition, boneIndex, REF_HEIGHT, type Proportions } from '../rig/skeleton';

export type P = readonly [number, number, number];

export interface PartOpts {
  /** Self-illumination (emissive = albedo × glow), e.g. a cigarette tip. */
  glow?: number;
  rot?: P;
}

export interface TubeOpts extends PartOpts {
  sides?: number;
  /** Front-back radius as a fraction of the side-to-side radius. */
  depth?: number;
  /** [start, length] of the swept angle; 0 is the front (+Z). */
  theta?: readonly [number, number];
  open?: boolean;
}

export interface BallOpts extends PartOpts {
  segs?: number;
  /** [start, length] of the polar angle measured from the top. */
  polar?: readonly [number, number];
}

/** Scale a colour's brightness (for shading variations of one base colour). */
export function shade(hex: number, f: number): number {
  const c = (s: number) => Math.min(255, Math.round(((hex >> s) & 255) * f));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

const UP = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _d = new Vector3();
const _s = new Vector3();
const _c = new Color();

export class MeshBuilder {
  /** Height scale relative to the reference body. */
  readonly s: number;
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly hull: number[] = [];
  private readonly col: number[] = [];
  private readonly glw: number[] = [];
  private readonly skin: number[] = [];
  private readonly idx: number[] = [];

  constructor(readonly p: Proportions) {
    this.s = p.H / REF_HEIGHT;
  }

  /** Rig-space point: the bind joint of `bone` plus an offset in reference metres. */
  at(bone: BoneName, dx = 0, dy = 0, dz = 0): P {
    const j = bindPosition(this.p, bone);
    return [j[0] + dx * this.s, j[1] + dy * this.s, j[2] + dz * this.s];
  }

  /** Point `t` of the way from `a` to `b`. */
  static mix(a: P, b: P, t: number): P {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  box(bone: BoneName, c: P, size: P, color: number, o: PartOpts = {}): void {
    const s = this.s;
    this.add(bone, new BoxGeometry(size[0] * s, size[1] * s, size[2] * s), color, o.glow, this.xf(c, o.rot, 1, 1, 1));
  }

  /** Ellipsoid (or a polar slice of one) with radii `r`. */
  ball(bone: BoneName, c: P, r: P, color: number, o: BallOpts = {}): void {
    const segs = o.segs ?? 10;
    const [p0, pl] = o.polar ?? [0, Math.PI];
    const g = new SphereGeometry(1, segs, Math.max(3, Math.ceil(segs * 0.7 * pl / Math.PI)), 0, Math.PI * 2, p0, pl);
    this.add(bone, g, color, o.glow, this.xf(c, o.rot, r[0] * this.s, r[1] * this.s, r[2] * this.s));
  }

  /** Tapered, optionally elliptic or partial tube from `a` (radius r0) to `b` (radius r1). */
  tube(bone: BoneName, a: P, b: P, r0: number, r1: number, color: number, o: TubeOpts = {}): void {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _d.length();
    if (len < 1e-5) return;
    const [t0, tl] = o.theta ?? [0, Math.PI * 2];
    const g = new CylinderGeometry(r1 * this.s, r0 * this.s, len, o.sides ?? 10, 1, o.open ?? false, t0, tl);
    g.scale(1, 1, o.depth ?? 1);
    _q.setFromUnitVectors(UP, _d.divideScalar(len));
    _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    this.add(bone, g, color, o.glow, _m.compose(_p, _q, _s.set(1, 1, 1)));
  }

  /** Ring of major radius `R`, lying in the XY plane before `rot`. */
  ring(bone: BoneName, c: P, R: number, r: number, color: number, o: PartOpts = {}): void {
    this.add(bone, new TorusGeometry(R * this.s, r * this.s, 5, 16), color, o.glow, this.xf(c, o.rot, 1, 1, 1));
  }

  build(): BufferGeometry {
    const n = this.pos.length / 3;
    const weights = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) weights[i * 4] = 1;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.skin, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
    g.setAttribute('glow', new Float32BufferAttribute(this.glw, 1));
    g.setAttribute('hullNormal', new Float32BufferAttribute(this.hull, 3));
    g.setIndex(this.idx);
    return g;
  }

  private xf(c: P, rot: P | undefined, sx: number, sy: number, sz: number): Matrix4 {
    _q.setFromEuler(rot ? _e.set(rot[0], rot[1], rot[2]) : _e.set(0, 0, 0));
    return _m.compose(_p.set(c[0], c[1], c[2]), _q, _s.set(sx, sy, sz));
  }

  private add(bone: BoneName, g: BufferGeometry, color: number, glow = 0, m: Matrix4): void {
    g.applyMatrix4(m);
    const base = this.pos.length / 3;
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const bi = boneIndex(bone);
    _c.set(color);
    for (let i = 0; i < pos.count; i++) {
      this.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      this.nrm.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      this.col.push(_c.r, _c.g, _c.b);
      this.glw.push(glow);
      this.skin.push(bi, 0, 0, 0);
    }
    this.hull.push(...smoothNormals(pos.array as Float32Array, nrm.array as Float32Array));
    const index = g.index!;
    for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    g.dispose();
  }
}

/** Normals averaged over coincident vertices, so an inflated hull has no cracks at seams. */
function smoothNormals(pos: Float32Array, nrm: Float32Array): number[] {
  const acc = new Map<string, [number, number, number]>();
  const keys: string[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const k = `${Math.round(pos[i] * 1e4)},${Math.round(pos[i + 1] * 1e4)},${Math.round(pos[i + 2] * 1e4)}`;
    keys.push(k);
    const a = acc.get(k) ?? [0, 0, 0];
    a[0] += nrm[i]; a[1] += nrm[i + 1]; a[2] += nrm[i + 2];
    acc.set(k, a);
  }
  return keys.flatMap((k) => {
    const [x, y, z] = acc.get(k)!;
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  });
}
