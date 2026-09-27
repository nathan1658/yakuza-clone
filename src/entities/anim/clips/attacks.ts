/**
 * Attack clips. Every strike is authored in character space (feet at the
 * origin, facing +Z, left = +X) from the orthodox fighting stance: fists aim at
 * where an opponent's chin or body is, and `impactAt` is the key where the
 * striking limb reaches full extension. All clips start and end in the stance
 * so combos chain through the animator's cross-fade.
 *
 * Striking limbs (for hitboxes): jab/hook = handL; cross/uppercut/heavyPunch/
 * grabPunch/weapon* = handR; rushPunch = both hands; frontKick/roundhouse/
 * spinKick/stomp = footR; dropKick = both feet; throwToss = both hands.
 */
import type { AnimClipDef, AnimKeyframe, Pose } from '../../../core/types';
import type { Euler3 } from '../ik';
import {
  ANKLE, FIGHT_STANCE, GUARD_R, STANCE_FEET, body, clip, fight, key,
  type ArmTarget, type BodySpec, type FootPlant,
} from '../poses';

const LEAD = STANCE_FEET[0];
const REAR = STANCE_FEET[1];
/** Rear foot turned in on the ball, heel up: drives rotation into rear-hand strikes. */
const REAR_PIVOT: FootPlant = { at: [-0.13, ANKLE + 0.05, -0.19], yaw: -0.15, pitch: 0.7 };
const LEAD_STEP: FootPlant = { at: [0.13, ANKLE, 0.3], yaw: -0.05 };

/** Aim points: an opponent's chin and solar plexus about a metre ahead. */
const CHIN: Euler3 = [0, 1.5, 1.3];
const PLEXUS: Euler3 = [0, 1.18, 1.3];

/** Wrist twist that turns a straight punch palm-down. */
const FIST_L: Euler3 = [0, -0.8, 0];
const FIST_R: Euler3 = [0, 0.8, 0];

const straightL = (at: Euler3, ext: number): ArmTarget => ({ at, ext, pole: [0.5, -1, 0], hand: FIST_L });
const straightR = (at: Euler3, ext: number): ArmTarget => ({ at, ext, pole: [-0.5, -1, 0], hand: FIST_R });

const STANCE = FIGHT_STANCE;

/** A strike shape plus a slightly retracted copy of it (the brief hold after contact). */
function strike(s: BodySpec, retract: Partial<BodySpec>): [Pose, Pose] {
  return [fight(s), fight({ ...s, ...retract })];
}

const jab = ((): AnimClipDef => {
  const [hit, hold] = strike(
    { root: [0.02, -0.09, 0.08], hips: [0.02, -0.6, 0], spine: [0.16, -0.08, 0], chest: [0.06, -0.08, 0], armL: straightL(CHIN, 0.96) },
    { armL: straightL(CHIN, 0.88) },
  );
  return clip('jab', 0.36, false, [
    key(0, STANCE, 'outQuad'),
    key(0.14, fight({ root: [0, -0.08, 0], hips: [0, -0.42, 0], spine: [0.12, 0.16, 0] }), 'outCubic'),
    key(0.42, hit, 'inOutQuad'),
    key(0.62, hold, 'inOutQuad'),
    key(1, STANCE),
  ], 0.42);
})();

const CROSS_HIT: BodySpec = {
  root: [-0.02, -0.1, 0.1], hips: [0.03, 0.15, 0], spine: [0.2, 0.22, 0], chest: [0.06, 0.14, 0],
  feet: [{ ...LEAD, yaw: 0.05 }, REAR_PIVOT], armR: straightR(CHIN, 0.97),
};

const cross = ((): AnimClipDef => {
  const [hit, hold] = strike(CROSS_HIT, { armR: straightR(CHIN, 0.88) });
  return clip('cross', 0.42, false, [
    key(0, STANCE, 'outQuad'),
    key(0.18, fight({ root: [0.01, -0.08, -0.03], hips: [0, -0.5, 0], spine: [0.1, 0.05, 0] }), 'outCubic'),
    key(0.45, hit, 'inOutQuad'),
    key(0.64, hold, 'inOutQuad'),
    key(1, STANCE),
  ], 0.45);
})();

