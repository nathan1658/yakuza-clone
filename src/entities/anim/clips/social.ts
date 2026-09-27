/**
 * Social, ambient and misc clips. Everything stands on NEUTRAL_FEET with the
 * legs IK-planted, so weight shifts never skate. Gestures (nod, shrug, point,
 * bow, drink) are one-shots that start and end in the relaxed stand, so they
 * also loop seamlessly when used as an idleClip or played with { loop: true }.
 */
import type { AnimClipDef, Pose } from '../../../core/types';
import type { Euler3 } from '../ik';
import {
  ANKLE, FIGHT_STANCE, NEUTRAL_FEET, body, clip, fight, key,
  type ArmTarget, type BodySpec,
} from '../poses';

const stand = (s: BodySpec = {}): Pose => body({ feet: NEUTRAL_FEET, ...s });
const REST = stand();

/** The same arm target for the other side (reflected through X = 0). */
const other = (a: ArmTarget): ArmTarget => ({
  ...a,
  at: [-a.at[0], a.at[1], a.at[2]],
  pole: [-a.pole[0], a.pole[1], a.pole[2]],
  hand: a.hand && [a.hand[0], -a.hand[1], -a.hand[2]],
});

/** Contrapposto: weight on the right leg, pelvis rolled, left knee eased. */
const HIP_R: BodySpec = {
  root: [-0.035, -0.012, 0], hips: [0, 0.08, -0.06], spine: [0, -0.04, 0.05], chest: [0, -0.02, 0.02],
  feet: [{ at: [0.13, ANKLE + 0.01, 0.05], yaw: 0.25, pitch: 0.15 }, { at: [-0.09, ANKLE, 0] }],
};
const HIP_L: BodySpec = {
  root: [0.035, -0.012, 0], hips: [0, -0.08, 0.06], spine: [0, 0.04, -0.05], chest: [0, 0.02, -0.02],
  feet: [{ at: [0.09, ANKLE, 0] }, { at: [-0.13, ANKLE + 0.01, 0.05], yaw: -0.25, pitch: 0.15 }],
};

const POCKET_L: ArmTarget = { at: [0.19, 0.93, 0.05], pole: [1, 0, -0.4], hand: [0.3, 0, 0] };
const POCKET_R = other(POCKET_L);
const ON_HIP_L: ArmTarget = { at: [0.21, 1.01, 0], pole: [1, 0.1, -0.2], hand: [0, 0, -0.5] };

/** Right-hand wrist target in front of the body, palm tilted up. */
const gesture = (at: Euler3, palm = -1.2): ArmTarget => ({ at, pole: [-1, -0.6, -0.3], hand: [0.2, palm, 0] });

const talk = clip('talk', 2.4, true, [
  key(0, stand({ ...HIP_R, neck: [0.05, 0.1, 0], armL: POCKET_L, armR: gesture([-0.16, 1.1, 0.3]) }), 'inOutQuad'),
  key(0.3, stand({ ...HIP_R, chest: [0, -0.08, 0.02], neck: [-0.05, 0.05, 0], armL: POCKET_L, armR: gesture([-0.25, 1.18, 0.33], -1.0) }), 'inOutQuad'),
  key(0.55, stand({ ...HIP_R, neck: [0.1, 0.12, 0], armL: POCKET_L, armR: gesture([-0.12, 1.14, 0.32], -1.4) }), 'inOutQuad'),
  key(0.8, stand({ ...HIP_R, chest: [0, 0.02, 0.02], neck: [0, 0.06, 0], armL: POCKET_L, armR: gesture([-0.2, 1.05, 0.26]) }), 'inOutQuad'),
]);

/** Leaning in, jabbing a finger at the listener's chest. */
const ANGRY: BodySpec = {
  root: [0, -0.03, 0.03], hips: [0.06, 0.12, 0], spine: [0.12, 0.05, 0], chest: [0.06, 0, 0],
  neck: [-0.12, -0.1, 0], head: [-0.06, 0, 0],
  feet: [{ at: [0.1, ANKLE, 0.12] }, { at: [-0.12, ANKLE, -0.1], yaw: -0.2 }],
  armL: { at: [0.22, 0.98, 0.1], pole: [1, 0, -0.3] },
};
const jabAt = (z: number, flick: number): ArmTarget => ({ at: [-0.1, 1.34, z], pole: [-1, -1, 0], hand: [flick, 0.3, 0] });

