/**
 * Locomotion clips. Gait clips carry a reference ground speed: the Character
 * scales playback rate by actualSpeed / LOCO_SPEED[clip] so feet don't skate.
 */
import type { AnimClip, AnimClipDef, Pose } from '../../../core/types';
import { gaitClip, type GaitParams } from '../gait';
import { FIGHT_STANCE, GUARD_ARMS, STAND, clip, fight, key } from '../poses';

export const WALK: GaitParams = {
  name: 'walk', period: 1.05, duty: 0.6, speed: 1.5, dir: [0, 1], front: 0.5,
  lift: 0.09, hipDrop: 0.02, bob: 0.018, sway: 0.02, hipYaw: 0.12, lean: 0.02, spineLean: 0.02,
  chestTwist: 0.1, armSwing: 0.32, elbow: -0.22, elbowPump: 0.22, armOut: 0.08, heelLift: 0.4, keys: 16,
};

const RUN: GaitParams = {
  name: 'run', period: 0.68, duty: 0.3, speed: 4.5, dir: [0, 1], front: 0.42,
  lift: 0.2, hipDrop: 0.06, bob: -0.03, sway: 0.012, hipYaw: 0.2, lean: 0.1, spineLean: 0.06,
  chestTwist: 0.24, armSwing: 0.7, elbow: -1.35, elbowPump: 0.3, armOut: 0.12, heelLift: 0.7, keys: 16,
};

const SPRINT: GaitParams = {
  name: 'sprint', period: 0.58, duty: 0.24, speed: 6.8, dir: [0, 1], front: 0.4,
  lift: 0.3, hipDrop: 0.07, bob: -0.035, sway: 0.01, hipYaw: 0.24, lean: 0.22, spineLean: 0.08,
  chestTwist: 0.3, armSwing: 1.0, elbow: -1.45, elbowPump: 0.25, armOut: 0.1, heelLift: 0.9, keys: 16,
};

/** Guard stays up while shuffling; the torso bobs slightly with the steps. */
const guardUpper = (p: number): Pose => ({
  ...GUARD_ARMS,
  spine: [0.1 + 0.02 * Math.cos(4 * Math.PI * p), 0.1, 0],
  chest: FIGHT_STANCE.chest,
  neck: FIGHT_STANCE.neck,
  head: FIGHT_STANCE.head,
});

const combatStep = (name: string, dir: [number, number], speed: number): GaitParams => ({
  name, period: 0.52, duty: 0.55, speed, dir, front: 0.5,
  lift: 0.06, hipDrop: 0.07, bob: 0.012, sway: 0, hipYaw: 0, lean: 0, spineLean: 0,
  chestTwist: 0, armSwing: 0, elbow: 0, elbowPump: 0, armOut: 0, heelLift: 0.15, keys: 12,
  feet: { L: [0.13, 0.19], R: [-0.15, -0.2] }, hipsYaw0: -0.35, upper: guardUpper,
});

/** Panicked run: arms thrown up around the head, glancing back. */
const FLEE: GaitParams = {
  ...RUN, name: 'flee', speed: 4, period: 0.62, lean: 0.14,
  upper: (p) => {
    const w = Math.sin(2 * Math.PI * p);
    return {
      spine: [0.1, 0, 0],
      chest: [0.05, 0.12 * w, 0],
      neck: [-0.1, 0.5 * Math.max(0, Math.sin(Math.PI * p)), 0],
      head: [-0.05, 0.3 * Math.max(0, Math.sin(Math.PI * p)), 0],
      upperArmL: [-2.1 + 0.25 * w, 0, 0.5], forearmL: [-1.3, 0, 0], handL: [0, 0, 0.2],
      upperArmR: [-2.1 - 0.25 * w, 0, -0.5], forearmR: [-1.3, 0, 0], handR: [0, 0, -0.2],
    };
  },
};

const breathe = (a: number): Pose => ({
  ...STAND,
  spine: [0.01 * a, 0, 0],
  chest: [-0.02 * a, 0, 0],
  neck: [0.01 * a, 0, 0],
  upperArmL: [0.02, 0, 0.07 + 0.015 * a],
  upperArmR: [0.02, 0, -0.07 - 0.015 * a],
  thighL: [0, 0, 0.02], thighR: [0, 0, -0.02],
  footL: [0, 0, -0.02], footR: [0, 0, 0.02],
});

/** Knees pump the hips up and down (feet stay planted); the guard rises and falls with it. */
const bounce = (y: number, g: number): Pose => {
  const p = fight({ root: [0, -0.07 + y, 0] });
  const [lx, ly, lz] = p.upperArmL!;
  const [rx, ry, rz] = p.upperArmR!;
  return { ...p, upperArmL: [lx + g, ly, lz], upperArmR: [rx - g, ry, rz] };
};

const GAITS: GaitParams[] = [
  WALK,
  RUN,
  SPRINT,
  combatStep('combatWalkF', [0, 1], 2.4),
  combatStep('combatWalkB', [0, -1], 2.2),
  combatStep('combatWalkL', [1, 0], 2.0),
  combatStep('combatWalkR', [-1, 0], 2.0),
  FLEE,
];

export const LOCOMOTION_CLIPS: AnimClipDef[] = [
  clip('idle', 3.2, true, [key(0, breathe(-1), 'inOutQuad'), key(0.5, breathe(1), 'inOutQuad')]),
  clip('combatIdle', 0.9, true, [key(0, bounce(0.012, 0.03), 'inOutQuad'), key(0.5, bounce(-0.012, -0.03), 'inOutQuad')]),
  ...GAITS.map(gaitClip),
];

/**
 * Ground speed (m/s) of each gait clip at playback rate 1. Every gait clip
 * lands a foot at normalised times 0 (left) and 0.5 (right).
 */
export const LOCO_SPEED: Partial<Record<AnimClip, number>> = Object.fromEntries(GAITS.map((g) => [g.name, g.speed]));
