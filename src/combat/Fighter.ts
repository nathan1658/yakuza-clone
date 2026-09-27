/**
 * Per-character combat bookkeeping, stored on c.userData so every combat
 * module can reach it from an ICharacter without a lookup table.
 */
import type { CombatState, ICharacter } from '../core/types';
import type { MoveDef, MoveId } from './moves';

export type AttackInput = 'light' | 'heavy';

export interface Fighter {
  readonly c: ICharacter;
  readonly isPlayer: boolean;
  /** Seconds in the current combat state (own clock; c.stateTime mirrors it). */
  t: number;
  /** How long the current timed state lasts. */
  stateDur: number;

  move: MoveDef | null;
  /** Normalised progress through the move's clip (tracked here, not read from the rig). */
  norm: number;
  /** Clip duration at normal speed. */
  clipDur: number;
  /** Current playback duration: longer while telegraphing. */
  curDur: number;
  /** Norm at which a telegraphed windup ends; 0 = not telegraphing. */
  windupTo: number;
  hitTimes: readonly number[];
  hitIndex: number;
  focus: ICharacter | null;
  queued: AttackInput | null;
  /** Light attacks thrown in the current string. */
  chain: number;
  /** Time left to continue the string after a move ends. */
  chainTimer: number;
  /** Enemy string being played out. */
  pattern: readonly MoveId[] | null;
  patternIndex: number;
  /** Bumped whenever the fighter commits to an attack (enemies read it to guard). */
  attackSerial: number;
  /** Bumped whenever this fighter reacts to a hit (the AI hesitates after taking one). */
  hitSerial: number;
  /** Seconds since this fighter last reeled from a hit. */
  sinceHurt: number;
  /** Flinches taken in a row (under BREAKOUT.gap apart): a thug breaks out at BREAKOUT.flinches. */
  combo: number;

  /** Horizontal slide with linear decay (knockback, dodges). */
  slideVx: number;
  slideVz: number;
  slideT: number;
  slideDur: number;

  poiseAccum: number;
  poiseTimer: number;

  /** This dodge already paid out its perfect-dodge bonus. */
  perfectDodged: boolean;

  /** The guard button is held (the player re-enters guard when able). */
  guardHeld: boolean;
  blockStun: number;

  /** Boss phase (1-based) — 0 for everyone else. */
  phase: number;
  /** Every attack gets hyper armour (烏鴉 from phase 2). */
  armored: boolean;
  /** 烏鴉 is down on one knee, waiting for the finisher. */
  kneeling: boolean;

  weaponSwings: number;
  grabPunches: number;
  grabbing: ICharacter | null;
  grabbedBy: ICharacter | null;
}

const KEY = 'combat';

export function fighterOf(c: ICharacter): Fighter {
  const existing = c.userData[KEY] as Fighter | undefined;
  if (existing) return existing;
  const f: Fighter = {
    c,
    isPlayer: c.role === 'player',
    t: 0,
    stateDur: Infinity,
    move: null,
    norm: 0,
    clipDur: 1,
    curDur: 1,
    windupTo: 0,
    hitTimes: [],
    hitIndex: 0,
    focus: null,
    queued: null,
    chain: 0,
    chainTimer: 0,
    pattern: null,
    patternIndex: 0,
    attackSerial: 0,
    hitSerial: 0,
    sinceHurt: Infinity,
    combo: 0,
    slideVx: 0,
    slideVz: 0,
    slideT: 0,
    slideDur: 0,
    poiseAccum: 0,
    poiseTimer: 0,
    perfectDodged: false,
    guardHeld: false,
    blockStun: 0,
    phase: 0,
    armored: false,
    kneeling: false,
    weaponSwings: 0,
    grabPunches: 0,
    grabbing: null,
    grabbedBy: null,
  };
  c.userData[KEY] = f;
  return f;
}

/** Enter a combat state; `dur` is how long a timed state lasts. */
export function setState(f: Fighter, state: CombatState, dur = Infinity): void {
  f.c.combatState = state;
  f.c.stateTime = 0;
  f.t = 0;
  f.stateDur = dur;
}

/** Start a decaying slide covering `dist` metres along (dx, dz) in `dur` seconds. */
export function slide(f: Fighter, dx: number, dz: number, dist: number, dur: number): void {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6 || dist <= 0 || dur <= 0) {
    f.slideDur = 0;
    return;
  }
  // Linear decay from v0 to 0 covers v0·dur/2, so v0 = 2·dist/dur.
  const v0 = (2 * dist) / dur;
  f.slideVx = (dx / len) * v0;
  f.slideVz = (dz / len) * v0;
  f.slideT = 0;
  f.slideDur = dur;
}

export function canAct(c: ICharacter): boolean {
  return c.combatState === 'idle' || c.combatState === 'moving';
}
