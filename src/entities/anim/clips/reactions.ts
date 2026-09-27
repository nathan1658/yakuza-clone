/**
 * Defence, dodges and hit reactions. Recoverable reactions return to the
 * fighting stance; knockdown, thrown and ko end lying on the back (LYING, head
 * towards -Z, hips 0.45 m behind the capsule) where downed and getUp pick up.
 */
import type { AnimClipDef, Pose } from '../../../core/types';
import type { Euler3 } from '../ik';
import {
  ANKLE, FIGHT_STANCE, GUARD_L, LYING, STANCE_FEET, body, clip, fight, gaze, key,
  type ArmTarget, type BodySpec, type FootPlant,
} from '../poses';

const STANCE = FIGHT_STANCE;
const [LEAD, REAR] = STANCE_FEET;

// --- Guard -----------------------------------------------------------------

/** Forearms up in front of the face, palms out, chin tucked. */
const COVER_L: ArmTarget = { at: [0.08, 1.56, 0.24], pole: [0.3, -1, 0.2], hand: [0, -1.2, 0] };
const COVER_R: ArmTarget = { at: [-0.08, 1.55, 0.22], pole: [-0.3, -1, 0.2], hand: [0, 1.2, 0] };
const GUARD: BodySpec = {
  root: [0, -0.12, 0], hips: [0.05, -0.3, 0], spine: [0.2, 0.08, 0], chest: [0.1, 0.05, 0],
  armL: COVER_L, armR: COVER_R,
};
const guardPose = (over: BodySpec = {}, tuck = 0.25): Pose => {
  const s = { ...GUARD, ...over };
  return fight({ ...gaze(s, tuck), ...s });
};

const guard = clip('guard', 1.0, true, [
  key(0, guardPose(), 'inOutQuad'),
  key(0.5, guardPose({ root: [0, -0.13, 0], spine: [0.22, 0.08, 0] }), 'inOutQuad'),
]);

const guardHit = clip('guardHit', 0.25, false, [
  key(0, guardPose(), 'outCubic'),
  key(0.3, guardPose({
    root: [0, -0.14, -0.07], spine: [0.08, 0.1, 0], chest: [0, 0.05, 0],
    armL: { ...COVER_L, at: [0.07, 1.58, 0.18] }, armR: { ...COVER_R, at: [-0.07, 1.57, 0.16] },
  }, 0.4), 'inOutQuad'),
  key(1, guardPose()),
]);

// --- Dodges: a low hop; feet leave the ground while the body travels ---------

/**
 * `dir` is the travel direction in character space (x, z). Feet trail the
 * motion in the air and land ahead of it, then the stance settles back.
 */
function dodge(name: string, dir: [number, number], duck: number): AnimClipDef {
  const [dx, dz] = dir;
  const lean: Euler3 = [0.08 + dz * 0.25 + duck, -0.35, -dx * 0.25];
  const shift = (f: FootPlant, k: number, lift: number): FootPlant => ({
    ...f, at: [f.at[0] + dx * k, f.at[1] + lift, f.at[2] + dz * k], pitch: lift > 0 ? 0.3 : f.pitch,
  });
  const at = (k: number, lift: number): readonly [FootPlant, FootPlant] => [shift(LEAD, k, lift), shift(REAR, k, lift)];
  return clip(name, 0.45, false, [
    key(0, STANCE, 'outQuad'),
    key(0.15, fight({ root: [dx * 0.05, -0.2, dz * 0.05], hips: lean, spine: [0.15 + duck, 0.1, -dx * 0.1] }), 'outQuad'),
    key(0.45, fight({
      root: [dx * 0.04, -0.1, dz * 0.04], hips: lean, spine: [0.15 + duck, 0.1, -dx * 0.12], feet: at(-0.14, 0.12),
    }), 'inQuad'),
    key(0.7, fight({ root: [-dx * 0.03, -0.2, -dz * 0.03], hips: [0.1 + duck * 0.5, -0.35, 0], feet: at(0.1, 0) }), 'inOutQuad'),
    key(1, STANCE),
  ]);
}

const dodgeF = dodge('dodgeF', [0, 1], 0.3);
const dodgeB = dodge('dodgeB', [0, -1], 0);
const dodgeL = dodge('dodgeL', [1, 0], 0.1);
const dodgeR = dodge('dodgeR', [-1, 0], 0.1);

// --- Standing reactions ------------------------------------------------------

/** Fists pulled in and knocked loose. */
const LOOSE_L: ArmTarget = { at: [0.25, 1.25, 0.15], pole: [1, -1, 0] };
const LOOSE_R: ArmTarget = { at: [-0.25, 1.22, 0.12], pole: [-1, -1, 0] };
const FLUNG_L: ArmTarget = { at: [0.45, 1.45, 0.1], pole: [0.5, -1, -0.5] };
const FLUNG_R: ArmTarget = { at: [-0.45, 1.4, 0.05], pole: [-0.5, -1, -0.5] };

