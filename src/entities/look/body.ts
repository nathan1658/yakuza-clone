/**
 * The naked body plus face. Clothing enters only through `Dress`: which
 * colour covers how much of each limb and of the chest. Limbs and torso
 * sections are split at the coverage line, so a sleeve, a tank-top neckline
 * and shorts are the same operation.
 */
import type { BoneName, CharacterAppearance, TopStyle } from '../../core/types';
import type { WidthFactors } from '../rig/skeleton';
import { MeshBuilder, shade, type P, type TubeOpts } from './MeshBuilder';

export interface Look extends CharacterAppearance {
  /** What is worn under an apron (default 'tshirt'). */
  under?: TopStyle;
}

export interface Dress {
  torso: number;
  /** Height above the chest joint (reference metres) where the top ends; skin above. */
  neckline: number;
  /** Sleeve coverage of the arm, 0 (bare) .. 1 (to the wrist). */
  arm: number;
  sleeve: number;
  /** Trouser coverage of the leg, 0 .. 1 (to the ankle). */
  leg: number;
  pants: number;
}

export interface Section {
  bone: BoneName;
  y0: number;
  y1: number;
  r0: number;
  r1: number;
  depth: number;
}

/** Torso tubes, bottom to top (y relative to the bone joint, reference metres). */
export function torsoSections(w: WidthFactors): Section[] {
  const d = w.depth / w.torso;
  return [
    { bone: 'hips', y0: -0.1, y1: 0.075, r0: 0.15 * w.hip, r1: 0.14 * w.torso, depth: 0.7 * d },
    { bone: 'spine', y0: -0.04, y1: 0.22, r0: 0.14 * w.torso, r1: 0.155 * w.torso, depth: 0.64 * d },
    { bone: 'chest', y0: -0.03, y1: 0.17, r0: 0.155 * w.torso, r1: 0.168 * w.shoulder, depth: 0.62 * d },
    { bone: 'chest', y0: 0.17, y1: 0.235, r0: 0.168 * w.shoulder, r1: 0.075, depth: 0.75 * d },
  ];
}

export const FULL_NECKLINE = 1;
export const HEAD_R: P = [0.08, 0.112, 0.095];
const HEAD_C: P = [0, 0.105, 0.005];

export function headCentre(b: MeshBuilder): P {
  return b.at('head', HEAD_C[0], HEAD_C[1], HEAD_C[2]);
}

/** Head-bone point on the face surface at (dx, dy) from the head centre, pushed out by `out`. */
export function facePt(b: MeshBuilder, dx: number, dy: number, out = 0): P {
  const k = 1 - (dx / HEAD_R[0]) ** 2 - (dy / HEAD_R[1]) ** 2;
  return b.at('head', dx, HEAD_C[1] + dy, HEAD_C[2] + HEAD_R[2] * Math.sqrt(Math.max(0, k)) + out);
}

/** Tube a→c whose first `t` of the length is `covered` (grown by `grow`), the rest `bare`. */
export function splitTube(
  b: MeshBuilder, bone: BoneName, a: P, c: P, r0: number, r1: number,
  t: number, covered: number, bare: number, grow: number, o: TubeOpts = {},
): void {
  const k = Math.min(1, Math.max(0, t));
  const m = MeshBuilder.mix(a, c, k);
  const rm = r0 + (r1 - r0) * k;
  if (k > 0) b.tube(bone, a, m, r0 + grow, rm + grow, covered, o);
  if (k < 1) b.tube(bone, m, c, rm, r1, bare, o);
}

const UPPER_ARM = 0.54;
const THIGH = 0.51;
const EYE_WHITE = 0xf2f0ea;
const IRIS = 0x1a1410;
const LIPS = 0x6e2a2a;

export function buildBody(b: MeshBuilder, look: Look, d: Dress): void {
  const w = b.p.w;
  const skin = look.skinTone;
  torso(b, look, d, w);
  b.tube('neck', b.at('neck', 0, -0.04), b.at('neck', 0, 0.09), 0.052, 0.048, skin, { sides: 8 });
  b.ball('head', headCentre(b), HEAD_R, skin, { segs: 12 });
  face(b, look);
  for (const side of ['L', 'R'] as const) {
    arm(b, side, d, skin, w.limb);
    leg(b, side, d, skin, w.limb, look.shoeColor ?? 0x1a1a1a);
  }
}

