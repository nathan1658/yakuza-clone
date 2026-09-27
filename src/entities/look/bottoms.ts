/**
 * Bottoms as data: trousers are the pelvis of the torso profile plus two legs
 * swept over the leg profile, hanging straighter than the leg below the knee;
 * a skirt is a flared tube whose hem follows both thighs.
 */
import type { BoneName, BottomStyle } from '../../core/types';
import {
  clip, grow, leg, legY, ringAt, surfaceAt, TAU, TORSO_BUMPS, torsoRings, torsoSkin, type Look,
} from './body';
import { blend, KIND, lerp, MeshBuilder, paint, shade, smooth, type Paint, type Ring } from './MeshBuilder';

interface BottomSpec {
  kind: number;
  rough: number;
  /** Leg coverage 0 .. 1 (to the ankle). */
  leg: number;
  waist: number;
  /** Ease over the body at the seat and down the leg. */
  seat: number;
  ease: number;
  /** Narrowest the trouser leg gets at the knee and at the hem. */
  knee: number;
  hem: number;
  belt?: number;
  pockets?: boolean;
  cuffs?: boolean;
  crease?: boolean;
  skirt?: boolean;
}

const BOTTOMS: Readonly<Record<BottomStyle, BottomSpec>> = {
  jeans: { kind: KIND.denim, rough: 0.86, leg: 1, waist: 1.03, seat: 0.007, ease: 0.009, knee: 0.056, hem: 0.049, belt: 0x3a2616, pockets: true, cuffs: true },
  slacks: { kind: KIND.wool, rough: 0.76, leg: 1, waist: 1.045, seat: 0.01, ease: 0.014, knee: 0.064, hem: 0.054, belt: 0x141414, crease: true },
  shorts: { kind: KIND.woven, rough: 0.85, leg: 0.36, waist: 1.02, seat: 0.01, ease: 0.02, knee: 0, hem: 0, belt: 0x2a2a2a },
  skirt: { kind: KIND.woven, rough: 0.7, leg: 0, waist: 1.045, seat: 0.012, ease: 0, knee: 0, hem: 0, skirt: true },
};

export function waistY(look: Look): number {
  return BOTTOMS[look.bottom].waist;
}

export function bottomLegCover(look: Look): number {
  return BOTTOMS[look.bottom].leg;
}

export function buildBottom(b: MeshBuilder, look: Look, tucked: boolean): void {
  const spec = BOTTOMS[look.bottom];
  const pt = paint(look.bottomColor, spec.kind, spec.rough);
  const base = torsoRings(look, b.p.w);
  const skin = torsoSkin(b);
  if (spec.skirt) return skirt(b, base, spec, pt);
  // The seat's lowest rings widen to bridge the thighs, as a trouser crotch does.
  const seat = grow(clip(base, 0.8, spec.waist), spec.seat, 0.6, (r) => {
    const k = smooth(0.9, 0.835, r.c[1]);
    return { rx: r.rx + spec.seat + 0.035 * k, rz: r.rz + spec.seat + 0.008 * k };
  });
  b.sweep(seat, { sides: 24, sub: 2, bumps: TORSO_BUMPS, capStart: true, dome: 0.35 }, skin, pt);
  const crease = spec.crease ? [{ a: 0, w: 0.09 }] : [];
  for (const side of ['L', 'R'] as const) {
    const l = leg(b, side, look);
    const end = legY(l.top[1], spec.leg) + (spec.leg >= 1 ? 0.006 : 0);
    const knee = l.top[1] - 0.42;
    const rings = grow(clip(l.rings, end, Infinity), spec.ease, 0.3, (r) => {
      // Below the thigh the cloth hangs straight instead of following knee, calf and ankle.
      const u = smooth(knee + 0.12, end, r.c[1]);
      const floor = spec.knee > 0 ? lerp(spec.knee, spec.hem, u) * smooth(knee + 0.2, knee, r.c[1]) : 0;
      const flare = spec.leg < 0.5 ? 0.012 * smooth(l.top[1] - 0.1, end, r.c[1]) : 0;
      return {
        rx: Math.max(r.rx + spec.ease, floor) + flare, rz: Math.max(r.rz + spec.ease, floor * 1.08) + flare,
        h: [...(r.h ?? []).map((v) => (v > 0 ? v : v * 0.3)), spec.crease ? 0.05 : 0],
      };
    });
    b.sweep(rings, { sides: 18, sub: 2, bumps: [...l.bumps, ...crease], capStart: true }, l.skin, pt);
    if (spec.cuffs) {
      const r = ringAt(rings, end + 0.02);
      const cuff = paint(blend(look.bottomColor, 0xb8c0cc, 0.28), spec.kind, spec.rough);
      b.sweep([
        { ...r, c: [r.c[0], end - 0.002, r.c[2]], rx: r.rx + 0.004, rz: r.rz + 0.004, h: undefined },
        { ...r, c: [r.c[0], end + 0.038, r.c[2]], rx: r.rx + 0.005, rz: r.rz + 0.005, h: undefined },
      ], { sides: 18 }, l.skin, cuff);
    }
  }
  details(b, base, spec, pt, tucked);
}

