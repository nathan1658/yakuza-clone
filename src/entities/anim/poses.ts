/**
 * Pose authoring helpers and the shared base poses every clip file builds on.
 * All values follow the rig conventions in core/types.ts; root offsets are in
 * metres for a REF_HEIGHT character (the animator scales them).
 */
import { Euler, Quaternion, Vector3 } from 'three';
import type { AnimClipDef, AnimKeyframe, BoneName, EaseName, Pose } from '../../core/types';
import { REF_HEIGHT, SEG } from '../rig/skeleton';
import { ARM, armIK, legIK, type Euler3 } from './ik';

const MIRROR: Record<BoneName, BoneName> = {
  hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head',
  upperArmL: 'upperArmR', forearmL: 'forearmR', handL: 'handR',
  upperArmR: 'upperArmL', forearmR: 'forearmL', handR: 'handL',
  thighL: 'thighR', shinL: 'shinR', footL: 'footR',
  thighR: 'thighL', shinR: 'shinL', footR: 'footL',
};

/** Left/right mirror image of a pose (reflection through the X = 0 plane). */
export function mirrorPose(p: Pose): Pose {
  const out: Pose = {};
  for (const b of Object.keys(MIRROR) as BoneName[]) {
    const r = p[b];
    if (r) out[MIRROR[b]] = [r[0], -r[1], -r[2]];
  }
  if (p.rootOffset) out.rootOffset = [-p.rootOffset[0], p.rootOffset[1], p.rootOffset[2]];
  return out;
}

export function mirrorClip(def: AnimClipDef, name: string): AnimClipDef {
  return { ...def, name, keys: def.keys.map((k) => ({ ...k, pose: mirrorPose(k.pose) })) };
}

export const key = (t: number, pose: Pose, ease?: EaseName): AnimKeyframe => (ease ? { t, pose, ease } : { t, pose });

export function clip(name: string, duration: number, loop: boolean, keys: AnimKeyframe[], impactAt?: number): AnimClipDef {
  return impactAt === undefined ? { name, duration, loop, keys } : { name, duration, loop, keys, impactAt };
}

/**
 * Right arm from a wrist target relative to the right shoulder (chest frame,
 * metres; -X is outward for the right arm). `hand` is the wrist rotation.
 */
export function armR(wrist: Euler3, pole: Euler3, hand: Euler3 = [0, 0, 0]): Pose {
  const s = armIK(wrist, pole);
  return { upperArmR: s.upper, forearmR: s.fore, handR: hand };
}

/** Left arm, authored in the same (unmirrored) chest frame: +X is outward. */
export function armL(wrist: Euler3, pole: Euler3, hand: Euler3 = [0, 0, 0]): Pose {
  return mirrorPose(armR([-wrist[0], wrist[1], wrist[2]], [-pole[0], pole[1], pole[2]], [hand[0], -hand[1], -hand[2]]));
}

/** Ankle height above the ground for a REF_HEIGHT character. */
export const ANKLE = SEG.ankle * REF_HEIGHT;
const HIP_JOINT: Euler3 = [SEG.hipX * REF_HEIGHT, SEG.hipY * REF_HEIGHT, 0];
const HIPS_Y = SEG.hipsY * REF_HEIGHT;

export interface FootPlant {
  /** Ankle position in character space (y = height above the ground). */
  at: Euler3;
  /** Sole pitch, + = toes down (heel raised). */
  pitch?: number;
  /** Foot yaw; default = hips yaw with a slight toe-out. */
  yaw?: number;
}

const _qh = new Quaternion();
const _qc = new Quaternion();
const _qw = new Quaternion();
const _v = new Vector3();
const _eu = new Euler();

function quat(e: Readonly<Euler3>, order: 'XYZ' | 'YXZ' = 'XYZ'): Quaternion {
  return new Quaternion().setFromEuler(_eu.set(e[0], e[1], e[2], order));
}