const hook = clip('hook', 0.5, false, [
  key(0, STANCE, 'inOutQuad'),
  key(0.22, fight({
    root: [0.04, -0.1, 0.02], hips: [0, -0.55, 0], spine: [0.14, -0.2, 0.05], chest: [0.04, -0.1, 0],
    armL: { at: [0.34, 1.34, 0.18], pole: [1, -0.2, -0.4], hand: [0, -0.4, 0] },
  }), 'outCubic'),
  key(0.48, fight({
    root: [0, -0.1, 0.04], hips: [0.02, 0.2, 0], spine: [0.16, 0.3, 0], chest: [0.06, 0.2, 0],
    feet: [{ ...LEAD, yaw: 0.35, pitch: 0.3, at: [0.13, ANKLE + 0.03, 0.19] }, REAR],
    armL: { at: [-0.02, 1.45, 0.42], pole: [1, 0.4, 0], hand: [0, -1.4, 0] },
  }), 'inOutQuad'),
  key(0.66, fight({
    root: [0, -0.1, 0.03], hips: [0.02, 0.25, 0], spine: [0.16, 0.38, 0], chest: [0.06, 0.22, 0],
    armL: { at: [-0.1, 1.44, 0.36], pole: [1, 0.4, 0], hand: [0, -1.4, 0] },
  }), 'inOutQuad'),
  key(1, STANCE),
], 0.48);

const uppercut = clip('uppercut', 0.6, false, [
  key(0, STANCE, 'inOutQuad'),
  key(0.25, fight({
    root: [0.02, -0.2, 0], hips: [0.1, -0.5, 0], spine: [0.3, -0.05, 0.05], chest: [0.1, 0, 0],
    armR: { at: [-0.14, 0.98, 0.22], pole: [-0.2, -1, -0.4], hand: [0, 0.2, 0] },
  }), 'outCubic'),
  key(0.5, fight({
    root: [-0.01, -0.03, 0.07], hips: [-0.02, 0.2, 0], spine: [0.02, 0.25, 0], chest: [-0.08, 0.15, 0],
    feet: [LEAD, REAR_PIVOT],
    armR: { at: [0, 1.62, 0.45], pole: [-0.2, -1, 0.1], hand: [0, -0.3, 0] },
  }), 'inOutQuad'),
  key(0.68, fight({
    root: [-0.01, -0.03, 0.06], hips: [-0.02, 0.22, 0], spine: [0, 0.27, 0], chest: [-0.12, 0.15, 0],
    feet: [LEAD, REAR_PIVOT],
    armR: { at: [0, 1.66, 0.4], pole: [-0.2, -1, 0.1], hand: [0, -0.3, 0] },
  }), 'inOutQuad'),
  key(1, STANCE),
], 0.5);

/** Arms held out for balance while standing on one leg. */
const BALANCE_R: ArmTarget = { at: [-0.4, 1.1, -0.15], pole: [-0.3, -1, -0.5] };

const frontKick = clip('frontKick', 0.55, false, [
  key(0, STANCE, 'outQuad'),
  key(0.22, fight({
    root: [0.05, -0.05, 0.03], hips: [-0.1, -0.1, 0], spine: [0.1, 0.05, 0],
    feet: [{ ...LEAD, yaw: -0.05 }, { at: [-0.06, 0.5, 0.22], pitch: 0.5 }],
  }), 'outQuad'),
  key(0.45, fight({
    root: [0.07, -0.03, 0.08], hips: [-0.3, 0.05, 0], spine: [0.2, 0.05, 0], chest: [0.06, 0, 0],
    feet: [{ ...LEAD, yaw: 0.2 }, { at: [-0.03, 0.95, 0.8], pitch: -1.1 }], armR: BALANCE_R,
  }), 'inOutQuad'),
  key(0.68, fight({
    root: [0.05, -0.05, 0.05], hips: [-0.12, -0.05, 0], spine: [0.12, 0.05, 0],
    feet: [{ ...LEAD, yaw: 0.1 }, { at: [-0.06, 0.52, 0.28], pitch: 0.4 }],
  }), 'inOutQuad'),
  key(1, STANCE),
], 0.45);

