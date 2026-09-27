/**
 * Every strike in the game as data: player strings, enemy patterns and the
 * boss moveset. The runtime only interprets these records.
 */
import type { AnimClip, HitEvent, SfxId } from '../core/types';

/** How a clean (unguarded, unarmoured) hit wants the target to react. */
export type ReactionKind = 'light' | 'heavy' | 'stagger' | 'knockback' | 'knockdown' | 'launch';
export type HitKind = HitEvent['kind'];

export interface MoveDef {
  readonly id: MoveId;
  readonly clip: AnimClip;
  /** Total damage, split evenly over the hits. */
  readonly damage: number;
  readonly kind: HitKind;
  /** Metres from the attacker's centre to the target's capsule surface. */
  readonly reach: number;
  /** Full width of the hit cone, radians. */
  readonly arc: number;
  /** Sweeps: hits everyone in the cone instead of only the best target. */
  readonly multi: boolean;
  /** Reaction of the last hit; earlier hits of a flurry are light. */
  readonly reaction: ReactionKind;
  /** Metres the target slides on knockback / knockdown. */
  readonly knockback: number;
  readonly guardBreak: boolean;
  /** Closing speed (m/s) towards the focus target until the strike lands. */
  readonly lunge: number;
  readonly hitsDowned: boolean;
  readonly sfx: SfxId;
  readonly whoosh: SfxId | null;
  /** Heat the player gains per connecting hit. */
  readonly heat: number;
  readonly hyperArmor: boolean;
  /** Extra windup seconds so the player can read it (enemy moves). */
  readonly telegraph: number;
  /** Weapon durability lost per connecting hit. */
  readonly wear: number;
  /** The active frame releases the held weapon as a projectile instead of striking. */
  readonly projectile: boolean;
  /** Normalised hit times; defaults to the clip's impactAt. */
  readonly hits?: readonly number[];
}

const DEG = Math.PI / 180;

const BASE = {
  kind: 'light',
  reach: 1.2,
  arc: 70 * DEG,
  multi: false,
  reaction: 'light',
  knockback: 0,
  guardBreak: false,
  lunge: 1.5,
  hitsDowned: false,
  sfx: 'punch_light',
  whoosh: 'whoosh',
  heat: 0,
  hyperArmor: false,
  telegraph: 0,
  wear: 0,
  projectile: false,
} as const satisfies Omit<MoveDef, 'id' | 'clip' | 'damage'>;

const HEAVY = { kind: 'heavy', sfx: 'punch_heavy', whoosh: 'whoosh_heavy' } as const;
const KICK = { kind: 'heavy', sfx: 'kick', whoosh: 'whoosh_heavy' } as const;
const WEAPON = { kind: 'weapon', reach: 1.6, arc: 110 * DEG, reaction: 'heavy', sfx: 'chair_hit', whoosh: 'whoosh_heavy', wear: 1 } as const;

type Spec = Partial<Omit<MoveDef, 'id' | 'clip' | 'damage'>>;
const def = (clip: AnimClip, damage: number, spec: Spec = {}): Omit<MoveDef, 'id'> => ({ ...BASE, clip, damage, ...spec });

