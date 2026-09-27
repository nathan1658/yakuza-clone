/**
 * What each street weapon is: name, how many hits it survives, how hard it
 * hits and what it sounds like. Meshes live in weaponMeshes.ts.
 */
import type { SfxId, WeaponKind } from '../../core/types';

export interface WeaponSpec {
  readonly displayName: string;
  /** Wear points; a swing that connects costs its move's `wear`. */
  readonly durability: number;
  readonly damageMul: number;
  readonly hitSfx: SfxId;
  readonly breakSfx: readonly SfxId[];
  readonly mass: number;
  /** Rotation about the model's X axis that makes it rest naturally (models are built grip-up along +Y). */
  readonly restTilt: number;
  /** Shards thrown out when it breaks. */
  readonly shards: number;
  /** Rough edge length of one shard, metres. */
  readonly shardSize: number;
}

export const WEAPONS: Readonly<Record<WeaponKind, WeaponSpec>> = {
  folding_chair: {
    displayName: '摺凳', durability: 6, damageMul: 1.0, hitSfx: 'chair_hit', breakSfx: ['chair_break'],
    mass: 4, restTilt: -Math.PI / 2, shards: 6, shardSize: 0.12,
  },
  wooden_stool: {
    displayName: '木櫈', durability: 5, damageMul: 0.9, hitSfx: 'chair_hit', breakSfx: ['wood_break'],
    mass: 3, restTilt: 0, shards: 6, shardSize: 0.1,
  },
  traffic_cone: {
    displayName: '雪糕筒', durability: 4, damageMul: 0.6, hitSfx: 'cone_hit', breakSfx: ['cone_hit'],
    mass: 2, restTilt: Math.PI, shards: 4, shardSize: 0.09,
  },
  beer_bottle: {
    displayName: '啤酒樽', durability: 1, damageMul: 1.2, hitSfx: 'bottle_smash', breakSfx: ['bottle_smash', 'glass_break'],
    mass: 0.6, restTilt: Math.PI, shards: 7, shardSize: 0.035,
  },
};

/** Durability left after `wear`; a weapon at 0 breaks. */
export function wearDown(durability: number, wear: number): number {
  return Math.max(0, durability - wear);
}
