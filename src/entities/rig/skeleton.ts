/**
 * Bone hierarchy and body proportions. Every length is a fraction of the
 * character height H, so joint angles authored for one height are valid for
 * all heights; builds and gender only change widths (see BUILD_WIDTHS).
 */
import type { BoneName, CharacterAppearance } from '../../core/types';

/** Parent-before-child order; index in this array = skin index. */
export const BONES: readonly BoneName[] = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'forearmL', 'handL',
  'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
];

export const BONE_PARENT: Readonly<Record<BoneName, BoneName | null>> = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  upperArmL: 'chest', forearmL: 'upperArmL', handL: 'forearmL',
  upperArmR: 'chest', forearmR: 'upperArmR', handR: 'forearmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL',
  thighR: 'hips', shinR: 'thighR', footR: 'shinR',
};

export const boneIndex = (b: BoneName): number => BONES.indexOf(b);

/** Height the clip library (root offsets, gait strides) is authored for. */
export const REF_HEIGHT = 1.78;

/** Segment lengths as fractions of H. */
export const SEG = {
  hipsY: 0.53,
  spine: 0.06,
  chest: 0.12,
  neck: 0.12,
  head: 0.04,
  shoulderX: 0.1,
  shoulderY: 0.105,
  hipX: 0.05,
  hipY: -0.03,
  upperArm: 0.17,
  forearm: 0.145,
  hand: 0.085,
  thigh: 0.235,
  shin: 0.225,
  ankle: 0.04,
} as const;

export interface WidthFactors {
  shoulder: number;
  torso: number;
  depth: number;
  limb: number;
  hip: number;
}

const BUILD_WIDTHS: Record<CharacterAppearance['build'], WidthFactors> = {
  slim: { shoulder: 0.95, torso: 0.88, depth: 0.9, limb: 0.85, hip: 0.95 },
  normal: { shoulder: 1, torso: 1, depth: 1, limb: 1, hip: 1 },
  heavy: { shoulder: 1.05, torso: 1.22, depth: 1.3, limb: 1.15, hip: 1.15 },
  muscular: { shoulder: 1.15, torso: 1.18, depth: 1.12, limb: 1.3, hip: 1.05 },
};

const FEMALE: WidthFactors = { shoulder: 0.9, torso: 0.92, depth: 0.95, limb: 0.85, hip: 1.1 };

export interface Proportions {
  readonly H: number;
  readonly w: WidthFactors;
  /** Bind-pose offset of each bone from its parent (bones are unrotated in bind). */
  readonly offsets: Readonly<Record<BoneName, readonly [number, number, number]>>;
}

export function widthFactors(a: Pick<CharacterAppearance, 'build' | 'female'>): WidthFactors {
  const b = BUILD_WIDTHS[a.build];
  if (!a.female) return b;
  return {
    shoulder: b.shoulder * FEMALE.shoulder,
    torso: b.torso * FEMALE.torso,
    depth: b.depth * FEMALE.depth,
    limb: b.limb * FEMALE.limb,
    hip: b.hip * FEMALE.hip,
  };
}

export function proportions(a: Pick<CharacterAppearance, 'height' | 'build' | 'female'>): Proportions {
  const H = a.height;
  const w = widthFactors(a);
  const sx = SEG.shoulderX * H * w.shoulder;
  const hx = SEG.hipX * H * w.hip;
  return {
    H,
    w,
    offsets: {
      hips: [0, SEG.hipsY * H, 0],
      spine: [0, SEG.spine * H, 0],
      chest: [0, SEG.chest * H, 0],
      neck: [0, SEG.neck * H, 0],
      head: [0, SEG.head * H, 0],
      upperArmL: [sx, SEG.shoulderY * H, -0.005 * H],
      upperArmR: [-sx, SEG.shoulderY * H, -0.005 * H],
      forearmL: [0, -SEG.upperArm * H, 0],
      forearmR: [0, -SEG.upperArm * H, 0],
      handL: [0, -SEG.forearm * H, 0],
      handR: [0, -SEG.forearm * H, 0],
      thighL: [hx, SEG.hipY * H, 0],
      thighR: [-hx, SEG.hipY * H, 0],
      shinL: [0, -SEG.thigh * H, 0],
      shinR: [0, -SEG.thigh * H, 0],
      footL: [0, -SEG.shin * H, 0],
      footR: [0, -SEG.shin * H, 0],
    },
  };
}

/** Bind-pose position of a bone in rig space (sum of offsets up the chain). */
export function bindPosition(p: Proportions, bone: BoneName, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  out[0] = 0; out[1] = 0; out[2] = 0;
  for (let b: BoneName | null = bone; b; b = BONE_PARENT[b]) {
    const o = p.offsets[b];
    out[0] += o[0]; out[1] += o[1]; out[2] += o[2];
  }
  return out;
}