const PIVOT = (yaw: number): FootPlant => ({ at: [0.13, ANKLE + 0.03, 0.19], yaw, pitch: 0.3 });

const roundhouse = clip('roundhouse', 0.7, false, [
  key(0, STANCE, 'inOutQuad'),
  key(0.25, fight({
    root: [0.07, -0.04, 0.04], hips: [0, 0.5, -0.2], spine: [0.05, -0.2, 0], chest: [0, -0.1, 0],
    feet: [PIVOT(0.6), { at: [-0.25, 0.72, 0.18], pitch: 0.8 }],
  }), 'outQuad'),
  key(0.5, fight({
    root: [0.1, -0.02, 0.06], hips: [0, 1.35, -0.45], spine: [0, -0.45, 0.1], chest: [0.05, -0.25, 0],
    feet: [PIVOT(1.3), { at: [0, 1.2, 0.72], pitch: 0.9 }], armR: { at: [-0.45, 1.0, -0.2], pole: [0, -1, -1] },
  }), 'inOutQuad'),
  key(0.72, fight({
    root: [0.08, -0.04, 0.04], hips: [0, 0.7, -0.25], spine: [0.05, -0.25, 0.05], chest: [0, -0.1, 0],
    feet: [PIVOT(0.8), { at: [-0.3, 0.68, 0.2], pitch: 0.8 }],
  }), 'inOutQuad'),
  key(1, STANCE),
], 0.5);

/**
 * Spinning back kick: a full clockwise turn on the lead foot. Consecutive keys
 * stay less than π apart in hips yaw so the slerp keeps spinning the same way.
 */
const spinFeet = (yaw: number, kick: FootPlant): readonly [FootPlant, FootPlant] => [PIVOT(yaw), kick];
const spinKick = clip('spinKick', 0.85, false, [
  key(0, STANCE, 'inQuad'),
  key(0.22, fight({
    root: [0.08, -0.08, 0.03], hips: [0.1, -1.5, 0], spine: [0.1, -0.2, 0], chest: [0.05, -0.1, 0],
    neck: [0, 0.6, 0], head: [0, 0.5, 0], feet: spinFeet(-1.5, { at: [-0.1, 0.35, -0.25], pitch: 0.6 }),
  }), 'linear'),
  key(0.55, fight({
    root: [0.1, -0.02, 0.06], hips: [0.45, -2.85, 0], spine: [0.1, 0, 0], chest: [0, 0, 0],
    neck: [-0.3, 1.0, 0], head: [-0.2, 0.6, 0], feet: spinFeet(-2.85, { at: [0, 1.05, 0.7], pitch: -0.9 }),
  }), 'inOutQuad'),
  key(0.75, fight({
    root: [0.08, -0.08, 0.04], hips: [0.2, -4.2, 0], spine: [0.1, 0.1, 0], chest: [0.05, 0.05, 0],
    neck: [-0.1, 0.9, 0], head: [0, 0.5, 0], feet: spinFeet(-4.2, { at: [-0.05, 0.3, 0.1], pitch: 0.5 }),
  }), 'inOutQuad'),
  key(1, fight({ hips: [0, -2 * Math.PI - 0.35, 0] })),
], 0.55);