const talkAngry = clip('talkAngry', 1.6, true, [
  key(0, body({ ...ANGRY, armR: jabAt(0.36, 0.4) }), 'inQuad'),
  key(0.2, body({ ...ANGRY, spine: [0.18, 0.08, 0], armR: jabAt(0.5, 0) }), 'inOutQuad'),
  key(0.5, body({ ...ANGRY, neck: [-0.08, -0.05, 0.08], armR: jabAt(0.34, 0.5) }), 'inQuad'),
  key(0.7, body({ ...ANGRY, spine: [0.2, 0.1, 0], armR: jabAt(0.5, 0) }), 'inOutQuad'),
]);

const CLASP_L: ArmTarget = { at: [0.04, 0.98, 0.17], pole: [1, 0, -0.5], hand: [0, 0.6, 0] };
const CLASP_R: ArmTarget = { at: [-0.03, 0.96, 0.15], pole: [-1, 0, -0.5], hand: [0, -0.6, 0] };

const listen = clip('listen', 3.2, true, [
  key(0, stand({ ...HIP_L, neck: [0.04, 0, 0], head: [0, 0, 0.08], armL: CLASP_L, armR: CLASP_R }), 'inOutQuad'),
  key(0.35, stand({ ...HIP_L, neck: [0.12, 0.05, 0], head: [0.05, 0, 0.1], armL: CLASP_L, armR: CLASP_R }), 'inOutQuad'),
  key(0.6, stand({ ...HIP_L, neck: [0.02, -0.05, 0], head: [0, 0, 0.06], armL: CLASP_L, armR: CLASP_R }), 'inOutQuad'),
]);

const nod = clip('nod', 0.9, false, [
  key(0, REST, 'inOutQuad'),
  key(0.25, stand({ neck: [0.22, 0, 0], head: [0.14, 0, 0] }), 'inOutQuad'),
  key(0.45, stand({ neck: [0.02, 0, 0], head: [0, 0, 0] }), 'inOutQuad'),
  key(0.65, stand({ neck: [0.2, 0, 0], head: [0.12, 0, 0] }), 'inOutQuad'),
  key(1, REST),
]);

/** Elbows at the sides, forearms out, palms up. */
const SHRUG: BodySpec = {
  chest: [-0.05, 0, 0], neck: [0.05, 0, 0.14], head: [0, 0, 0.1],
  armR: { at: [-0.42, 1.1, 0.22], pole: [0, -1, -0.3], hand: [0, -1.4, 0] },
  armL: { at: [0.42, 1.1, 0.22], pole: [0, -1, -0.3], hand: [0, 1.4, 0] },
};

const shrug = clip('shrug', 1.2, false, [
  key(0, REST, 'outCubic'),
  key(0.3, stand(SHRUG), 'inOutQuad'),
  key(0.65, stand({ ...SHRUG, neck: [0.05, 0, 0.18] }), 'inOutQuad'),
  key(1, REST),
]);

const POINT: BodySpec = {
  hips: [0, 0.08, 0], spine: [0.02, 0.08, 0], neck: [-0.03, -0.1, 0],
  armR: { at: [-0.25, 1.62, 1.2], ext: 0.98, pole: [-1, -1, 0], hand: [0, 0.8, 0] },
};

const point = clip('point', 1.4, false, [
  key(0, REST, 'outCubic'),
  key(0.28, stand(POINT), 'inOutQuad'),
  key(0.5, stand({ ...POINT, armR: { ...(POINT.armR as ArmTarget), ext: 0.94 } }), 'inOutQuad'),
  key(0.75, stand(POINT), 'inOutQuad'),
  key(1, REST),
]);

const BOW: BodySpec = {
  root: [0, -0.01, -0.07], hips: [0.45, 0, 0], spine: [0.25, 0, 0], chest: [0.1, 0, 0], neck: [0.1, 0, 0],
  armL: { at: [0.17, 0.84, 0.2], pole: [0.5, 0, -1] }, armR: { at: [-0.17, 0.84, 0.2], pole: [-0.5, 0, -1] },
};

const bow = clip('bow', 1.6, false, [
  key(0, REST, 'inOutQuad'),
  key(0.35, stand(BOW), 'inOutQuad'),
  key(0.6, stand({ ...BOW, hips: [0.48, 0, 0] }), 'inOutQuad'),
  key(1, REST),
]);

