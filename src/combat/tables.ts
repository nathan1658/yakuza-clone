/**
 * Combat tuning as data. Every number that shapes the feel of a fight lives
 * here so balancing never means hunting through runtime code.
 */
import type { AppearancePreset, CharacterRole, CombatStats } from '../core/types';

export const PLAYER_ID = 'player';
export const BOSS_ID = 'boss_crow';

/** Locomotion speed (m/s, before stats.speed) while circling in a fight. */
export const COMBAT_MOVE_SPEED = 3.2;
/** Horizontal speed that counts as sprinting (enables the running drop kick). */
export const SPRINT_SPEED_MIN = 5.5;
/** Seconds after an attack ends during which the next press continues the string. */
export const CHAIN_GRACE = 0.25;
/** Seconds without being hit after which accumulated poise damage is forgiven. */
export const POISE_RESET = 2;
/** Seconds spent lying on the ground before getting up. */
export const DOWNED_TIME = { player: 0.8, enemy: 1.1 } as const;
/** Getting up is protected so the player can't be juggled forever. */
export const GETUP_TIME = 1.0;
export const STAGGER_TIME = 0.9;
export const BLOCK_STUN = 0.25;
/**
 * A thug caught in a string shrugs off the Nth flinch in a row (hits under `gap`
 * seconds apart) and shoves the attacker away: mashing one button gets
 * interrupted, mixing in heavies, grabs and throws doesn't.
 */
export const BREAKOUT = { flinches: 3, gap: 1.0 } as const;
/**
 * Past this many thugs up, each one waits proportionally longer between strings,
 * so a big crowd presses about as hard as three do (the crowd is the threat, not the rate).
 */
export const CROWD = { norm: 3 } as const;

export const DODGE = {
  /** Metres travelled by a dodge. */
  distance: 2.2,
  /** Seconds the dodge slide lasts (the clip is a little longer). */
  slideDur: 0.4,
  /** Invulnerability window, seconds since the dodge started. */
  iFrom: 0.05,
  iTo: 0.3,
  /** A hit that arrives within this window is a perfect dodge (bullet time). */
  perfectTo: 0.15,
} as const;

export const HEAT = {
  max: 100,
  /** One heat action's worth: the [F] prompt appears from here. */
  ready: 33,
  cost: 33,
  light: 3,
  heavy: 6,
  weapon: 8,
  perfectDodge: 10,
  takeHit: -6,
  /** Seconds without gaining heat before it starts draining (only in a fight). */
  drainDelay: 8,
  /** Heat per second while draining. */
  drainRate: 1,
} as const;

/** Share of damage that gets through a guard. */
export const GUARD_FACTOR = 0.15;

/** Hitstop: gameplay slows to `scale` for a few real milliseconds on contact. */
export const HITSTOP = { scale: 0.05, light: 0.045, heavy: 0.08, blocked: 0.03 } as const;

/** Bullet time after a perfect dodge (scale, real seconds). */
export const PERFECT_DODGE_SLOWMO = { scale: 0.35, dur: 0.6 } as const;
/** Final-blow slow motion when an encounter is won. */
export const VICTORY_SLOWMO = { scale: 0.25, dur: 1.0 } as const;

export type ArchetypeId = 'goon' | 'lieutenant' | 'collector' | 'boss';

export interface Archetype {
  displayName: string;
  role: Extract<CharacterRole, 'enemy' | 'boss'>;
  presets: readonly AppearancePreset[];
  stats: CombatStats;
  /** Always gets an attack token (doesn't wait for the goons' turn). */
  reservedToken: boolean;
  /** Chance to raise the guard against each player attack from the front. */
  guardChance: number;
  /** Chance to go for a weapon lying nearby when the fight starts. */
  pickupChance: number;
  /** Seconds between attacks (random in range). */
  cooldown: readonly [number, number];
  /**
   * A leader lets his boys go first: he circles wide and jeers until no more
   * than this many others are standing, or until someone lands a blow on him.
   */
  holdBack?: number;
}

export const ARCHETYPES: Readonly<Record<ArchetypeId, Archetype>> = {
  goon: {
    displayName: '東星打仔',
    role: 'enemy',
    presets: ['tsGoonA', 'tsGoonB', 'tsGoonC', 'tsGoonD'],
    stats: { power: 1, defense: 1, speed: 1, poise: 0 },
    reservedToken: false,
    guardChance: 0.15,
    pickupChance: 0.2,
    cooldown: [2.0, 3.6],
  },
  lieutenant: {
    displayName: '笑面虎',
    role: 'enemy',
    presets: ['tsLieutenant'],
    // Softened after typhoon_ambush killed the play-test masher (he dealt half of it).
    stats: { power: 1.1, defense: 0.9, speed: 1.05, poise: 30 },
    reservedToken: true,
    guardChance: 0.4,
    pickupChance: 0,
    cooldown: [1.6, 3.0],
    // Watches his boys work the player over, then steps in (or the moment he's hit).
    holdBack: 0,
  },
  collector: {
    displayName: '收數佬',
    role: 'enemy',
    presets: ['tsGoonB', 'tsGoonD'],
    stats: { power: 1.1, defense: 1, speed: 1, poise: 0 },
    reservedToken: false,
    guardChance: 0.25,
    pickupChance: 0,
    cooldown: [1.4, 3.0],
  },
  boss: {
    displayName: '烏鴉',
    role: 'boss',
    presets: ['crow'],
    // 1.05 from live bot fights: a dodge-and-punish player took ~2 HP/s at 1.3 and died in phase 3 of a ~145 s fight.
    stats: { power: 1.05, defense: 0.8, speed: 1.1, poise: 60 },
    reservedToken: true,
    guardChance: 0.35,
    pickupChance: 0,
    cooldown: [0.8, 1.6],
  },
};

/** How many enemies may be winding up an attack on the player at once. */
export const MAX_ATTACK_TOKENS = 2;

/** Boss tuning per phase (index = phase - 1). */
export const BOSS_PHASES = [
  { cooldown: [0.8, 1.6], guardChance: 0.35, speedMul: 1, armor: false, flipCooldown: Infinity, grab: false },
  { cooldown: [0.7, 1.4], guardChance: 0.3, speedMul: 1, armor: true, flipCooldown: 8, grab: false },
  { cooldown: [0.5, 1.1], guardChance: 0.25, speedMul: 1.15, armor: true, flipCooldown: 5, grab: true },
] as const;

export const BOSS_LINES = {
  speaker: '烏鴉',
  phase2: '好！有啲料到！不過我烏鴉唔係講玩㗎！',
  phase3: '仆街！今晚唔係你死就係我亡！',
  kneel: '……咳…你…你好嘢……',
} as const;

export const BOSS_BAR = { name: '烏鴉', title: '東星 ・ 瘋狗烏鴉' } as const;