function torso(b: MeshBuilder, look: Look, d: Dress, w: WidthFactors): void {
  const [pelvis, ...upper] = torsoSections(w);
  b.tube(pelvis.bone, b.at(pelvis.bone, 0, pelvis.y0), b.at(pelvis.bone, 0, pelvis.y1), pelvis.r0, pelvis.r1, d.pants, { depth: pelvis.depth });
  for (const s of upper) {
    const t = s.bone === 'chest' ? (d.neckline - s.y0) / (s.y1 - s.y0) : 1;
    splitTube(b, s.bone, b.at(s.bone, 0, s.y0), b.at(s.bone, 0, s.y1), s.r0, s.r1, t, d.torso, look.skinTone, 0, { depth: s.depth });
  }
  if (!look.female) return;
  for (const x of [0.058, -0.058]) b.ball('chest', b.at('chest', x * w.torso, 0.085, 0.066 * w.depth), [0.058, 0.045, 0.03], d.torso);
}

function arm(b: MeshBuilder, side: 'L' | 'R', d: Dress, skin: number, limb: number): void {
  const up = `upperArm${side}` as const;
  const fore = `forearm${side}` as const;
  const hand = `hand${side}` as const;
  const x = side === 'L' ? 1 : -1;
  const tu = d.arm / UPPER_ARM;
  const tf = (d.arm - UPPER_ARM) / (1 - UPPER_ARM);
  b.ball(up, b.at(up), [0.058 * limb, 0.058 * limb, 0.058 * limb], d.arm > 0 ? d.sleeve : skin, { segs: 8 });
  splitTube(b, up, b.at(up), b.at(fore), 0.052 * limb, 0.043 * limb, tu, d.sleeve, skin, 0.006, { sides: 8 });
  b.ball(fore, b.at(fore), [0.042 * limb, 0.042 * limb, 0.042 * limb], tf > 0 ? d.sleeve : skin, { segs: 8 });
  splitTube(b, fore, b.at(fore), b.at(hand), 0.042 * limb, 0.032 * limb, tf, d.sleeve, skin, 0.006, { sides: 8 });
  const h = Math.sqrt(limb);
  b.box(hand, b.at(hand, 0, -0.058, 0.004), [0.05 * h, 0.1, 0.085 * h], skin);
  b.box(hand, b.at(hand, -0.012 * x, -0.035, 0.046 * h), [0.022, 0.05, 0.022], shade(skin, 0.95));
}

function leg(b: MeshBuilder, side: 'L' | 'R', d: Dress, skin: number, limb: number, shoe: number): void {
  const thigh = `thigh${side}` as const;
  const shin = `shin${side}` as const;
  const foot = `foot${side}` as const;
  const tt = d.leg / THIGH;
  const ts = (d.leg - THIGH) / (1 - THIGH);
  splitTube(b, thigh, b.at(thigh), b.at(shin), 0.078 * limb, 0.055 * limb, tt, d.pants, skin, 0.008, { sides: 9 });
  b.ball(shin, b.at(shin), [0.055 * limb, 0.055 * limb, 0.055 * limb], ts > 0 ? d.pants : skin, { segs: 8 });
  splitTube(b, shin, b.at(shin), b.at(foot), 0.052 * limb, 0.038 * limb, ts, d.pants, skin, 0.008, { sides: 9 });
  const f = Math.sqrt(limb);
  b.box(foot, b.at(foot, 0, -0.035, 0.07), [0.1 * f, 0.07, 0.26], shoe);
  b.box(foot, b.at(foot, 0, -0.066, 0.07), [0.104 * f, 0.012, 0.265], shade(shoe, 0.55));
}

function face(b: MeshBuilder, look: Look): void {
  const skin = look.skinTone;
  for (const x of [1, -1]) {
    const ex = 0.032 * x;
    b.ball('head', facePt(b, ex, 0.012, -0.004), [0.013, 0.008, 0.006], EYE_WHITE, { segs: 6 });
    b.ball('head', facePt(b, ex, 0.012, 0.001), [0.0065, 0.0065, 0.004], IRIS, { segs: 6 });
    b.box('head', facePt(b, 0.033 * x, 0.034, 0.002), [0.032, 0.0065, 0.008], look.hairColor, { rot: [0, 0, 0.14 * x] });
    b.ball('head', b.at('head', (HEAD_R[0] - 0.002) * x, HEAD_C[1] - 0.005, -0.008), [0.012, 0.027, 0.02], shade(skin, 0.95), { segs: 6 });
  }
  b.ball('head', facePt(b, 0, -0.018, -0.004), [0.011, 0.024, 0.016], shade(skin, 0.93), { segs: 6 });
  b.box('head', facePt(b, 0, -0.052, -0.002), [0.032, 0.006, 0.008], LIPS);
}