const heavyPunch = clip('heavyPunch', 0.75, false, [
  key(0, STANCE, 'inOutQuad'),
  key(0.35, fight({
    root: [0.02, -0.12, -0.06], hips: [0.05, -0.7, 0], spine: [0.05, -0.25, 0], chest: [0, -0.15, 0],
    armR: { at: [-0.32, 1.38, -0.28], pole: [-0.4, -0.8, -0.4], hand: [0, 0.4, 0] },
    armL: { at: [0.1, 1.35, 0.45], pole: [0.5, -1, 0], hand: [0, -0.6, 0] },
  }), 'inQuad'),
  key(0.55, fight({
    root: [-0.02, -0.14, 0.16], hips: [0.08, 0.35, 0], spine: [0.25, 0.3, 0], chest: [0.08, 0.15, 0],
    feet: [LEAD_STEP, REAR_PIVOT], armR: straightR(CHIN, 0.98),
  }), 'inOutQuad'),
  key(0.72, fight({
    root: [-0.02, -0.13, 0.14], hips: [0.08, 0.3, 0], spine: [0.22, 0.28, 0], chest: [0.08, 0.14, 0],
    feet: [LEAD_STEP, REAR_PIVOT], armR: straightR(CHIN, 0.9),
  }), 'inOutQuad'),
  key(1, STANCE),
], 0.55);

/** Flurry: six alternating straights, the first landing at impactAt. */
const rushPunch = ((): AnimClipDef => {
  const RUSH: BodySpec = { root: [0, -0.12, 0.06], feet: [LEAD, { ...REAR, pitch: 0.5 }] };
  const blow = (left: boolean, aim: Euler3, ext: number): Pose => fight({
    ...RUSH,
    hips: [0.05, left ? -0.5 : 0, 0],
    spine: [0.18, left ? -0.05 : 0.2, 0],
    chest: [0.06, left ? -0.05 : 0.1, 0],
    ...(left ? { armL: straightL(aim, ext) } : { armR: straightR(aim, ext) }),
  });
  const keys: AnimKeyframe[] = [key(0, STANCE, 'outQuad'), key(0.1, fight(RUSH), 'outQuad')];
  for (let i = 0; i < 6; i++) {
    const t = 0.2 + i * 0.12;
    const aim = i % 3 === 2 ? PLEXUS : CHIN;
    keys.push(key(t, blow(i % 2 === 0, aim, 0.95), 'inOutQuad'), key(t + 0.06, blow(i % 2 === 0, aim, 0.6), 'outQuad'));
  }
  keys.push(key(1, STANCE));
  return clip('rushPunch', 1.2, false, keys, 0.2);
})();

const stomp = clip('stomp', 0.6, false, [
  key(0, STANCE, 'outQuad'),
  key(0.3, fight({
    root: [0.05, -0.02, 0.04], hips: [0.1, -0.1, 0], spine: [0.2, 0, 0],
    feet: [{ ...LEAD, yaw: 0 }, { at: [-0.06, 0.55, 0.35], pitch: -0.2 }],
    armL: { at: [0.35, 1.3, 0.25], pole: [1, -1, 0] }, armR: { at: [-0.35, 1.3, 0.2], pole: [-1, -1, 0] },
  }), 'inCubic'),
  key(0.55, fight({
    root: [0.03, -0.16, 0.1], hips: [0.2, -0.1, 0], spine: [0.3, 0, 0], neck: [0.35, 0.1, 0], head: [0.2, 0, 0],
    feet: [{ ...LEAD, yaw: 0 }, { at: [-0.08, ANKLE + 0.15, 0.55], pitch: 0 }],
  }), 'inOutQuad'),
  key(0.75, fight({
    root: [0.03, -0.15, 0.08], hips: [0.18, -0.1, 0], spine: [0.26, 0, 0], neck: [0.3, 0.1, 0], head: [0.2, 0, 0],
    feet: [{ ...LEAD, yaw: 0 }, { at: [-0.08, ANKLE + 0.15, 0.5], pitch: 0 }],
  }), 'inOutQuad'),
  key(1, STANCE),
], 0.55);

