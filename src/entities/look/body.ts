/**
 * The body under the clothes: anatomical cross-section profiles for the
 * torso, arms and legs, swept into one continuous skin that blends across
 * every joint. Clothing reuses the same profiles (grown, smoothed, clipped
 * to its coverage), so a sleeve or a trouser leg always hugs the limb it
 * dresses and bends the same way.
 */
import type { BoneName, CharacterAppearance, TopStyle } from '../../core/types';
import type { WidthFactors } from '../rig/skeleton';
import { buildFeet, buildHands } from './extremities';
import {
  KIND, lerp, MeshBuilder, norm, paint, ringPoint, smooth, type Bump, type P, type Paint, type Ring, type Skin, type SkinFn, type V,
} from './MeshBuilder';

export interface Look extends CharacterAppearance {
  /** What is worn under an apron (default 'tshirt'). */
  under?: TopStyle;
}

/** Skin left bare by the clothes: coverage fractions of arm and leg from the top. */
export interface Coverage {
  arm: number;
  leg: number;
  tattoo: boolean;
}

export const TAU = Math.PI * 2;
const SKIN_ROUGH = 0.52;

function skinPaint(look: Look, tattoo = false): Paint {
  return tattoo
    ? paint(look.skinTone, KIND.tattoo, SKIN_ROUGH, 0, { accent: 0x1c2a3c })
    : paint(look.skinTone, KIND.skin, SKIN_ROUGH);
}

// ---------------------------------------------------------------------------
// Profiles. y is absolute (reference metres, feet at 0); limb y is relative to
// the limb's top joint. Angles: 0 front, +PI/2 the character's left.
// ---------------------------------------------------------------------------

/** belly, pecL, pecR, gluteL, gluteR, latL, latR, spine, scapL, scapR, throat */
export const TORSO_BUMPS: readonly Bump[] = [
  { a: 0, w: 0.8 }, { a: 0.45, w: 0.42 }, { a: -0.45, w: 0.42 }, { a: Math.PI - 0.5, w: 0.55 }, { a: -Math.PI + 0.5, w: 0.55 },
  { a: 1.7, w: 0.35 }, { a: -1.7, w: 0.35 }, { a: Math.PI, w: 0.12 }, { a: Math.PI - 0.55, w: 0.4 }, { a: -Math.PI + 0.55, w: 0.4 },
  { a: 0, w: 0.25 },
];

type Row = readonly [y: number, cz: number, rx: number, rz: number, n: number, h: readonly number[]];

const Z11 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const;
const h = (o: Partial<Record<number, number>>): number[] => Z11.map((z, i) => o[i] ?? z);

const TORSO: readonly Row[] = [
  [0.835, -0.004, 0.09, 0.078, 2, h({})],
  [0.872, -0.01, 0.148, 0.1, 2.2, h({ 3: 0.1, 4: 0.1 })],
  [0.915, -0.01, 0.166, 0.106, 2.3, h({ 3: 0.15, 4: 0.15 })],
  [0.97, -0.008, 0.16, 0.102, 2.3, h({ 3: 0.07, 4: 0.07 })],
  [1.03, -0.004, 0.146, 0.097, 2.3, h({ 7: -0.03 })],
  [1.09, 0, 0.146, 0.099, 2.3, h({ 0: 0.02, 7: -0.04 })],
  [1.16, 0.004, 0.15, 0.105, 2.35, h({ 7: -0.04 })],
  [1.23, 0.008, 0.154, 0.112, 2.35, h({ 5: 0.05, 6: 0.05, 7: -0.04 })],
  [1.3, 0.01, 0.156, 0.118, 2.4, h({ 1: 0.07, 2: 0.07, 5: 0.06, 6: 0.06, 7: -0.03, 8: 0.02, 9: 0.02 })],
  [1.36, 0.004, 0.168, 0.113, 2.5, h({ 1: 0.04, 2: 0.04, 8: 0.05, 9: 0.05 })],
  [1.405, -0.004, 0.186, 0.104, 2.6, h({ 8: 0.03, 9: 0.03 })],
  [1.44, -0.01, 0.19, 0.092, 2.7, h({})],
  [1.465, -0.014, 0.162, 0.078, 2.5, h({})],
  [1.488, -0.016, 0.1, 0.068, 2.2, h({})],
  [1.51, -0.012, 0.066, 0.062, 2, h({})],
  [1.545, -0.008, 0.06, 0.059, 2, h({ 10: 0.07 })],
  [1.585, -0.012, 0.052, 0.053, 2, h({})],
  [1.625, -0.012, 0.042, 0.045, 2, h({})],
];