/** Left forearm over the right, right hand tucked under the left biceps. */
const FOLD: BodySpec = {
  ...HIP_R,
  armL: { at: [-0.13, 1.24, 0.17], pole: [1, -0.5, 0] },
  armR: { at: [0.12, 1.2, 0.14], pole: [-1, -0.5, 0] },
};

const crossArms = clip('crossArms', 3.2, true, [
  key(0, stand({ ...FOLD, neck: [-0.05, 0.1, 0] }), 'inOutQuad'),
  key(0.5, stand({ ...FOLD, chest: [-0.03, -0.02, 0.02], neck: [-0.03, -0.12, 0] }), 'inOutQuad'),
]);

/** Paper bowl of curry fish balls in the left hand, skewer in the right. */
const BOWL: ArmTarget = { at: [0.04, 1.14, 0.27], pole: [1, -1, -0.2], hand: [0, 1.4, 0] };
const skewer = (at: Euler3, neck: Euler3): BodySpec => ({
  spine: [0.05, 0, 0], neck, armL: BOWL, armR: { at, pole: [-1, -0.8, 0], hand: [0.3, -0.4, 0] },
});

const eat = clip('eat', 2.6, true, [
  key(0, stand(skewer([-0.02, 1.2, 0.3], [0.2, 0, 0])), 'inOutQuad'),
  key(0.2, stand(skewer([0.02, 1.19, 0.28], [0.22, 0, 0])), 'inOutQuad'),
  key(0.4, stand(skewer([-0.03, 1.47, 0.2], [0.12, 0, 0])), 'inOutQuad'),
  key(0.55, stand(skewer([-0.04, 1.46, 0.19], [0.05, 0, 0])), 'inOutQuad'),
  key(0.75, stand(skewer([-0.1, 1.27, 0.26], [0.1, 0.05, 0])), 'inOutQuad'),
]);

const sip = (at: Euler3, tilt: number, hand: number): BodySpec => ({
  neck: [-tilt * 0.6, 0, 0], head: [-tilt * 0.4, 0, 0],
  armR: { at, pole: [-1, -0.6, -0.2], hand: [hand, 0, 0] },
});

const drink = clip('drink', 2.0, false, [
  key(0, REST, 'inOutQuad'),
  key(0.25, stand(sip([-0.07, 1.4, 0.24], 0, 0)), 'inOutQuad'),
  key(0.4, stand(sip([-0.04, 1.49, 0.16], 0.4, -0.5)), 'inOutQuad'),
  key(0.7, stand(sip([-0.04, 1.52, 0.14], 0.55, -0.8)), 'inOutQuad'),
  key(0.85, stand(sip([-0.1, 1.3, 0.22], 0.05, 0)), 'inOutQuad'),
  key(1, REST),
]);

/** Brick phone at the right ear, head tilted into it. */
const EAR: ArmTarget = { at: [-0.13, 1.52, 0.05], pole: [-0.6, -1, 0.3], hand: [0, -0.3, 0] };

const phone = clip('phone', 4.0, true, [
  key(0, stand({ ...HIP_L, neck: [0.05, 0.1, 0.06], head: [0, 0, 0.1], armR: EAR, armL: POCKET_L }), 'inOutQuad'),
  key(0.5, stand({ ...HIP_R, neck: [0.1, -0.2, 0.06], head: [0.05, -0.1, 0.1], armR: EAR, armL: ON_HIP_L }), 'inOutQuad'),
]);

const cheerPose = (y: number, lift: number): Pose => stand({
  root: [0, -y, 0], feet: [{ at: [0.14, ANKLE, 0.02] }, { at: [-0.14, ANKLE, 0.02] }],
  neck: [-0.15, 0, 0], head: [-0.1, 0, 0],
  armL: { at: [0.3, lift, 0.1], pole: [1, 0, -1], hand: [0, 0, 0.2] },
  armR: { at: [-0.3, lift, 0.1], pole: [-1, 0, -1], hand: [0, 0, -0.2] },
});

const cheer = clip('cheer', 1.0, true, [
  key(0, cheerPose(0.02, 1.95), 'inOutQuad'),
  key(0.5, cheerPose(0.1, 1.68), 'inOutQuad'),
]);