const TUCK: readonly [FootPlant, FootPlant] = [{ at: [0.12, 0.6, 0.35], pitch: -0.4 }, { at: [-0.12, 0.6, 0.35], pitch: -0.4 }];
const dropKick = clip('dropKick', 0.9, false, [
  key(0, STANCE, 'outQuad'),
  key(0.18, fight({
    root: [0, -0.28, 0], hips: [0.25, 0, 0], spine: [0.25, 0, 0],
    feet: [{ at: [0.12, ANKLE, 0.05] }, { at: [-0.12, ANKLE, 0.05] }],
    armL: { at: [0.3, 1.0, -0.2], pole: [0, -1, -1] }, armR: { at: [-0.3, 1.0, -0.2], pole: [0, -1, -1] },
  }), 'outQuad'),
  key(0.32, body({ root: [0, 0.2, 0.05], hips: [-0.7, 0, 0], spine: [0.1, 0, 0], neck: [0.3, 0, 0], feet: TUCK }), 'outQuad'),
  key(0.45, body({
    root: [0, 0.15, 0.1], hips: [-1.35, 0, 0], spine: [0.15, 0, 0], neck: [0.5, 0, 0], head: [0.3, 0, 0],
    feet: [{ at: [0.1, 1.2, 0.85], pitch: -1.2 }, { at: [-0.1, 1.2, 0.85], pitch: -1.2 }],
    armL: { at: [0.45, 1.2, -0.3], pole: [0, -1, 0] }, armR: { at: [-0.45, 1.2, -0.3], pole: [0, -1, 0] },
  }), 'inQuad'),
  key(0.64, body({
    root: [0, -0.8, -0.1], hips: [-1.45, 0, 0], spine: [0.1, 0, 0], neck: [0.4, 0, 0],
    feet: [{ at: [0.12, 0.3, 0.7], pitch: -0.8 }, { at: [-0.12, 0.3, 0.7], pitch: -0.8 }],
    armL: { at: [0.45, 0.2, -0.35], pole: [0, 1, 0] }, armR: { at: [-0.45, 0.2, -0.35], pole: [0, 1, 0] },
  }), 'outQuad'),
  key(0.8, body({
    root: [0, -0.5, 0], hips: [0.3, -0.2, 0], spine: [0.35, 0.1, 0], neck: [-0.2, 0, 0],
    feet: [{ at: [0.15, ANKLE, 0.12] }, { at: [-0.15, ANKLE + 0.04, -0.2], pitch: 0.8 }],
    armL: { at: [0.3, 0.35, 0.3], pole: [1, 0, 0] }, armR: GUARD_R,
  }), 'inOutQuad'),
  key(1, STANCE),
], 0.45);

// --- Weapons (held in the right hand; the socket's +Y is the grip axis) ---

/** Two-handed-looking one-hand swing: body twist drives the arm. */
const swing = (name: string, from: ArmTarget, hit: ArmTarget, follow: ArmTarget, yaw: [number, number, number]): AnimClipDef =>
  clip(name, 0.55, false, [
    key(0, STANCE, 'inOutQuad'),
    key(0.25, fight({ root: [0, -0.1, -0.02], hips: [0, -0.35 + yaw[0], 0], spine: [0.08, yaw[0] * 0.8, 0], armR: from }), 'inQuad'),
    key(0.45, fight({
      root: [0, -0.12, 0.08], hips: [0.05, -0.35 + yaw[1], 0], spine: [0.18, yaw[1] * 0.8, 0], chest: [0.05, yaw[1] * 0.3, 0],
      feet: [LEAD, REAR_PIVOT], armR: hit,
    }), 'outQuad'),
    key(0.68, fight({ root: [0, -0.12, 0.06], hips: [0.05, -0.35 + yaw[2], 0], spine: [0.15, yaw[2] * 0.8, 0], armR: follow }), 'inOutQuad'),
    key(1, STANCE),
  ], 0.45);