/** Female torso: narrower waist, bust, no throat bump. */
const TORSO_F: readonly Row[] = [
  [0.835, -0.006, 0.092, 0.08, 2, h({})],
  [0.872, -0.012, 0.15, 0.102, 2.2, h({ 3: 0.12, 4: 0.12 })],
  [0.915, -0.012, 0.166, 0.108, 2.3, h({ 3: 0.17, 4: 0.17 })],
  [0.97, -0.008, 0.152, 0.1, 2.3, h({ 3: 0.07, 4: 0.07 })],
  [1.04, -0.002, 0.128, 0.09, 2.3, h({ 7: -0.03 })],
  [1.11, 0.002, 0.13, 0.092, 2.3, h({ 7: -0.035 })],
  [1.18, 0.006, 0.14, 0.1, 2.35, h({ 1: 0.08, 2: 0.08, 7: -0.03 })],
  [1.235, 0.008, 0.146, 0.106, 2.35, h({ 1: 0.34, 2: 0.34, 7: -0.03 })],
  [1.285, 0.01, 0.15, 0.108, 2.4, h({ 1: 0.4, 2: 0.4, 8: 0.02, 9: 0.02 })],
  [1.335, 0.006, 0.158, 0.106, 2.45, h({ 1: 0.14, 2: 0.14, 8: 0.04, 9: 0.04 })],
  [1.395, -0.004, 0.174, 0.097, 2.6, h({ 8: 0.03, 9: 0.03 })],
  [1.432, -0.01, 0.176, 0.086, 2.7, h({})],
  [1.46, -0.014, 0.148, 0.074, 2.5, h({})],
  [1.484, -0.016, 0.092, 0.064, 2.2, h({})],
  [1.508, -0.012, 0.053, 0.052, 2, h({})],
  [1.545, -0.008, 0.049, 0.049, 2, h({})],
  [1.585, -0.012, 0.044, 0.046, 2, h({})],
  [1.625, -0.012, 0.04, 0.042, 2, h({})],
];

/** Torso rings for this body, bottom to top, before any clothing. */
export function torsoRings(look: Look, w: WidthFactors): Ring[] {
  const muscular = look.build === 'muscular';
  const heavy = look.build === 'heavy';
  return (look.female ? TORSO_F : TORSO).map(([y, cz, rx, rz, n, hh]) => {
    const neck = smooth(1.47, 1.51, y);
    const wide = y < 1 ? w.hip : lerp(w.torso, w.shoulder, smooth(1.3, 1.4, y));
    const girth = lerp(wide, 0.88 + 0.12 * w.limb, neck);
    const bumps = hh.map((v, i) => {
      if (muscular && i >= 1 && i <= 9 && i !== 7) return v * 1.7;
      if (heavy && i === 0) return v + 0.24 * Math.exp(-(((y - 1.12) / 0.07) ** 2));
      return v;
    });
    const traps = muscular ? 1 + 0.1 * Math.exp(-(((y - 1.46) / 0.025) ** 2)) : 1;
    return { c: [0, y, cz * lerp(w.depth, 1, neck)], rx: rx * girth * traps, rz: rz * lerp(w.depth, girth, neck), n, h: bumps };
  });
}

/** Torso skinning: hips → spine → chest → neck → head, the shoulder corners partly riding the arms. */
export function torsoSkin(b: MeshBuilder): SkinFn {
  const sh = b.at('upperArmL')[0];
  return (p) => {
    const y = p[1];
    const hs = smooth(0.99, 1.1, y);
    const sc = smooth(1.2, 1.31, y);
    const cn = smooth(1.455, 1.5, y);
    const nh = smooth(1.535, 1.575, y);
    const arm = 0.45 * smooth(sh - 0.06, sh + 0.01, Math.abs(p[0])) * smooth(1.34, 1.42, y) * (1 - cn);
    const chest = sc * (1 - cn) - arm;
    const skin: [BoneName, number][] = [['hips', 1 - hs], ['spine', hs * (1 - sc)], ['chest', chest], ['neck', cn * (1 - nh)], ['head', nh]];
    if (arm > 0) skin.push([p[0] > 0 ? 'upperArmL' : 'upperArmR', arm]);
    return top4(skin);
  };
}