/** Leg rotations that plant both ankles at the given spots for this hips pose. */
export function legs(hips: Euler3, root: Euler3, l: FootPlant, r: FootPlant): Pose {
  _qh.setFromEuler(_eu.set(hips[0], hips[1], hips[2], 'XYZ'));
  const inv = _qh.clone().invert();
  const out: Pose = {};
  const plant = (side: 'L' | 'R', f: FootPlant): void => {
    const s = side === 'L' ? 1 : -1;
    _v.set(f.at[0] - root[0], f.at[1] - HIPS_Y - root[1], f.at[2] - root[2]).applyQuaternion(inv);
    const sol = legIK(_v.x - s * HIP_JOINT[0], _v.y - HIP_JOINT[1], _v.z - HIP_JOINT[2]);
    _qc.copy(_qh).multiply(quat(sol.thigh)).multiply(quat(sol.shin)).invert();
    _qw.copy(quat([f.pitch ?? 0, f.yaw ?? hips[1] + s * 0.08, 0], 'YXZ'));
    _eu.setFromQuaternion(_qc.multiply(_qw), 'XYZ');
    out[`thigh${side}`] = sol.thigh;
    out[`shin${side}`] = sol.shin;
    out[`foot${side}`] = [_eu.x, _eu.y, _eu.z];
  };
  plant('L', l);
  plant('R', r);
  return out;
}

const SHOULDER: Record<'L' | 'R', Euler3> = {
  L: [SEG.shoulderX * REF_HEIGHT, SEG.shoulderY * REF_HEIGHT, -0.005 * REF_HEIGHT],
  R: [-SEG.shoulderX * REF_HEIGHT, SEG.shoulderY * REF_HEIGHT, -0.005 * REF_HEIGHT],
};
const ZERO: Euler3 = [0, 0, 0];
const _qs = new Quaternion();
const _sh = new Vector3();
const _w = new Vector3();

/**
 * IK arm target in character space (feet at the origin). Without `ext`, `at`
 * is the wrist position; with it, `at` is an aim point and the wrist goes
 * `ext` × arm length from the shoulder towards it (straight punches).
 */
export interface ArmTarget {
  at: Euler3;
  pole: Euler3;
  hand?: Euler3;
  ext?: number;
}

/** Arm rotations that put the wrist at a character-space point for the given torso pose. */
export function reach(torso: Pose, side: 'L' | 'R', a: ArmTarget): Pose {
  const root = torso.rootOffset ?? ZERO;
  _sh.set(root[0], HIPS_Y + root[1], root[2]);
  _qs.copy(quat(torso.hips ?? ZERO));
  _sh.add(_v.set(0, SEG.spine * REF_HEIGHT, 0).applyQuaternion(_qs));
  _qs.multiply(quat(torso.spine ?? ZERO));
  _sh.add(_v.set(0, SEG.chest * REF_HEIGHT, 0).applyQuaternion(_qs));
  _qs.multiply(quat(torso.chest ?? ZERO));
  _sh.add(_v.fromArray(SHOULDER[side]).applyQuaternion(_qs));
  _qs.invert();
  _w.fromArray(a.at).sub(_sh);
  if (a.ext !== undefined) _w.setLength(a.ext * (ARM.upper + ARM.lower));
  _w.applyQuaternion(_qs);
  _v.fromArray(a.pole).applyQuaternion(_qs);
  const solve = side === 'L' ? armL : armR;
  return solve([_w.x, _w.y, _w.z], [_v.x, _v.y, _v.z], a.hand);
}

/**
 * Whole-body key pose in character space. Feet are IK-planted (omit them only
 * when the hips stay at rest height); arms are either IK targets or explicit
 * bone rotations (e.g. GUARD_L, which rides along with the chest).
 */
export interface BodySpec {
  root?: Euler3;
  hips?: Euler3;
  spine?: Euler3;
  chest?: Euler3;
  neck?: Euler3;
  head?: Euler3;
  feet?: readonly [FootPlant, FootPlant];
  armL?: ArmTarget | Pose;
  armR?: ArmTarget | Pose;
}

export function body(s: BodySpec): Pose {
  const torso: Pose = {
    rootOffset: s.root ?? ZERO,
    hips: s.hips ?? ZERO,
    spine: s.spine ?? ZERO,
    chest: s.chest ?? ZERO,
    neck: s.neck ?? ZERO,
    head: s.head ?? ZERO,
  };
  const arm = (side: 'L' | 'R', a?: ArmTarget | Pose): Pose => (!a ? {} : 'at' in a ? reach(torso, side, a) : a);
  return {
    ...STAND,
    ...torso,
    ...(s.feet && legs(torso.hips!, torso.rootOffset!, s.feet[0], s.feet[1])),
    ...arm('L', s.armL),
    ...arm('R', s.armR),
  };
}