const weaponSwing = swing(
  'weaponSwing',
  { at: [-0.4, 1.5, -0.12], pole: [-0.3, -0.2, -1], hand: [0.6, 0, 0.3] },
  { at: [0.05, 1.32, 0.55], pole: [-0.5, -0.8, 0], hand: [0, 0, -0.4] },
  { at: [0.38, 1.22, 0.2], pole: [0, -1, 0.3], hand: [0, 0, -0.9] },
  [-0.5, 0.6, 0.9],
);

const weaponSwing2 = swing(
  'weaponSwing2',
  { at: [0.3, 1.4, 0.05], pole: [0, -1, 0], hand: [0, 0, -1.0] },
  { at: [-0.25, 1.35, 0.5], pole: [-0.3, -1, 0], hand: [0, 0, 0.4] },
  { at: [-0.45, 1.3, 0.1], pole: [-0.5, -0.5, -0.5], hand: [0, 0, 0.8] },
  [0.6, -0.2, -0.6],
);

const weaponOverhead = clip('weaponOverhead', 0.8, false, [
  key(0, STANCE, 'inOutQuad'),
  key(0.35, fight({
    root: [0, -0.04, -0.04], hips: [-0.1, -0.2, 0], spine: [-0.15, 0.05, 0], chest: [-0.1, 0, 0],
    armR: { at: [-0.12, 2.0, -0.12], pole: [-0.5, 0, -1], hand: [0.9, 0, 0] },
    armL: { at: [0.1, 1.6, 0.25], pole: [1, -1, 0] },
  }), 'inCubic'),
  key(0.55, fight({
    root: [0, -0.2, 0.14], hips: [0.3, 0.05, 0], spine: [0.35, 0.1, 0], chest: [0.1, 0.05, 0],
    feet: [LEAD_STEP, REAR_PIVOT],
    armR: { at: [-0.03, 1.02, 0.6], pole: [-0.3, -1, 0], hand: [-0.4, 0, 0] },
  }), 'inOutQuad'),
  key(0.72, fight({
    root: [0, -0.2, 0.12], hips: [0.3, 0.05, 0], spine: [0.32, 0.1, 0], chest: [0.1, 0.05, 0],
    feet: [LEAD_STEP, REAR_PIVOT],
    armR: { at: [-0.03, 0.98, 0.55], pole: [-0.3, -1, 0], hand: [-0.4, 0, 0] },
  }), 'inOutQuad'),
  key(1, STANCE),
], 0.55);

const weaponThrow = clip('weaponThrow', 0.6, false, [
  key(0, STANCE, 'inOutQuad'),
  key(0.3, fight({
    root: [0, -0.08, -0.08], hips: [-0.05, -0.8, 0], spine: [-0.1, -0.2, 0], chest: [-0.05, -0.1, 0],
    armR: { at: [-0.35, 1.72, -0.35], pole: [-0.5, -0.5, -0.5], hand: [0.5, 0, 0] },
    armL: { at: [0.1, 1.4, 0.5], pole: [0.5, -1, 0] },
  }), 'inQuad'),
  key(0.45, fight({
    root: [0, -0.1, 0.12], hips: [0.1, 0.3, 0], spine: [0.2, 0.25, 0], chest: [0.05, 0.1, 0],
    feet: [LEAD_STEP, REAR_PIVOT], armR: { at: [-0.08, 1.62, 0.52], pole: [-0.5, -1, 0], hand: [-0.2, 0, 0] },
  }), 'outQuad'),
  key(0.7, fight({
    root: [0, -0.14, 0.12], hips: [0.2, 0.45, 0], spine: [0.3, 0.3, 0], chest: [0.1, 0.1, 0],
    feet: [LEAD_STEP, REAR_PIVOT], armR: { at: [0.15, 1.05, 0.4], pole: [0, -1, 0.5] },
  }), 'inOutQuad'),
  key(1, STANCE),
], 0.45);

