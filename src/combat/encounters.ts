/**
 * Every fight in the game as data. The director only interprets these records.
 */
import type { EncounterId, LocationId, WeaponKind } from '../core/types';
import type { ArchetypeId } from './tables';

export interface EnemySpec {
  archetype: ArchetypeId;
  hp: number;
  weapon?: WeaponKind;
}

export interface RandomSpec {
  count: readonly [number, number];
  hp: readonly [number, number];
  /** HK$ per enemy beaten. */
  rewardPer: readonly [number, number];
}

export interface EncounterDef {
  id: EncounterId;
  /** Arena centre; null = wherever the player is standing (street fights). */
  location: LocationId | null;
  /** A lone boss spawns at the centre facing this location (the way the player walks in). */
  faceToward?: LocationId;
  arenaRadius: number;
  /** Later waves spawn once the previous one is down. */
  waves: readonly (readonly EnemySpec[])[];
  reward: number;
  isBoss: boolean;
  /** Toast announcing the fight (the boss gets its health bar instead). */
  toast: string | null;
  random?: RandomSpec;
  /** Where the first wave appears, metres from the centre (default: close in). */
  spawnRing?: readonly [number, number];
  /** How hard the thugs press: divides their attack cooldowns (default 1, the first alley). */
  aggression?: number;
}

const goon = (hp: number, weapon?: WeaponKind): EnemySpec => ({ archetype: 'goon', hp, weapon });

export const ENCOUNTERS: Readonly<Record<EncounterId, EncounterDef>> = {
  prologue_alley: {
    id: 'prologue_alley',
    location: 'percy_alley',
    arenaRadius: 9,
    waves: [[goon(60), goon(70), goon(60)]],
    reward: 300,
    isBoss: false,
    toast: '後巷混戰：東星打仔 ×3',
  },
  typhoon_ambush: {
    id: 'typhoon_ambush',
    location: 'typhoon_promenade',
    arenaRadius: 14,
    // Chapter 2: lighter than it looks. Four thugs at once plus 笑面虎 is already the pressure.
    waves: [[goon(60), goon(70), goon(60), goon(70), { archetype: 'lieutenant', hp: 200 }]],
    reward: 800,
    isBoss: false,
    toast: '避風塘伏擊：笑面虎帶隊',
  },
  sogo_goons: {
    id: 'sogo_goons',
    location: 'sogo_crossing',
    arenaRadius: 14,
    waves: [[goon(70), goon(80), goon(70)], [goon(80), goon(90)]],
    reward: 600,
    isBoss: false,
    toast: '崇光十字路口：東星攔路',
    aggression: 1.3,
  },
  sogo_boss: {
    id: 'sogo_boss',
    location: 'sogo_plaza',
    faceToward: 'sogo_plaza_entry',
    arenaRadius: 14,
    waves: [[{ archetype: 'boss', hp: 1200 }]],
    reward: 3000,
    isBoss: true,
    toast: null,
  },
  substory_debt: {
    id: 'substory_debt',
    location: 'substory_debt',
    arenaRadius: 12,
    waves: [[
      { archetype: 'collector', hp: 90, weapon: 'beer_bottle' },
      { archetype: 'collector', hp: 90, weapon: 'wooden_stool' },
    ]],
    reward: 500,
    isBoss: false,
    toast: '收數佬嚟找數',
    aggression: 1.15,
  },
  random_street: {
    id: 'random_street',
    location: null,
    arenaRadius: 12,
    waves: [],
    reward: 0,
    isBoss: false,
    toast: '東星打仔埋身！',
    random: { count: [2, 4], hp: [60, 90], rewardPer: [150, 400] },
    // Street thugs step out of the crowd a little way off, then close in.
    spawnRing: [9, 14],
  },
};

type Rand = () => number;

const between = (r: readonly [number, number], rand: Rand): number => r[0] + (r[1] - r[0]) * rand();
const roundTo10 = (n: number): number => Math.round(n / 10) * 10;

/** The waves of an encounter; random fights roll a fresh pack of goons. */
export function resolveWaves(def: EncounterDef, rand: Rand): EnemySpec[][] {
  if (!def.random) return def.waves.map((w) => w.slice());
  const n = Math.round(between(def.random.count, rand));
  const wave: EnemySpec[] = [];
  for (let i = 0; i < n; i++) wave.push(goon(roundTo10(between(def.random.hp, rand))));
  return [wave];
}

/** Money paid out for winning with `enemyCount` enemies beaten. */
export function rewardFor(def: EncounterDef, enemyCount: number, rand: Rand): number {
  if (!def.random) return def.reward;
  return roundTo10(between(def.random.rewardPer, rand) * enemyCount);
}
