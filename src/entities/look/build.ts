import { Euler, Quaternion, Vector3, type BufferGeometry } from 'three';
import type { AppearancePreset, BoneName, CharacterAppearance, HairStyle } from '../../core/types';
import { BONE_PARENT, BONES, bindPosition, boneIndex, proportions, type Proportions } from '../rig/skeleton';
import { buildAccessories } from './accessories';
import { bakeAO } from './ao';
import { buildBody, type Look } from './body';
import { bottomLegCover, buildBottom } from './bottoms';
import { buildHair } from './hair';
import { Head } from './head';
import { MeshBuilder } from './MeshBuilder';
import { PRESETS, randomLook } from './presets';
import { buildTop, topArmCover, topTucked } from './tops';

export function resolveLook(a: AppearancePreset | CharacterAppearance): Look {
  if (typeof a !== 'string') return a;
  return a === 'pedestrian' ? randomLook() : PRESETS[a];
}

export interface BuiltLook {
  geometry: BufferGeometry;
  proportions: Proportions;
}

/** Styles with volume on top get flattened to short hair under a cap. */
const UNDER_CAP: ReadonlySet<HairStyle> = new Set<HairStyle>(['spiky', 'perm', 'bun', 'slick']);

export function buildCharacterGeometry(look: Look): BuiltLook {
  const p = proportions(look);
  const b = new MeshBuilder(p);
  const accessories = look.accessories ?? [];
  buildBody(b, look, { arm: topArmCover(look), leg: bottomLegCover(look), tattoo: accessories.includes('tattooArms') });
  const head = new Head(b, look);
  head.build();
  buildBottom(b, look, topTucked(look));
  buildTop(b, look);
  buildHair(b, accessories.includes('cap') && UNDER_CAP.has(look.hair) ? { ...look, hair: 'short' } : look, head);
  buildAccessories(b, look, head);
  const posed = relaxed(b, p);
  return { geometry: b.build(bakeAO(posed.pos, posed.nrm, b.idx)), proportions: p };
}

/** The stance occlusion is baked in: arms off the hips, feet apart, as a character mostly stands. */
const AO_POSE: Partial<Record<BoneName, readonly [number, number, number]>> = {
  upperArmL: [0, 0, 0.42], upperArmR: [0, 0, -0.42], thighL: [0, 0, 0.1], thighR: [0, 0, -0.1],
};

/** Linear-blend skin the built mesh into AO_POSE. */
function relaxed(b: MeshBuilder, p: Proportions): { pos: Float32Array; nrm: Float32Array } {
  const rot = BONES.map(() => new Quaternion());
  const joint = BONES.map(() => new Vector3());
  const bind = BONES.map((name) => new Vector3(...bindPosition(p, name)));
  BONES.forEach((name, i) => {
    const local = new Quaternion().setFromEuler(new Euler(...(AO_POSE[name] ?? [0, 0, 0])));
    const parent = BONE_PARENT[name];
    if (!parent) {
      rot[i].copy(local);
      joint[i].copy(bind[i]);
      return;
    }
    const pi = boneIndex(parent);
    rot[i].copy(rot[pi]).multiply(local);
    joint[i].copy(bind[i]).sub(bind[pi]).applyQuaternion(rot[pi]).add(joint[pi]);
  });
  const n = b.vertexCount;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const v = new Vector3();
  const acc = new Vector3();
  const accN = new Vector3();
  for (let i = 0; i < n; i++) {
    acc.set(0, 0, 0);
    accN.set(0, 0, 0);
    for (let j = 0; j < 4; j++) {
      const w = b.skW[i * 4 + j];
      if (w <= 0) continue;
      const bi = b.skI[i * 4 + j];
      v.set(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]).sub(bind[bi]).applyQuaternion(rot[bi]).add(joint[bi]);
      acc.addScaledVector(v, w);
      v.set(b.nrm[i * 3], b.nrm[i * 3 + 1], b.nrm[i * 3 + 2]).applyQuaternion(rot[bi]);
      accN.addScaledVector(v, w);
    }
    accN.normalize();
    pos.set([acc.x, acc.y, acc.z], i * 3);
    nrm.set([accN.x, accN.y, accN.z], i * 3);
  }
  return { pos, nrm };
}