const TABLE = {
  // --- Player: 陳浩南's brawler style ---------------------------------------
  jab: def('jab', 8, { heat: 3 }),
  cross: def('cross', 9, { reach: 1.25, heat: 3 }),
  hook: def('hook', 11, { reach: 1.25, arc: 100 * DEG, heat: 3 }),
  uppercut: def('uppercut', 16, { ...HEAVY, reaction: 'launch', knockback: 1.0, heat: 6 }),
  frontKick: def('frontKick', 18, { ...KICK, reach: 1.5, arc: 60 * DEG, reaction: 'stagger', knockback: 0.8, guardBreak: true, heat: 6 }),
  roundhouse: def('roundhouse', 22, { ...KICK, reach: 1.55, arc: 150 * DEG, multi: true, reaction: 'knockback', knockback: 2, heat: 6 }),
  spinKick: def('spinKick', 28, { ...KICK, reach: 1.6, arc: 300 * DEG, multi: true, reaction: 'knockdown', knockback: 1.6, heat: 6 }),
  stomp: def('stomp', 20, { ...HEAVY, sfx: 'stomp', reach: 1.3, arc: 90 * DEG, reaction: 'knockdown', hitsDowned: true, lunge: 2, heat: 6 }),
  dropKick: def('dropKick', 30, { ...KICK, reach: 1.6, reaction: 'knockdown', knockback: 3, lunge: 7, multi: true, guardBreak: true, heat: 6 }),
  weaponSwing: def('weaponSwing', 22, { ...WEAPON, heat: 8 }),
  weaponSwing2: def('weaponSwing2', 22, { ...WEAPON, heat: 8 }),
  weaponOverhead: def('weaponOverhead', 35, { ...WEAPON, arc: 70 * DEG, reaction: 'knockdown', knockback: 1.4, guardBreak: true, wear: 2, heat: 8 }),
  grabPunch: def('grabPunch', 10, { ...HEAVY, whoosh: null, lunge: 0, heat: 3 }),
  throwToss: def('throwToss', 30, { kind: 'throw', sfx: 'throw', whoosh: 'whoosh_heavy', reaction: 'knockdown', knockback: 3, lunge: 0, heat: 6 }),
  /** A flying weapon connecting (not swung, so no clip timing). */
  thrownWeapon: def('weaponThrow', 25, { ...WEAPON, reaction: 'knockdown', knockback: 1.2, wear: 2, heat: 6, lunge: 0, projectile: true }),
  /** A thrown body bowling over whoever it lands on. */
  bowl: def('thrown', 10, { kind: 'throw', sfx: 'body_fall', whoosh: null, reaction: 'knockdown', knockback: 1.2 }),

  // --- 東星 street goons ------------------------------------------------------
  g_jab: def('jab', 6, { reach: 1.15, telegraph: 0.12 }),
  g_cross: def('cross', 6, { reach: 1.15, telegraph: 0.08 }),
  g_hook: def('hook', 6, { reach: 1.15, arc: 100 * DEG, telegraph: 0.1 }),
  g_kick: def('frontKick', 12, { ...KICK, reach: 1.45, reaction: 'stagger', knockback: 0.8, guardBreak: true, telegraph: 0.35 }),
  /** The breakout (see BREAKOUT): a push kick on hyper armour. Blockable, dodgeable. */
  g_shove: def('frontKick', 6, { ...KICK, reach: 1.4, reaction: 'knockback', knockback: 1.8, hyperArmor: true, lunge: 0, telegraph: 0.12 }),
  lt_roundhouse: def('roundhouse', 20, {
    ...KICK, reach: 1.55, arc: 150 * DEG, reaction: 'knockback', knockback: 1.8, guardBreak: true, hyperArmor: true, telegraph: 0.45,
  }),
  w_swing: def('weaponSwing', 13, { ...WEAPON, reach: 1.5, telegraph: 0.2 }),
  w_swing2: def('weaponSwing2', 12, { ...WEAPON, reach: 1.5, telegraph: 0.12 }),
  w_overhead: def('weaponOverhead', 19, { ...WEAPON, reach: 1.5, arc: 70 * DEG, reaction: 'knockdown', knockback: 1.2, guardBreak: true, wear: 2, telegraph: 0.4 }),

  // --- 烏鴉 ---------------------------------------------------------------------
  b_jab: def('jab', 14, { reach: 1.25, telegraph: 0.1 }),
  b_cross: def('cross', 14, { reach: 1.3, telegraph: 0.06 }),
  b_hook: def('hook', 14, { reach: 1.3, arc: 110 * DEG, telegraph: 0.08 }),
  b_heavy: def('heavyPunch', 28, { ...HEAVY, reach: 1.5, reaction: 'knockdown', knockback: 2.2, guardBreak: true, lunge: 2.5, telegraph: 0.45 }),
  b_rush: def('rushPunch', 22, {
    ...HEAVY, reach: 1.4, reaction: 'knockdown', knockback: 2.5, lunge: 6, telegraph: 0.5, hits: [0.2, 0.44, 0.68, 0.8],
  }),
  b_counter: def('hook', 18, { ...HEAVY, reach: 1.45, arc: 140 * DEG, reaction: 'knockdown', knockback: 1.8, hyperArmor: true, lunge: 3 }),
  b_grabPunch: def('grabPunch', 9, { ...HEAVY, whoosh: null, lunge: 0 }),
  b_throw: def('throwToss', 26, { kind: 'throw', sfx: 'throw', whoosh: 'whoosh_heavy', reaction: 'knockdown', knockback: 3, lunge: 0 }),
  /** The dai pai dong table Crow flips into the player. */
  b_tableFlip: def('throwToss', 35, {
    kind: 'environment', sfx: 'table_flip', whoosh: 'whoosh_heavy', reach: 4, arc: 70 * DEG, multi: true,
    reaction: 'knockdown', knockback: 2.5, guardBreak: true, hyperArmor: true, lunge: 0, telegraph: 0.6,
  }),
} satisfies Record<string, Omit<MoveDef, 'id'>>;

