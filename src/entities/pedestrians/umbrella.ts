/**
 * Umbrella prop and the walk that carries it. One merged geometry (shaft +
 * open canopy) shared by all umbrellas; the vertex colour darkens the shaft
 * and the material colour tints the canopy, so each umbrella is one draw call.
 */
import {
  BufferAttribute, ConeGeometry, CylinderGeometry, DoubleSide, Mesh, MeshStandardMaterial, SphereGeometry, type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AnimClipDef, Pose } from '../../core/types';
import { WALK } from '../anim/clips/locomotion';
import { gaitClip } from '../anim/gait';

const CANOPY_COLORS = [0x151515, 0x1c2a4a, 0x7a1a1a, 0x2f4f3a, 0xd8d4c8, 0x5a3a6a] as const;
const SHAFT = 0.95;

function tinted(g: BufferGeometry, shade: number): BufferGeometry {
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(shade), 3));
  return g.index ? g.toNonIndexed() : g;
}

const geometry = mergeGeometries([
  tinted(new CylinderGeometry(0.011, 0.011, SHAFT, 6).translate(0, SHAFT / 2 - 0.1, 0), 0.12),
  tinted(new ConeGeometry(0.58, 0.24, 10, 1, true).translate(0, SHAFT - 0.02, 0), 1),
  tinted(new SphereGeometry(0.018, 6, 4).translate(0, SHAFT + 0.11, 0), 0.12),
]);
geometry.computeBoundingSphere();

const materials = CANOPY_COLORS.map(
  (color) => new MeshStandardMaterial({ color, vertexColors: true, side: DoubleSide, roughness: 0.45 }),
);

/** Held in the left palm socket: the socket's +Y (grip axis) is the shaft. */
export function createUmbrella(pick: number): Mesh {
  const m = new Mesh(geometry, materials[Math.floor(pick * materials.length) % materials.length]);
  m.name = 'umbrella';
  return m;
}

/** Left forearm level in front of the chest, fist upright; right arm swings. */
const upper = (p: number): Pose => {
  const c = Math.cos(2 * Math.PI * p);
  return {
    spine: [0.02, 0.06 * c, 0],
    chest: [0.02, 0.05 * c, 0],
    neck: [-0.02, -0.04 * c, 0],
    head: [-0.01, 0, 0],
    upperArmL: [-0.35, 0, 0.14],
    forearmL: [-1.22, 0, 0],
    handL: [0, 0, 0],
    upperArmR: [-0.3 * c, 0, -0.08],
    forearmR: [-0.25, 0, 0],
    handR: [0, 0, -0.1],
  };
};

export const UMBRELLA_WALK: AnimClipDef = gaitClip({ ...WALK, name: 'umbrellaWalk', upper });