const OUT_DOWN_R: Euler3 = [-0.35, -1, -0.1];
const OUT_DOWN_L: Euler3 = [0.35, -1, -0.1];

/** Relaxed standing: arms hang with a slight bend. */
export const STAND: Pose = {
  upperArmL: [0.02, 0, 0.07], forearmL: [-0.14, 0, 0], handL: [0, 0, 0.05],
  upperArmR: [0.02, 0, -0.07], forearmR: [-0.14, 0, 0], handR: [0, 0, -0.05],
};

/** Boxing guard (chest frame, so it follows the torso): fists at chin height, elbows tucked. */
export const GUARD_L: Pose = armL([-0.08, 0.06, 0.3], OUT_DOWN_L, [0.2, -0.6, 0]);
export const GUARD_R: Pose = armR([0.1, 0.04, 0.22], OUT_DOWN_R, [0.2, 0.6, 0]);
export const GUARD_ARMS: Pose = { ...GUARD_L, ...GUARD_R };

const STANCE_HIPS: Euler3 = [0, -0.35, 0];
const STANCE_ROOT: Euler3 = [0, -0.07, 0];
/** Orthodox stance foot plants (left forward). */
export const STANCE_FEET: readonly [FootPlant, FootPlant] = [
  { at: [0.13, ANKLE, 0.19], yaw: -0.12 },
  { at: [-0.15, ANKLE + 0.03, -0.2], yaw: -0.7, pitch: 0.25 },
];
/** Relaxed standing foot plants. */
export const NEUTRAL_FEET: readonly [FootPlant, FootPlant] = [{ at: [0.1, ANKLE, 0] }, { at: [-0.1, ANKLE, 0] }];

/** Orthodox fighting stance: left foot forward, bladed, knees bent, guard up. */
export const FIGHT: Readonly<BodySpec> = {
  root: STANCE_ROOT,
  hips: STANCE_HIPS,
  spine: [0.1, 0.1, 0],
  chest: [0.06, 0.06, 0],
  feet: STANCE_FEET,
  armL: GUARD_L,
  armR: GUARD_R,
};

/**
 * Neck and head that cancel most of the torso's yaw and pitch, so a fighter
 * keeps his eyes on the opponent however much he twists into a strike.
 */
export function gaze(s: BodySpec, pitch = 0): Pick<BodySpec, 'neck' | 'head'> {
  const sum = (i: number): number => (s.hips?.[i] ?? 0) + (s.spine?.[i] ?? 0) + (s.chest?.[i] ?? 0);
  const yaw = sum(1);
  const tilt = sum(0) - pitch;
  return { neck: [-tilt * 0.6, -yaw * 0.55, 0], head: [-tilt * 0.4, -yaw * 0.45, 0] };
}

/** A key pose that differs from the fighting stance only where specified; eyes stay on the target. */
export function fight(over: BodySpec): Pose {
  const s = { ...FIGHT, ...over };
  return body({ ...gaze(s), ...s });
}

export const FIGHT_STANCE: Pose = fight({});

/** Supine on the ground, head towards -Z; the end state of knockdown/thrown. */
export const LYING: Pose = {
  rootOffset: [0, -0.83, -0.45],
  hips: [-Math.PI / 2, 0, 0],
  spine: [0.04, 0, 0],
  chest: [0.02, 0, 0],
  neck: [0.1, 0, 0],
  head: [0.08, 0.35, 0],
  upperArmL: [-0.1, 0, 0.55], forearmL: [-0.5, 0, 0],
  upperArmR: [0.1, 0, -0.35], forearmR: [-0.2, 0, 0],
  thighL: [-0.25, 0, 0.12], shinL: [0.5, 0, 0], footL: [0.5, 0, 0],
  thighR: [0.02, 0, -0.1], shinR: [0.08, 0, 0], footR: [0.9, 0, 0],
};