/** The four heaviest influences. */
function top4(skin: [BoneName, number][]): Skin {
  return skin.filter(([, v]) => v > 1e-3).sort((a, b) => b[1] - a[1]).slice(0, 4);
}

// Limbs ---------------------------------------------------------------------

/** bicep, tricep, front deltoid, brachioradialis, elbow point (left arm; mirrored for the right). */
const ARM_BUMP_A: readonly Bump[] = [{ a: 0, w: 0.7 }, { a: Math.PI, w: 0.8 }, { a: 0.5, w: 0.6 }, { a: 0.8, w: 0.6 }, { a: Math.PI, w: 0.4 }];
const ARM: readonly (readonly [dy: number, dx: number, rx: number, rz: number, h: readonly number[]])[] = [
  [0.006, -0.01, 0.05, 0.052, [0, 0, 0.02, 0, 0]],
  [-0.03, 0.004, 0.059, 0.058, [0, 0, 0.05, 0, 0]],
  [-0.09, 0.002, 0.052, 0.052, [0.02, 0.02, 0.02, 0, 0]],
  [-0.15, 0, 0.046, 0.05, [0.08, 0.06, 0, 0, 0]],
  [-0.22, 0, 0.044, 0.047, [0.05, 0.04, 0, 0, 0]],
  [-0.275, 0, 0.041, 0.044, [0, 0.02, 0, 0, 0]],
  [-0.3026, 0, 0.04, 0.044, [0, 0, 0, 0, 0.1]],
  [-0.33, 0, 0.043, 0.045, [0, 0, 0, 0.1, 0.03]],
  [-0.39, 0, 0.043, 0.042, [0, 0, 0, 0.06, 0]],
  [-0.46, 0, 0.035, 0.031, [0, 0, 0, 0, 0]],
  [-0.53, 0, 0.03, 0.024, [0, 0, 0, 0, 0]],
  [-0.575, 0, 0.029, 0.022, [0, 0, 0, 0, 0]],
  [-0.598, 0, 0.028, 0.021, [0, 0, 0, 0, 0]],
];
const ELBOW_DY = -0.3026;
export const WRIST_DY = -0.5607;

/** quad, hamstring, vastus medialis, kneecap, outer calf, inner calf, shin (left leg; mirrored for the right). */
const LEG_BUMP_A: readonly Bump[] = [
  { a: 0, w: 0.7 }, { a: Math.PI, w: 0.7 }, { a: -0.7, w: 0.45 }, { a: 0, w: 0.35 }, { a: Math.PI - 0.45, w: 0.45 }, { a: -Math.PI + 0.45, w: 0.45 }, { a: 0, w: 0.3 },
];
const LEG: readonly (readonly [dy: number, dx: number, rx: number, rz: number, h: readonly number[]])[] = [
  [0.075, -0.03, 0.062, 0.078, [0, 0, 0, 0, 0, 0, 0]],
  [0.03, -0.018, 0.08, 0.09, [0, 0, 0, 0, 0, 0, 0]],
  [-0.05, -0.008, 0.086, 0.09, [0.04, 0.04, 0, 0, 0, 0, 0]],
  [-0.15, 0, 0.08, 0.083, [0.06, 0.05, 0, 0, 0, 0, 0]],
  [-0.25, 0, 0.07, 0.073, [0.05, 0.02, 0.05, 0, 0, 0, 0]],
  [-0.33, 0, 0.06, 0.063, [0.02, 0, 0.09, 0, 0, 0, 0]],
  [-0.39, 0, 0.054, 0.058, [0, 0, 0.06, 0.04, 0, 0, 0]],
  [-0.4183, 0, 0.051, 0.056, [0, 0, 0, 0.13, 0, 0, 0]],
  [-0.45, 0, 0.051, 0.056, [0, 0, 0, 0.05, 0.03, 0.03, 0]],
  [-0.5, 0, 0.055, 0.064, [0, 0, 0, 0, 0.1, 0.12, 0]],
  [-0.56, 0, 0.056, 0.065, [0, 0, 0, 0, 0.12, 0.14, 0.02]],
  [-0.64, 0, 0.047, 0.053, [0, 0, 0, 0, 0.03, 0.06, 0.02]],
  [-0.72, 0, 0.038, 0.041, [0, 0, 0, 0, 0, 0, 0]],
  [-0.79, 0, 0.034, 0.036, [0, 0, 0, 0, 0, 0, 0]],
  [-0.8188, 0, 0.033, 0.036, [0, 0, 0, 0, 0, 0, 0]],
  [-0.84, 0, 0.032, 0.035, [0, 0, 0, 0, 0, 0, 0]],
];
const KNEE_DY = -0.4183;
const ANKLE_DY = -0.8188;

