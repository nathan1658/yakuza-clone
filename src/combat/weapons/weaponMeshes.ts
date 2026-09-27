/**
 * Low-poly street weapons. Each model is centred on its collider (the root's
 * origin) and extends along +Y away from where the hand grips it: the rig's
 * palm socket points +Y forward out of the fist, so a held weapon needs no
 * extra rotation, only an offset that puts the grip in the palm.
 */
import {
  BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3,
  type BufferGeometry, type Material,
} from 'three';
import type { WeaponKind } from '../../core/types';

export interface WeaponModel {
  readonly root: Group;
  /** Collider half extents. */
  readonly half: Vector3;
  /** Grip point in root space; while held the root sits at -grip in the socket. */
  readonly grip: Vector3;
  /** What its broken pieces are made of. */
  readonly shardMaterial: Material;
}

interface Part {
  readonly geo: BufferGeometry;
  readonly mat: Material;
  readonly at: readonly [number, number, number];
  readonly flip?: boolean;
}

interface Blueprint {
  readonly half: readonly [number, number, number];
  readonly grip: readonly [number, number, number];
  readonly parts: readonly Part[];
}

const mat = (color: number, roughness: number, metalness = 0, opacity = 1): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness, metalness, transparent: opacity < 1, opacity });

const box = (x: number, y: number, z: number): BoxGeometry => new BoxGeometry(x, y, z);

function chair(): Blueprint {
  const steel = mat(0x8a8f96, 0.45, 0.7);
  const seat = mat(0x9b2d2d, 0.7);
  const rail = box(0.03, 0.86, 0.03);
  return {
    half: [0.22, 0.43, 0.05],
    grip: [0, -0.4, 0],
    parts: [
      { geo: rail, mat: steel, at: [-0.19, 0, 0] },
      { geo: rail, mat: steel, at: [0.19, 0, 0] },
      { geo: box(0.38, 0.025, 0.025), mat: steel, at: [0, -0.05, 0] },
      { geo: box(0.38, 0.36, 0.025), mat: seat, at: [0, 0.2, 0.02] },
      { geo: box(0.38, 0.16, 0.02), mat: seat, at: [0, -0.28, 0.02] },
    ],
  };
}

function stool(): Blueprint {
  const wood = mat(0xa0673a, 0.8);
  const leg = box(0.035, 0.44, 0.035);
  const legs = [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]] as const;
  return {
    half: [0.17, 0.25, 0.17],
    // Swung by one leg.
    grip: [0.14, -0.21, 0.14],
    parts: [
      { geo: box(0.34, 0.04, 0.34), mat: wood, at: [0, 0.23, 0] },
      ...legs.map(([x, z]): Part => ({ geo: leg, mat: wood, at: [x, 0, z] })),
    ],
  };
}

function cone(): Blueprint {
  const orange = mat(0xff6a13, 0.6);
  return {
    half: [0.18, 0.32, 0.18],
    // Held by the tip, base out: the business end.
    grip: [0, -0.3, 0],
    parts: [
      { geo: new ConeGeometry(0.16, 0.6, 12), mat: orange, at: [0, -0.02, 0], flip: true },
      { geo: new CylinderGeometry(0.078, 0.056, 0.08, 12, 1, true), mat: mat(0xf2f2f2, 0.4), at: [0, -0.08, 0] },
      { geo: box(0.36, 0.03, 0.36), mat: mat(0x1a1a1a, 0.9), at: [0, 0.3, 0] },
    ],
  };
}

function bottle(): Blueprint {
  const glass = mat(0x1f6b2a, 0.15, 0.1, 0.85);
  return {
    half: [0.035, 0.12, 0.035],
    // Held by the neck.
    grip: [0, -0.1, 0],
    parts: [
      { geo: new CylinderGeometry(0.035, 0.035, 0.12, 10), mat: glass, at: [0, 0.06, 0] },
      { geo: new CylinderGeometry(0.035, 0.014, 0.04, 10), mat: glass, at: [0, -0.02, 0] },
      { geo: new CylinderGeometry(0.013, 0.014, 0.08, 8), mat: glass, at: [0, -0.08, 0] },
      { geo: new CylinderGeometry(0.0365, 0.0365, 0.06, 10, 1, true), mat: mat(0xe8d9a8, 0.8), at: [0, 0.06, 0] },
    ],
  };
}

const BUILDERS: Readonly<Record<WeaponKind, () => Blueprint>> = {
  folding_chair: chair,
  wooden_stool: stool,
  traffic_cone: cone,
  beer_bottle: bottle,
};

/** Geometry and materials are built once per kind and shared by every copy. */
const cache = new Map<WeaponKind, Blueprint>();

export function buildWeaponModel(kind: WeaponKind): WeaponModel {
  let bp = cache.get(kind);
  if (!bp) {
    bp = BUILDERS[kind]();
    cache.set(kind, bp);
  }
  const root = new Group();
  root.name = `weapon:${kind}`;
  for (const p of bp.parts) {
    const m = new Mesh(p.geo, p.mat);
    m.position.set(p.at[0], p.at[1], p.at[2]);
    if (p.flip) m.rotation.x = Math.PI;
    m.castShadow = true;
    root.add(m);
  }
  return {
    root,
    half: new Vector3(...bp.half),
    grip: new Vector3(...bp.grip),
    shardMaterial: bp.parts[0].mat,
  };
}