/** Belt (only seen over a tucked top), back pockets and fly. */
function details(b: MeshBuilder, base: readonly Ring[], spec: BottomSpec, pt: Paint, belt: boolean): void {
  const skin = torsoSkin(b);
  const y = spec.waist - 0.018;
  if (belt && spec.belt !== undefined) {
    const strap = paint(spec.belt, KIND.leather, 0.45);
    const rings: Ring[] = [];
    for (let i = 0; i <= 36; i++) {
      const a = (TAU * i) / 36;
      const s = surfaceAt(base, TORSO_BUMPS, y, a, spec.seat + 0.004);
      rings.push({ c: s.p, rx: 0.016, rz: 0.0028, n: 4, f: s.n });
    }
    rings[36] = { ...rings[0] };
    b.sweep(rings, { sides: 8, side: [0, 1, 0] }, skin, strap);
    const front = surfaceAt(base, TORSO_BUMPS, y, 0, spec.seat + 0.009);
    b.box(front.p, [0.021, 0.017, 0.0035], skin, paint(0xc8a860, KIND.metal, 0.3, 1), { round: 0.35 });
  }
  if (spec.pockets) {
    const back = paint(shade(pt.color, 0.9), pt.kind, pt.rough);
    for (const x of [1, -1]) {
      const s = surfaceAt(base, TORSO_BUMPS, 0.93, x * (Math.PI - 0.45), spec.seat + 0.0015);
      b.box(s.p, [0.034, 0.038, 0.0015], skin, back, { round: 0.25, rot: [0, Math.atan2(s.n[0], s.n[2]), 0] });
    }
    const fly = surfaceAt(base, TORSO_BUMPS, 0.94, 0.02, spec.seat + 0.001);
    b.box(fly.p, [0.012, 0.05, 0.0015], skin, back, { round: 0.3 });
  }
}

/** A flared skirt whose lower half rides both thighs, so walking swings it instead of piercing it. */
function skirt(b: MeshBuilder, base: readonly Ring[], spec: BottomSpec, pt: Paint): void {
  const hip = ringAt(base, 0.915);
  const waist = ringAt(base, spec.waist);
  const at = (y: number, k: number, g: number): Ring => ({ ...hip, c: [0, y, hip.c[2]], rx: hip.rx * k + g, rz: hip.rz * k + g, h: hip.h?.map((v) => v * 0.5) });
  const rings: Ring[] = [
    { ...waist, rx: waist.rx + spec.seat, rz: waist.rz + spec.seat, h: waist.h?.map((v) => v * 0.5) },
    at(0.97, 1, 0.016), at(0.9, 1, 0.02), at(0.8, 1.03, 0.03), at(0.68, 1.07, 0.04), at(0.56, 1.1, 0.05),
  ].reverse();
  const skin = (p: readonly [number, number, number]) => {
    const lower = 0.55 * smooth(0.9, 0.62, p[1]);
    const left = smooth(-0.04, 0.04, p[0]);
    const s: [BoneName, number][] = [['hips', 1 - lower], ['thighL', lower * left], ['thighR', lower * (1 - left)]];
    return s;
  };
  b.sweep(rings, { sides: 24, sub: 2, bumps: TORSO_BUMPS }, skin, pt);
}