const hitLight = clip('hitLight', 0.35, false, [
  key(0, STANCE, 'outCubic'),
  key(0.25, fight({
    root: [0, -0.1, -0.05], spine: [-0.05, 0.3, 0.05], chest: [-0.1, 0.12, 0],
    neck: [-0.35, 0.3, 0.1], head: [-0.2, 0.2, 0], armL: GUARD_L, armR: LOOSE_R,
  }), 'inOutQuad'),
  key(1, STANCE),
]);

const hitHeavy = clip('hitHeavy', 0.55, false, [
  key(0, STANCE, 'outCubic'),
  key(0.2, fight({
    root: [0, -0.06, -0.14], hips: [-0.2, -0.3, 0], spine: [-0.25, 0.2, 0], chest: [-0.15, 0.1, 0],
    neck: [-0.4, 0.2, 0], head: [-0.2, 0, 0], armL: FLUNG_L, armR: FLUNG_R,
    feet: [{ ...LEAD, at: [0.13, ANKLE + 0.05, 0.12], pitch: -0.3 }, REAR],
  }), 'inOutQuad'),
  key(0.5, fight({
    root: [0, -0.16, -0.1], hips: [0.15, -0.3, 0], spine: [0.35, 0.05, 0], chest: [0.15, 0, 0],
    neck: [-0.2, 0.1, 0], head: [-0.1, 0, 0], armL: LOOSE_L, armR: LOOSE_R,
    feet: [{ ...LEAD, at: [0.13, ANKLE, 0.05] }, REAR],
  }), 'inOutQuad'),
  key(1, STANCE),
]);

const hitBack = clip('hitBack', 0.5, false, [
  key(0, STANCE, 'outCubic'),
  key(0.2, fight({
    root: [0, -0.04, 0.1], hips: [-0.15, -0.3, 0], spine: [-0.3, 0.1, 0], chest: [-0.15, 0, 0],
    neck: [-0.45, 0.1, 0], head: [-0.2, 0, 0],
    armL: { at: [0.4, 1.3, -0.25], pole: [0.5, -1, 0] }, armR: { at: [-0.4, 1.3, -0.25], pole: [-0.5, -1, 0] },
  }), 'inOutQuad'),
  key(0.5, fight({
    root: [0, -0.14, 0.12], hips: [0.2, -0.3, 0], spine: [0.3, 0.1, 0], chest: [0.1, 0, 0],
    armL: LOOSE_L, armR: LOOSE_R, feet: [{ ...LEAD, at: [0.13, ANKLE, 0.3] }, REAR],
  }), 'inOutQuad'),
  key(1, STANCE),
]);

/** Dazed: reels back a step, sways with the head lolling, then re-guards. */
const stagger = clip('stagger', 0.9, false, [
  key(0, STANCE, 'outCubic'),
  key(0.15, fight({
    root: [0, -0.06, -0.1], hips: [-0.15, -0.3, 0.05], spine: [-0.2, 0.2, 0], chest: [-0.1, 0.1, 0],
    neck: [-0.35, 0.3, 0.1], head: [-0.15, 0.1, 0], armL: FLUNG_L, armR: LOOSE_R,
  }), 'inOutQuad'),
  key(0.4, fight({
    root: [-0.05, -0.12, -0.18], hips: [0.05, -0.2, 0.15], spine: [0.1, 0, 0.1], chest: [0.05, 0, 0.08],
    neck: [0.2, -0.2, 0.2], head: [0.1, 0, 0.15], armL: LOOSE_L, armR: { at: [-0.22, 0.95, 0.05], pole: [-1, 0, 0] },
    feet: [{ ...LEAD, at: [0.15, ANKLE, 0.02] }, { ...REAR, at: [-0.2, ANKLE + 0.03, -0.3] }],
  }), 'inOutQuad'),
  key(0.65, fight({
    root: [0.04, -0.14, -0.14], hips: [0.1, -0.35, -0.12], spine: [0.2, 0.1, -0.08], chest: [0.05, 0, -0.05],
    neck: [0.25, 0.25, -0.2], head: [0.1, 0, -0.1], armL: LOOSE_L, armR: LOOSE_R,
    feet: [{ ...LEAD, at: [0.15, ANKLE, 0.02] }, { ...REAR, at: [-0.2, ANKLE + 0.03, -0.3] }],
  }), 'inOutQuad'),
  key(1, STANCE),
]);

// --- Falls and the ground ----------------------------------------------------