export type MoveId = keyof typeof TABLE;

export const MOVES = Object.fromEntries(
  Object.entries(TABLE).map(([id, m]) => [id, { id, ...m }]),
) as unknown as Readonly<Record<MoveId, MoveDef>>;

/** Enemy strings: a random pattern is picked each time the enemy gets a token. */
export const PATTERNS = {
  goon: [['g_jab', 'g_cross'], ['g_jab', 'g_cross', 'g_hook'], ['g_kick']],
  weapon: [['w_swing'], ['w_swing', 'w_swing2'], ['w_overhead']],
  lieutenant: [['g_jab', 'g_cross', 'g_hook'], ['lt_roundhouse'], ['g_jab', 'g_kick']],
  boss1: [['b_jab', 'b_cross', 'b_hook'], ['b_heavy'], ['b_jab', 'b_cross', 'b_heavy']],
  boss2: [['b_jab', 'b_cross', 'b_hook'], ['b_heavy'], ['b_rush'], ['b_jab', 'b_heavy']],
} as const satisfies Record<string, readonly (readonly MoveId[])[]>;

export type PatternId = keyof typeof PATTERNS;

/** The player's light string; the last entry ends it. */
const LIGHT_CHAIN: readonly MoveId[] = ['jab', 'cross', 'hook', 'uppercut'];

export interface PlayerMoveContext {
  grabbing: boolean;
  grabPunches: number;
  weapon: boolean;
  weaponSwings: number;
  targetDowned: boolean;
  sprinting: boolean;
  /** Light attacks already landed in the current string. */
  chain: number;
}

/** Grab punches before the victim is automatically thrown. */
export const MAX_GRAB_PUNCHES = 3;

/** Picks the player's move for a light/heavy press in the current context. */
export function selectPlayerMove(input: 'light' | 'heavy', s: PlayerMoveContext): MoveId {
  if (s.grabbing) return input === 'light' && s.grabPunches < MAX_GRAB_PUNCHES ? 'grabPunch' : 'throwToss';
  if (s.weapon) return input === 'heavy' ? 'weaponOverhead' : s.weaponSwings % 2 === 0 ? 'weaponSwing' : 'weaponSwing2';
  if (s.targetDowned) return 'stomp';
  if (input === 'heavy' && s.sprinting) return 'dropKick';
  if (input === 'light') return LIGHT_CHAIN[Math.min(s.chain, LIGHT_CHAIN.length - 1)];
  return s.chain === 0 ? 'frontKick' : s.chain < 3 ? 'roundhouse' : 'spinKick';
}

/** Does this move continue the light string (vs. finishing it)? */
export function continuesChain(id: MoveId): boolean {
  const i = LIGHT_CHAIN.indexOf(id);
  return i >= 0 && i < LIGHT_CHAIN.length - 1;
}
