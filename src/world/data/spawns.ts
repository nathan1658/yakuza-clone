/** Loose weapons on the streets and Tung Shing turf. Combat and encounters consume these. */
import { Vector3 } from 'three';
import type { PropSpawn, TerritoryDef, WeaponKind } from '../../core/types';
import { zoneAt } from './zones';

const P = (kind: WeaponKind, x: number, z: number, yaw: number): PropSpawn => ({
  kind,
  position: new Vector3(x, 0, z),
  yaw,
  zone: zoneAt(x, z),
});

export const PROP_SPAWNS: readonly PropSpawn[] = [
  // Dai pai dong alley: the tutorial brawl needs a chair within reach of percy_alley.
  P('folding_chair', -82, -57, 0.4),
  P('folding_chair', -90, -61, 2.1),
  P('folding_chair', -79, -63.5, -1.2),
  P('beer_bottle', -92, -55, 0),
  P('beer_bottle', -76, -54.5, 1.3),
  P('wooden_stool', -88, -54, 0.7),
  // Percy Street
  P('wooden_stool', -70.5, -30, 0.2),
  P('beer_bottle', -57.5, -70, 0),
  P('folding_chair', -70.8, -94.8, 1.6),
  // Taper of cones steering eastbound traffic round the Hennessy roadworks pit
  P('traffic_cone', 26, 5.6, 0),
  P('traffic_cone', 28, 6.4, 0.3),
  P('traffic_cone', 30, 7.2, 0),
  P('traffic_cone', 31.8, 8, -0.2),
  P('wooden_stool', -116, 21.6, 0.5),
  P('beer_bottle', -20, 3.8, 0),
  P('folding_chair', 120, 2, -2.4),
  // Typhoon shelter
  P('wooden_stool', -100, -160, 0.3),
  P('wooden_stool', -98, -162.5, 1.1),
  P('beer_bottle', -96, -160.5, 0),
  P('beer_bottle', 10, -170, 0),
  P('folding_chair', -20, -155, 2.8),
  // Sogo plaza edge (arena is r = 14 around (85, 33); these lie just outside it)
  P('folding_chair', 66, 46, 0.9),
  P('folding_chair', 104, 44, -0.9),
  P('beer_bottle', 100, 26, 0),
  P('wooden_stool', 70, 45.5, 0.4),
];

const T = (id: string, x0: number, z0: number, x1: number, z1: number): TerritoryDef => ({
  id,
  zone: zoneAt((x0 + x1) / 2, (z0 + z1) / 2),
  min: { x: x0, z: z0 },
  max: { x: x1, z: z1 },
  faction: 'tungShing',
  encounterChance: 0.15,
});

export const TERRITORIES: readonly TerritoryDef[] = [
  T('percy_north', -72, -130, -56, -80),
  T('hennessy_east', 20, 0, 50, 24),
  T('typhoon_west', -150, -175, -45, -150),
];