export interface Limb {
  rings: Ring[];
  bumps: Bump[];
  skin: SkinFn;
  /** Top joint (reference metres). */
  top: P;
}

const mirror = (bumps: readonly Bump[], x: number): Bump[] => bumps.map((b) => ({ a: b.a * x, w: b.w }));

/** Limb girth by build: the muscle bumps already carry a lot of the difference. */
const limbThickness = (b: MeshBuilder): number => b.p.w.limb ** 0.6;

export function arm(b: MeshBuilder, side: 'L' | 'R', look: Look): Limb {
  const x = side === 'L' ? 1 : -1;
  const top = b.at(`upperArm${side}`);
  const k = limbThickness(b);
  const flex = look.build === 'muscular' ? 1.6 : look.female ? 0.5 : 1;
  const rings = ARM.map(([dy, dx, rx, rz, hh]): Ring => ({
    c: [top[0] + dx * x, top[1] + dy, top[2]], rx: rx * k, rz: rz * k, h: hh.map((v) => v * flex),
  }));
  const up: BoneName = `upperArm${side}`;
  const fore: BoneName = `forearm${side}`;
  const hand: BoneName = `hand${side}`;
  const skin: SkinFn = (p) => {
    const dy = p[1] - top[1];
    const chest = 0.35 * smooth(-0.01, 0.045, dy);
    const e = smooth(ELBOW_DY - 0.035, ELBOW_DY + 0.035, dy);
    const wr = smooth(WRIST_DY - 0.02, WRIST_DY + 0.02, dy);
    return top4([['chest', chest], [up, (1 - chest) * e], [fore, (1 - e) * wr], [hand, 1 - wr]]);
  };
  return { rings, bumps: mirror(ARM_BUMP_A, x), skin, top };
}

export function leg(b: MeshBuilder, side: 'L' | 'R', look: Look): Limb {
  const x = side === 'L' ? 1 : -1;
  const top = b.at(`thigh${side}`);
  const k = limbThickness(b);
  const flex = look.build === 'muscular' ? 1.4 : look.female ? 0.7 : 1;
  const rings = LEG.map(([dy, dx, rx, rz, hh]): Ring => ({
    c: [top[0] + dx * x, top[1] + dy, top[2]], rx: rx * k * (dy > -0.3 && look.female ? 1.05 : 1), rz: rz * k, h: hh.map((v) => v * flex),
  }));
  const thigh: BoneName = `thigh${side}`;
  const shin: BoneName = `shin${side}`;
  const foot: BoneName = `foot${side}`;
  const skin: SkinFn = (p) => {
    const dy = p[1] - top[1];
    const hips = 0.5 * smooth(-0.04, 0.07, dy);
    const kn = smooth(KNEE_DY - 0.04, KNEE_DY + 0.04, dy);
    const an = smooth(ANKLE_DY - 0.02, ANKLE_DY + 0.02, dy);
    return top4([['hips', hips], [thigh, (1 - hips) * kn], [shin, (1 - kn) * an], [foot, 1 - an]]);
  };
  return { rings, bumps: mirror(LEG_BUMP_A, x), skin, top };
}

/** Limb joint height for a coverage fraction (0 top joint .. 1 wrist/ankle), reference metres. */
export function armY(top: number, cover: number): number {
  return cover <= 0.54 ? top + (ELBOW_DY * cover) / 0.54 : top + ELBOW_DY + ((WRIST_DY - ELBOW_DY) * (cover - 0.54)) / 0.46;
}
export function legY(top: number, cover: number): number {
  return cover <= 0.51 ? top + (KNEE_DY * cover) / 0.51 : top + KNEE_DY + ((ANKLE_DY - KNEE_DY) * (cover - 0.51)) / 0.49;
}

// Ring helpers ------------------------------------------------------------------