/** Raw bone values for airborne / grounded poses, where nothing is planted. */
const FALLING: Pose = {
  rootOffset: [0, -0.25, -0.3],
  hips: [-0.95, 0, 0], spine: [-0.1, 0, 0], chest: [-0.05, 0, 0], neck: [0.35, 0, 0], head: [0.2, 0, 0],
  upperArmL: [-1.9, 0, 0.5], forearmL: [-0.6, 0, 0], handL: [0, 0, 0.2],
  upperArmR: [-1.7, 0, -0.6], forearmR: [-0.8, 0, 0], handR: [0, 0, -0.2],
  thighL: [-0.9, 0, 0.1], shinL: [0.9, 0, 0], footL: [0.3, 0, 0],
  thighR: [-0.5, 0, -0.1], shinR: [0.5, 0, 0], footR: [0.4, 0, 0],
};

const SLAM: Pose = {
  ...LYING,
  rootOffset: [0, -0.84, -0.45],
  hips: [-1.66, 0, 0], neck: [-0.1, 0, 0], head: [-0.05, 0.1, 0],
  upperArmL: [-0.2, 0, 1.1], forearmL: [-0.2, 0, 0], upperArmR: [0.2, 0, -1.0], forearmR: [-0.2, 0, 0],
  thighL: [-0.45, 0, 0.12], shinL: [0.3, 0, 0], thighR: [-0.35, 0, -0.1], shinR: [0.3, 0, 0],
};

const BOUNCE: Pose = { ...LYING, rootOffset: [0, -0.8, -0.45], hips: [-1.5, 0, 0], neck: [0.25, 0, 0], head: [0.1, 0.2, 0] };

const knockdown = clip('knockdown', 0.8, false, [
  key(0, STANCE, 'outQuad'),
  key(0.15, fight({
    root: [0, -0.05, -0.1], hips: [-0.3, -0.2, 0], spine: [-0.2, 0.1, 0], chest: [-0.1, 0, 0],
    neck: [-0.4, 0, 0], head: [-0.2, 0, 0], armL: FLUNG_L, armR: FLUNG_R,
    feet: [{ ...LEAD, at: [0.13, ANKLE + 0.04, 0.12], pitch: -0.3 }, REAR],
  }), 'inQuad'),
  key(0.38, FALLING, 'inQuad'),
  key(0.6, SLAM, 'outQuad'),
  key(0.76, BOUNCE, 'inOutQuad'),
  key(1, LYING),
]);

/** Lying on the back, chest heaving. */
const downed = clip('downed', 1.6, true, [
  key(0, LYING, 'inOutQuad'),
  key(0.5, { ...LYING, spine: [-0.02, 0, 0], chest: [-0.04, 0, 0], neck: [0.16, 0, 0], head: [0.1, 0.2, 0] }, 'inOutQuad'),
]);

/** Sitting up from the back, one knee raised, the right hand pushing off the ground. */
const SIT_UP: Pose = {
  rootOffset: [0, -0.81, -0.38],
  hips: [-0.6, 0.1, 0], spine: [0.35, 0, 0], chest: [0.2, 0, 0], neck: [0.1, -0.1, 0], head: [0.05, 0, 0],
  upperArmL: [-0.6, 0, 0.3], forearmL: [-0.9, 0, 0], handL: [0, 0, 0.2],
  upperArmR: [0.5, 0, -0.35], forearmR: [-0.1, 0, 0], handR: [-1.2, 0, 0],
  thighL: [-1.8, 0, 0.1], shinL: [2.0, 0, 0], footL: [-0.2, 0, 0],
  thighR: [-1.0, 0, -0.15], shinR: [0.35, 0, 0], footR: [0.3, 0, 0],
};

const getUp = clip('getUp', 1.0, false, [
  key(0, LYING, 'inOutQuad'),
  key(0.3, SIT_UP, 'inOutQuad'),
  key(0.55, body({
    root: [0.02, -0.52, -0.15], hips: [0.55, 0.25, 0], spine: [0.25, 0, 0], chest: [0.1, 0, 0], neck: [-0.4, -0.1, 0],
    feet: [{ at: [0.13, ANKLE, 0.12] }, { at: [-0.12, 0.12, -0.42], pitch: 1.4 }],
    armL: { at: [0.18, 0.62, 0.22], pole: [1, 0, 0] }, armR: { at: [-0.3, 0.12, 0.05], pole: [-1, 0, -0.5] },
  }), 'inOutQuad'),
  key(0.8, fight({
    root: [0, -0.25, -0.02], hips: [0.4, -0.3, 0], spine: [0.25, 0.05, 0], armL: LOOSE_L, armR: LOOSE_R,
  }), 'inOutQuad'),
  key(1, STANCE),
]);