// --- Grabs: the victim is held by the collar about 0.55 m in front ---

const COLLAR: ArmTarget = { at: [0.02, 1.34, 0.46], pole: [0.6, -1, 0], hand: [0, -1.5, 0] };
const COLLAR_YANK: ArmTarget = { at: [0.02, 1.32, 0.38], pole: [0.6, -1, 0], hand: [0, -1.5, 0] };
const COCKED_R: ArmTarget = { at: [-0.24, 1.46, -0.05], pole: [-0.4, -1, -0.3], hand: [0, 0.5, 0] };
const HOLD: BodySpec = {
  root: [0.02, -0.08, 0.02], hips: [0.02, -0.25, 0], spine: [0.12, -0.05, 0], chest: [0.04, 0, 0],
  armL: COLLAR, armR: COCKED_R,
};

const grabHold = clip('grabHold', 1.0, true, [
  key(0, fight(HOLD), 'inOutQuad'),
  key(0.5, fight({ ...HOLD, root: [0.02, -0.1, -0.02], hips: [0.02, -0.3, 0], spine: [0.14, -0.1, 0], armL: COLLAR_YANK }), 'inOutQuad'),
], 0.5);

const grabPunch = clip('grabPunch', 0.4, false, [
  key(0, fight(HOLD), 'outQuad'),
  key(0.22, fight({ ...HOLD, hips: [0.02, -0.45, 0], spine: [0.1, -0.2, 0], armR: { ...COCKED_R, at: [-0.3, 1.48, -0.12] } }), 'inQuad'),
  key(0.5, fight({
    ...HOLD, root: [0, -0.1, 0.06], hips: [0.05, 0.1, 0], spine: [0.2, 0.2, 0], chest: [0.05, 0.1, 0], armL: COLLAR_YANK,
    feet: [LEAD, REAR_PIVOT], armR: { at: [-0.02, 1.5, 0.5], pole: [-0.5, -1, 0], hand: FIST_R },
  }), 'inOutQuad'),
  key(1, fight(HOLD)),
], 0.5);

const throwToss = clip('throwToss', 0.9, false, [
  key(0, fight(HOLD), 'inOutQuad'),
  key(0.3, fight({
    root: [0, -0.2, -0.05], hips: [-0.05, -0.8, 0], spine: [-0.05, -0.3, 0], chest: [-0.05, -0.1, 0],
    armL: { at: [-0.05, 1.3, 0.42], pole: [1, -1, 0] }, armR: { at: [-0.2, 1.25, 0.38], pole: [-1, -1, 0] },
  }), 'inQuad'),
  key(0.55, fight({
    root: [0, -0.1, 0.12], hips: [0.1, 0.5, 0], spine: [0.2, 0.35, 0], chest: [0.05, 0.1, 0],
    feet: [LEAD_STEP, REAR_PIVOT],
    armL: { at: [0.25, 1.45, 0.6], pole: [1, -1, 0] }, armR: { at: [-0.05, 1.5, 0.65], pole: [-1, -1, 0] },
  }), 'outQuad'),
  key(0.75, fight({
    root: [0, -0.12, 0.1], hips: [0.15, 0.5, 0], spine: [0.25, 0.35, 0],
    feet: [LEAD_STEP, REAR_PIVOT],
    armL: { at: [0.35, 1.2, 0.45], pole: [1, -1, 0] }, armR: { at: [0.05, 1.15, 0.5], pole: [-1, -1, 0] },
  }), 'inOutQuad'),
  key(1, STANCE),
], 0.55);

export const ATTACK_CLIP_DEFS: readonly AnimClipDef[] = [
  jab, cross, hook, uppercut, frontKick, roundhouse, spinKick, heavyPunch, rushPunch, stomp, dropKick,
  weaponSwing, weaponSwing2, weaponOverhead, weaponThrow, grabHold, grabPunch, throwToss,
];