/** Crouched, forearms wrapped over the back of the head. */
const COWER: BodySpec = {
  root: [0, -0.36, -0.06], hips: [0.5, 0, 0], spine: [0.35, 0, 0], chest: [0.2, 0, 0], neck: [0.3, 0, 0], head: [0.2, 0, 0],
  feet: [{ at: [0.13, ANKLE, 0.08], pitch: 0.2 }, { at: [-0.13, ANKLE, 0.02], pitch: 0.2 }],
  armL: { at: [0.08, 1.05, 0.5], pole: [1, 0.2, 0] }, armR: { at: [-0.08, 1.03, 0.5], pole: [-1, 0.2, 0] },
};

const cower = clip('cower', 0.5, true, [
  key(0, body(COWER), 'inOutQuad'),
  key(0.5, body({ ...COWER, root: [0.01, -0.37, -0.06], neck: [0.32, 0.05, 0] }), 'inOutQuad'),
]);

/** Back against a wall (touching the capsule behind), one sole flat on it. */
const LEAN: BodySpec = {
  root: [0, -0.04, -0.06], hips: [-0.08, 0.1, 0], spine: [-0.1, 0, 0], chest: [-0.04, 0, 0], neck: [0.15, -0.1, 0],
  feet: [{ at: [0.12, ANKLE, 0.22], yaw: 0.25 }, { at: [-0.1, 0.42, -0.2], pitch: 1.4 }],
  armL: POCKET_L, armR: POCKET_R,
};

const lean = clip('lean', 4.0, true, [
  key(0, body(LEAN), 'inOutQuad'),
  key(0.5, body({ ...LEAN, neck: [0.1, 0.35, 0], head: [0.05, 0.15, 0] }), 'inOutQuad'),
]);

const cig = (at: Euler3, neck: Euler3): BodySpec => ({
  ...HIP_R, neck, armL: POCKET_L, armR: { at, pole: [-1, -0.7, -0.1], hand: [0.2, -0.3, 0] },
});
const CIG_DOWN: Euler3 = [-0.22, 1.12, 0.16];

const smoke = clip('smoke', 4.5, true, [
  key(0, stand(cig(CIG_DOWN, [0.05, 0.05, 0])), 'inOutQuad'),
  key(0.22, stand(cig([-0.05, 1.49, 0.15], [0.08, 0, 0])), 'inOutQuad'),
  key(0.38, stand(cig([-0.05, 1.5, 0.15], [0.05, 0, 0])), 'inOutQuad'),
  key(0.55, stand(cig([-0.2, 1.18, 0.2], [-0.2, 0.1, 0])), 'inOutQuad'),
  key(0.75, stand(cig(CIG_DOWN, [0, 0.15, 0])), 'inOutQuad'),
]);

/** Stirring the curry pot on the stall, looking up now and then to call out. */
const stir = (dx: number, dz: number, neck: Euler3): Pose => stand({
  spine: [0.14, 0, 0], chest: [0.04, 0, 0], neck,
  armL: { at: [0.18, 1.03, 0.36], pole: [1, -0.5, 0], hand: [0, 0.8, 0] },
  armR: { at: [-0.05 + dx, 1.0, 0.4 + dz], pole: [-1, -1, 0], hand: [0.3, 0, 0] },
});

const vendorIdle = clip('vendorIdle', 3.0, true, [
  key(0, stir(0.06, 0, [0.28, 0, 0]), 'linear'),
  key(0.25, stir(0, 0.06, [0.25, 0.05, 0])),
  key(0.5, stir(-0.06, 0, [0, 0.3, 0])),
  key(0.75, stir(0, -0.06, [0.15, 0.1, 0])),
]);

/** Chin up, arms open, then a slow "come on" beckon with the right hand. */
const OPEN: BodySpec = {
  root: [0, -0.04, 0], hips: [-0.04, -0.2, 0], spine: [-0.08, 0.05, 0], chest: [-0.05, 0.05, 0],
  neck: [-0.22, 0.1, 0], head: [-0.1, 0, 0],
  armL: { at: [0.46, 1.22, 0.22], pole: [0.5, -1, -0.5], hand: [0, 1.2, 0] },
  armR: { at: [-0.46, 1.22, 0.22], pole: [-0.5, -1, -0.5], hand: [0, -1.2, 0] },
};
const beckon = (curl: number): Pose => fight({
  ...OPEN, armR: { at: [-0.14, 1.3, 0.48], pole: [-1, -1, 0], hand: [curl, -1.4, 0] },
});

