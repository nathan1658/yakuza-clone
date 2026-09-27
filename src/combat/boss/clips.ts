/**
 * 烏鴉's own clips: the phase-change roar and the grab's arms-wide tell.
 * (The kneel is combat/clips.ts KNEEL; the table heave is b_tableFlip's
 * throwToss windup, stretched by the move's telegraph.)
 * Rig: bind faces +Z, limbs down; Euler XYZ relative to bind. Arms/thighs
 * X− swing forward, upperArmL Z+ / upperArmR Z− raise sideways, forearm X−
 * flexes, shin X+ bends the knee, spine X+ leans forward. A crouch of thigh −a /
 * shin +2a keeps the foot under the hip and drops it ≈ 0.88·(1 − cos a).
 * Module-level constants: the animator recognises a clip by object identity.
 */
import type { AnimClipDef, Pose } from '../../core/types';

/** Guard up, knees soft. */
const STAND: Pose = {
  rootOffset: [0, -0.03, 0],
  spine: [0.08, 0, 0],
  upperArmL: [-0.35, 0, 0.12],
  forearmL: [-1.5, 0, 0],
  upperArmR: [-0.35, 0, -0.12],
  forearmR: [-1.5, 0, 0],
  thighL: [-0.25, 0, 0],
  shinL: [0.5, 0, 0],
  thighR: [-0.25, 0, 0],
  shinR: [0.5, 0, 0],
};

/** Hunched, fists curled to the chest: the breath before the roar. */
const GATHER: Pose = {
  rootOffset: [0, -0.09, 0],
  spine: [0.4, 0, 0],
  chest: [0.2, 0, 0],
  neck: [0.15, 0, 0],
  head: [0.2, 0, 0],
  upperArmL: [-0.2, 0, 0.3],
  forearmL: [-2.0, 0, 0],
  upperArmR: [-0.2, 0, -0.3],
  forearmR: [-2.0, 0, 0],
  thighL: [-0.45, 0, 0],
  shinL: [0.9, 0, 0],
  thighR: [-0.45, 0, 0],
  shinR: [0.9, 0, 0],
};

/** Chest out, head back, arms flung wide and down. */
const ROARING: Pose = {
  rootOffset: [0, -0.01, -0.03],
  spine: [-0.25, 0, 0],
  chest: [-0.2, 0, 0],
  neck: [-0.2, 0, 0],
  head: [-0.35, 0, 0],
  upperArmL: [0.35, 0, 0.75],
  forearmL: [-0.5, 0, 0],
  upperArmR: [0.35, 0, -0.75],
  forearmR: [-0.5, 0, 0],
  thighL: [-0.15, 0, 0],
  shinL: [0.3, 0, 0],
  thighR: [-0.15, 0, 0],
  shinR: [0.3, 0, 0],
};

const ROARING_2: Pose = { ...ROARING, spine: [-0.3, 0, 0], head: [-0.4, 0.1, 0] };

export const ROAR: AnimClipDef = {
  name: 'boss_roar',
  duration: 1.2,
  loop: false,
  keys: [
    { t: 0, pose: STAND, ease: 'outCubic' },
    { t: 0.18, pose: GATHER, ease: 'outBack' },
    { t: 0.38, pose: ROARING, ease: 'inOutQuad' },
    { t: 0.75, pose: ROARING_2, ease: 'inOutQuad' },
    { t: 1, pose: STAND },
  ],
};

/** Low and wide, arms spread: the tell before the grab. */
const SPREAD: Pose = {
  rootOffset: [0, -0.11, -0.02],
  spine: [0.35, 0, 0],
  chest: [0.1, 0, 0],
  head: [-0.25, 0, 0],
  upperArmL: [-0.7, 0, 1.0],
  forearmL: [-0.5, 0, 0],
  upperArmR: [-0.7, 0, -1.0],
  forearmR: [-0.5, 0, 0],
  thighL: [-0.5, 0, 0],
  shinL: [1.0, 0, 0],
  thighR: [-0.5, 0, 0],
  shinR: [1.0, 0, 0],
};

/** Lunging in, both arms reaching for the collar. */
const LUNGE: Pose = {
  rootOffset: [0, -0.1, 0.12],
  spine: [0.55, 0, 0],
  chest: [0.15, 0, 0],
  head: [-0.35, 0, 0],
  upperArmL: [-1.45, 0, 0.3],
  forearmL: [-0.35, 0, 0],
  upperArmR: [-1.45, 0, -0.3],
  forearmR: [-0.35, 0, 0],
  thighL: [-0.8, 0, 0],
  shinL: [0.9, 0, 0],
  thighR: [0.3, 0, 0],
  shinR: [0.5, 0, 0],
};

/** Played over windup + lunge (BossBrain GRAB): the spread holds, then the snap. */
export const GRAB_REACH: AnimClipDef = {
  name: 'boss_grabReach',
  duration: 0.75,
  loop: false,
  keys: [
    { t: 0, pose: STAND, ease: 'outCubic' },
    { t: 0.55, pose: SPREAD, ease: 'linear' },
    { t: 0.67, pose: SPREAD, ease: 'outCubic' },
    { t: 1, pose: LUNGE },
  ],
};