function lerpRing(a: Ring, c: Ring, t: number): Ring {
  return {
    ...a,
    c: [lerp(a.c[0], c.c[0], t), lerp(a.c[1], c.c[1], t), lerp(a.c[2], c.c[2], t)],
    rx: lerp(a.rx, c.rx, t), rz: lerp(a.rz, c.rz, t), n: lerp(a.n ?? 2, c.n ?? 2, t),
    h: a.h?.map((v, i) => lerp(v, c.h?.[i] ?? 0, t)),
  };
}

/** The part of a ring list (ordered along y either way) between heights y0 and y1, with interpolated end rings. */
export function clip(rings: readonly Ring[], y0: number, y1: number): Ring[] {
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  const out: Ring[] = [];
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    const y = r.c[1];
    if (i > 0) {
      const py = rings[i - 1].c[1];
      // Edges crossed inside this span, in the order the path meets them.
      const ts = [lo, hi].filter((e) => (py - e) * (y - e) < 0).map((e) => (e - py) / (y - py)).sort((a, c) => a - c);
      for (const t of ts) out.push(lerpRing(rings[i - 1], r, t));
    }
    if (y >= lo - 1e-6 && y <= hi + 1e-6) out.push(r);
  }
  return out;
}

/** The ring of a vertical stack at height y (linear between neighbours). */
export function ringAt(rings: readonly Ring[], y: number): Ring {
  for (let i = 1; i < rings.length; i++) {
    const a = rings[i - 1];
    const c = rings[i];
    if ((a.c[1] - y) * (c.c[1] - y) <= 0 && a.c[1] !== c.c[1]) return lerpRing(a, c, (y - a.c[1]) / (c.c[1] - a.c[1]));
  }
  return Math.abs(rings[0].c[1] - y) < Math.abs(rings[rings.length - 1].c[1] - y) ? rings[0] : rings[rings.length - 1];
}

/** Point and horizontal outward normal on a vertical ring stack at height y and angle th, grown by g. */
export function surfaceAt(rings: readonly Ring[], bumps: readonly Bump[], y: number, th: number, g = 0): { p: V; n: V } {
  const r = ringAt(rings, y);
  const [x, z] = ringPoint(r, th, bumps, g);
  const [x1, z1] = ringPoint(r, th + 0.01, bumps, g);
  const [x0, z0] = ringPoint(r, th - 0.01, bumps, g);
  return { p: [r.c[0] + x, y, r.c[2] + z], n: norm([-(z1 - z0), 0, x1 - x0]) };
}

/**
 * Rings grown by `g` metres. Cloth drapes over every bulge but bridges the
 * hollows between them, so dents keep only `keep` of their depth (a bulge
 * softened below the skin's would poke through).
 */
export function grow(rings: readonly Ring[], g: number, keep = 0.4, extra?: (r: Ring, i: number) => Partial<Ring>): Ring[] {
  return rings.map((r, i) => ({ ...r, rx: r.rx + g, rz: r.rz + g, h: r.h?.map((v) => (v > 0 ? v : v * keep)), ...extra?.(r, i) }));
}

// Building ---------------------------------------------------------------------

/** Skin: torso and neck (always whole; clothes cover it), bare parts of the limbs, hands and shoes. */
export function buildBody(b: MeshBuilder, look: Look, cover: Coverage): void {
  const w = b.p.w;
  const skin = skinPaint(look);
  b.sweep(torsoRings(look, w), { sides: 24, sub: 2, bumps: TORSO_BUMPS, capStart: true, dome: 0.35 }, torsoSkin(b), skin);
  for (const side of ['L', 'R'] as const) {
    const a = arm(b, side, look);
    const from = cover.arm > 0 ? armY(a.top[1], cover.arm) + 0.03 : Infinity;
    const rings = cover.arm > 0 ? clip(a.rings, from, -Infinity) : a.rings;
    b.sweep(rings, { sides: 16, sub: 2, bumps: a.bumps, capStart: cover.arm <= 0, capEnd: true, dome: 0.5 }, a.skin, skinPaint(look, cover.tattoo));
    const l = leg(b, side, look);
    if (cover.leg < 0.97) {
      const lf = cover.leg > 0 ? legY(l.top[1], cover.leg) + 0.03 : Infinity;
      b.sweep(cover.leg > 0 ? clip(l.rings, lf, -Infinity) : l.rings, { sides: 18, sub: 2, bumps: l.bumps, capStart: cover.leg <= 0, capEnd: true }, l.skin, skin);
    }
  }
  buildHands(b, look);
  buildFeet(b, look);
}