const taunt = clip('taunt', 1.2, false, [
  key(0, FIGHT_STANCE, 'outCubic'),
  key(0.22, fight(OPEN), 'inOutQuad'),
  key(0.42, beckon(0.5), 'inOutQuad'),
  key(0.56, beckon(-0.6), 'inOutQuad'),
  key(0.7, beckon(0.5), 'inOutQuad'),
  key(0.82, beckon(-0.6), 'inOutQuad'),
  key(1, FIGHT_STANCE),
]);

/** Straightens up, rolls the neck, sweeps the hair back and settles into a slouch. */
const victory = clip('victory', 1.6, false, [
  key(0, FIGHT_STANCE, 'inOutQuad'),
  key(0.22, stand({ neck: [0.1, 0, 0.25], head: [0.05, 0, 0.1], armL: POCKET_L }), 'inOutQuad'),
  key(0.45, stand({
    neck: [0.05, 0, -0.1], head: [-0.05, 0, 0], armL: POCKET_L,
    armR: { at: [-0.06, 1.62, 0.2], pole: [-1, 0.2, 0], hand: [-0.3, -0.6, 0] },
  }), 'inOutQuad'),
  key(0.65, stand({
    neck: [-0.15, 0, 0], head: [-0.1, 0, 0], armL: POCKET_L,
    armR: { at: [-0.12, 1.7, -0.04], pole: [-1, 0.5, 0.3], hand: [-0.3, -0.6, 0] },
  }), 'inOutQuad'),
  key(0.85, stand({ ...HIP_R, neck: [-0.08, 0.1, 0], armL: POCKET_L, armR: POCKET_R }), 'inOutQuad'),
  key(1, stand({ ...HIP_R, neck: [-0.06, 0.12, 0], armL: POCKET_L, armR: POCKET_R })),
]);

/** Squat and reach the ground in front of the right foot; the hand is lowest at t ≈ 0.45. */
const REACH: BodySpec = {
  root: [0, -0.46, -0.06], hips: [0.6, 0.1, 0], spine: [0.3, 0.1, 0], chest: [0.1, 0, 0], neck: [-0.3, 0, 0],
  feet: [{ at: [0.12, ANKLE, 0.12] }, { at: [-0.13, ANKLE + 0.05, -0.12], pitch: 0.8 }],
  armL: { at: [0.2, 0.62, 0.3], pole: [1, 0, 0] },
  armR: { at: [-0.14, 0.18, 0.44], pole: [-1, 0, -0.3] },
};

const pickup = clip('pickup', 0.5, false, [
  key(0, REST, 'outQuad'),
  key(0.45, body(REACH), 'inOutQuad'),
  key(0.6, body({ ...REACH, root: [0, -0.42, -0.05], armR: { ...(REACH.armR as ArmTarget), at: [-0.16, 0.26, 0.4] } }), 'inOutQuad'),
  key(1, REST),
]);

/** Sitting on the kerb or floor, knees up, forearms resting on them. */
const SIT: BodySpec = {
  root: [0, -0.8, -0.05], hips: [-0.1, 0, 0], spine: [0.25, 0, 0], chest: [0.1, 0, 0], neck: [-0.2, 0, 0],
  feet: [{ at: [0.16, ANKLE, 0.42], pitch: -0.2 }, { at: [-0.16, ANKLE, 0.4], pitch: -0.2 }],
  armL: { at: [0.14, 0.5, 0.44], pole: [1, -0.2, -0.5] }, armR: { at: [-0.14, 0.5, 0.44], pole: [-1, -0.2, -0.5] },
};

const sitGround = clip('sitGround', 4.0, true, [
  key(0, body(SIT), 'inOutQuad'),
  key(0.5, body({ ...SIT, spine: [0.28, 0, 0], neck: [-0.15, 0.3, 0] }), 'inOutQuad'),
]);

export const SOCIAL_CLIP_DEFS: readonly AnimClipDef[] = [
  talk, talkAngry, listen, nod, shrug, point, bow, crossArms, eat, drink, phone, cheer, cower, lean, smoke,
  vendorIdle, taunt, victory, pickup, sitGround,
];