/** Out cold: limbs splayed, head rolled aside. */
const KO_LYING: Pose = {
  ...LYING,
  neck: [0.05, 0.2, 0], head: [0.05, 0.7, 0.1],
  upperArmL: [-0.3, 0, 1.25], forearmL: [-0.35, 0, 0], handL: [0, 0, 0.3],
  upperArmR: [0.1, 0, -1.35], forearmR: [-0.2, 0, 0], handR: [0, 0, -0.3],
  thighL: [-0.1, 0, 0.25], shinL: [0.25, 0, 0], footL: [0.7, 0, 0],
  thighR: [-0.05, 0, -0.2], shinR: [0.05, 0, 0], footR: [0.9, 0, 0],
};

const ko = clip('ko', 1.4, false, [
  key(0, STANCE, 'outQuad'),
  key(0.12, fight({
    root: [0, -0.06, -0.08], hips: [-0.2, -0.2, 0], spine: [-0.25, 0.3, 0], chest: [-0.1, 0.1, 0],
    neck: [-0.5, 0.4, 0.1], head: [-0.2, 0.2, 0], armL: FLUNG_L, armR: FLUNG_R,
  }), 'inOutQuad'),
  key(0.38, body({
    root: [0, -0.38, -0.08], hips: [0.1, 0.3, 0.12], spine: [0.25, 0.1, 0], chest: [0.1, 0, 0],
    neck: [0.5, 0.2, 0.2], head: [0.2, 0.1, 0],
    feet: [{ at: [0.13, ANKLE, 0.12] }, { at: [-0.16, ANKLE, -0.1] }],
    armL: { at: [0.28, 0.75, 0.05], pole: [0, 0, -1] }, armR: { at: [-0.26, 0.72, 0.02], pole: [0, 0, -1] },
  }), 'inQuad'),
  key(0.62, { ...FALLING, rootOffset: [0, -0.62, -0.32], hips: [-1.1, 0.35, 0.25], neck: [0.1, 0.4, 0] }, 'inQuad'),
  key(0.76, { ...SLAM, head: [0, 0.7, 0.1] }, 'outQuad'),
  key(0.88, { ...KO_LYING, rootOffset: [0, -0.8, -0.45], hips: [-1.5, 0, 0] }, 'inOutQuad'),
  key(1, KO_LYING),
]);

/** Held up by the collar: on tiptoe, both hands clawing at the holder's wrist. */
const GRABBED: BodySpec = {
  root: [0, 0.01, -0.02], hips: [-0.1, 0, 0], spine: [-0.15, 0, 0], chest: [-0.05, 0, 0],
  neck: [-0.15, 0, 0], head: [-0.1, 0, 0],
  feet: [{ at: [0.11, ANKLE + 0.06, 0.05], pitch: 0.7 }, { at: [-0.11, ANKLE + 0.06, 0.02], pitch: 0.7 }],
  armL: { at: [0.05, 1.33, 0.3], pole: [1, -1, 0], hand: [0, -1.2, 0] },
  armR: { at: [-0.05, 1.31, 0.3], pole: [-1, -1, 0], hand: [0, 1.2, 0] },
};

const grabbed = clip('grabbed', 0.8, true, [
  key(0, body(GRABBED), 'inOutQuad'),
  key(0.5, body({
    ...GRABBED, root: [0.03, 0, -0.03], hips: [-0.12, 0.12, 0.05], spine: [-0.18, -0.08, 0], neck: [-0.2, 0.15, 0],
    feet: [{ at: [0.13, ANKLE + 0.08, 0.06], pitch: 0.8 }, { at: [-0.1, ANKLE + 0.04, -0.02], pitch: 0.5 }],
  }), 'inOutQuad'),
]);

const thrown = clip('thrown', 0.9, false, [
  key(0, body(GRABBED), 'inQuad'),
  key(0.22, {
    ...FALLING, rootOffset: [0, 0.12, 0.05], hips: [-0.5, 0.5, 0.3], spine: [-0.2, 0.2, 0],
    thighL: [-0.3, 0, 0.3], shinL: [1.1, 0, 0], thighR: [-1.1, 0, -0.1], shinR: [1.4, 0, 0],
  }, 'linear'),
  key(0.5, { ...FALLING, rootOffset: [0, -0.1, -0.3], hips: [-1.4, 0.3, 0.2] }, 'inQuad'),
  key(0.68, SLAM, 'outQuad'),
  key(0.84, BOUNCE, 'inOutQuad'),
  key(1, LYING),
]);

export const REACTION_CLIP_DEFS: readonly AnimClipDef[] = [
  guard, guardHit, dodgeF, dodgeB, dodgeL, dodgeR,
  hitLight, hitHeavy, hitBack, stagger, knockdown, downed, getUp, ko, grabbed, thrown,
];
