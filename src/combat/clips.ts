/**
 * The two poses combat needs that the shared clip library lacks: 烏鴉 down on
 * one knee waiting for the finisher, and a knockout that starts from the
 * floor (a body already lying there must not stand up to fall again).
 * Module-level constants: the animator recognises a clip by object identity.
 */
import type { AnimClipDef, Pose } from '../core/types';

/** Flat on the back, as the library's knockdown ends. */
const LYING: Pose = {
  rootOffset: [0, -0.83, -0.45],
  hips: [-Math.PI / 2, 0, 0],
  spine: [0.04, 0, 0],
  chest: [0.02, 0, 0],
  neck: [0.1, 0, 0],
  head: [0.08, 0.35, 0],
  upperArmL: [-0.1, 0, 0.55],
  forearmL: [-0.5, 0, 0],
  upperArmR: [0.1, 0, -0.35],
  forearmR: [-0.2, 0, 0],
  thighL: [-0.25, 0, 0.12],
  shinL: [0.5, 0, 0],
  footL: [0.5, 0, 0],
  thighR: [0.02, 0, -0.1],
  shinR: [0.08, 0, 0],
  footR: [0.9, 0, 0],
};

/** Out cold: limbs thrown wide, head lolled to the side. */
const KO_LYING: Pose = {
  ...LYING,
  neck: [0.05, 0.2, 0],
  head: [0.05, 0.7, 0.1],
  upperArmL: [-0.3, 0, 1.25],
  forearmL: [-0.35, 0, 0],
  handL: [0, 0, 0.3],
  upperArmR: [0.1, 0, -1.35],
  forearmR: [-0.2, 0, 0],
  handR: [0, 0, -0.3],
  thighL: [-0.1, 0, 0.25],
  shinL: [0.25, 0, 0],
  footL: [0.7, 0, 0],
  thighR: [-0.05, 0, -0.2],
  shinR: [0.05, 0, 0],
  footR: [0.9, 0, 0],
};

/** Right knee on the ground, left foot planted, head hanging. */
const KNEEL_OUT: Pose = {
  rootOffset: [0, -0.46, 0],
  thighL: [-1.57, 0, 0],
  shinL: [1.57, 0, 0],
  thighR: [0, 0, 0],
  shinR: [1.57, 0, 0],
  footR: [0.5, 0, 0],
  spine: [0.35, 0, 0],
  chest: [0.15, 0, 0],
  neck: [0.3, 0, 0],
  head: [0.35, 0, 0],
  upperArmL: [-0.5, 0, 0.15],
  forearmL: [-1.0, 0, 0],
  upperArmR: [0.1, 0, -0.15],
  forearmR: [-0.3, 0, 0],
};

/** Heaving for breath: the back rounds a little more. */
const KNEEL_IN: Pose = { ...KNEEL_OUT, spine: [0.4, 0, 0], neck: [0.35, 0, 0] };

export const KNEEL: AnimClipDef = {
  name: 'combat_kneel',
  duration: 2.4,
  loop: true,
  keys: [
    { t: 0, pose: KNEEL_OUT, ease: 'inOutQuad' },
    { t: 0.5, pose: KNEEL_IN, ease: 'inOutQuad' },
    { t: 1, pose: KNEEL_OUT },
  ],
};

export const KO_DOWN: AnimClipDef = {
  name: 'combat_koDown',
  duration: 0.6,
  loop: false,
  keys: [
    { t: 0, pose: LYING, ease: 'outQuad' },
    { t: 1, pose: KO_LYING },
  ],
};
