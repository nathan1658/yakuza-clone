/**
 * Heat actions (the 極み moves): which one fits the moment, and the script each
 * one plays. Pure data; HeatActions.ts performs it.
 *
 * Cue times are script seconds (game time, so bullet time slows them too) and
 * were placed on the clips' impact frames: clip start + duration x impactAt.
 * Shot coordinates are in the action frame: origin on the ground midway
 * between the player and the target, +z along the player's facing, +x to the
 * player's right, +y up.
 */
import type { AnimClip, CombatState, EaseName, InputAction, SfxId, WeaponKind } from '../core/types';
import { STANDING } from './hitTest';
import { HEAT } from './tables';

export type HeatActionId =
  | 'chair_crusher' | 'bottle_baptism' | 'cone_head' | 'curb_stomp' | 'wall_slam'
  | 'shoulder_throw' | 'rage_rush' | 'stagger_rush' | 'crow_killer';

/** How the victim reacts to a scripted blow; 'keep' leaves the current clip playing. */
export type HeatReaction = 'hitHeavy' | 'stagger' | 'knockdown' | 'downed' | 'keep';
export type WeaponCue = 'break' | 'coneOn' | 'coneOff';
export type V3 = readonly [number, number, number];

export interface AnimCue {
  readonly at: number;
  readonly do: 'player' | 'target';
  readonly clip: AnimClip;
}

export interface HitCue {
  readonly at: number;
  readonly do: 'hit';
  readonly damage: number;
  readonly reaction: HeatReaction;
  readonly sfx: readonly SfxId[];
  /** The target strikes the player instead (a failed finisher). */
  readonly on?: 'player';
  /** Kills outright, whatever is left (the boss's phase floors don't apply). */
  readonly lethal?: boolean;
  readonly weapon?: WeaponCue;
  /** Drive the victim back into the wall behind it. */
  readonly toWall?: boolean;
  /** Send the victim sliding this far along the player's facing. */
  readonly slide?: number;
  /** Bullet-time beat and a camera hit. */
  readonly big?: boolean;
}

export type HeatCue = AnimCue | HitCue;

export interface HeatShot {
  readonly from: V3;
  readonly to?: V3;
  readonly look: V3;
  readonly toLook?: V3;
  readonly fov?: number;
  readonly dur: number;
  readonly ease?: EaseName;
}

/** The finisher's button prompt: the script holds at `at` until it resolves. */
export interface HeatQte {
  readonly at: number;
  readonly count: readonly [number, number];
  readonly pool: readonly InputAction[];
  /** Seconds per key. */
  readonly windowSec: number;
  readonly successShots: readonly HeatShot[];
  /** Played instead of the rest of the script when the prompt is missed. */
  readonly fail: readonly HeatCue[];
  readonly failDuration: number;
  readonly failShots: readonly HeatShot[];
}

export interface HeatActionDef {
  readonly id: HeatActionId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly cost: number;
  readonly duration: number;
  /** Sorted by `at`. */
  readonly cues: readonly HeatCue[];
  readonly shots: readonly HeatShot[];
  readonly qte?: HeatQte;
}

// ---------------------------------------------------------------------------
// Camera angles, split into a lead-in and an impact shot per action.

type Angle = Omit<HeatShot, 'dur'>;
const SIDE: Angle = { from: [3.1, 1.35, -0.2], to: [2.6, 1.25, 0.2], look: [0, 1.05, 0], toLook: [0, 1, 0.1], ease: 'outQuad' };
const OFF_SIDE: Angle = { from: [-2.9, 1.5, 0.4], to: [-2.3, 1.3, 0.2], look: [0, 1.1, 0], ease: 'outQuad' };
const SHOULDER: Angle = { from: [0.8, 1.7, -2.6], to: [0.6, 1.55, -2], look: [0, 1.05, 0.5], ease: 'outQuad' };
/**
 * Over the victim's shoulder, low, looking up at the player's face. 1.7 m out so a standing
 * victim (烏鴉 in the finisher) doesn't hide the player: the sightline clears him by ~0.56 m.
 */
const HERO: Angle = { from: [-1.7, 0.9, 2.8], to: [-1.5, 1.0, 2.4], look: [0, 1.35, -0.4], ease: 'outQuad' };
const HIGH: Angle = { from: [2.2, 2.7, 1.2], to: [1.8, 2.3, 0.9], look: [0, 0.3, 0.3], ease: 'outQuad' };
const TIGHT: Angle = { from: [1.6, 1.2, 1.4], to: [1.3, 1.15, 1.1], look: [0, 1, 0.45], fov: 42, ease: 'outCubic' };

const shot = (a: Angle, dur: number): HeatShot => ({ ...a, dur });

const hit = (at: number, damage: number, reaction: HeatReaction, sfx: readonly SfxId[], more: Partial<HitCue> = {}): HitCue => ({
  at, do: 'hit', damage, reaction, sfx, ...more,
});
const player = (at: number, clip: AnimClip): AnimCue => ({ at, do: 'player', clip });
const target = (at: number, clip: AnimClip): AnimCue => ({ at, do: 'target', clip });

/** 怒火連環拳: six fists in 0.72 s riding the rush clip. */
const RUSH_HITS: readonly HitCue[] = [0.24, 0.384, 0.528, 0.672, 0.816, 0.96].map((at, i) =>
  hit(at, 5, i === 0 ? 'stagger' : 'keep', ['punch_heavy']),
);

export const HEAT_ACTIONS: Readonly<Record<HeatActionId, HeatActionDef>> = {
  chair_crusher: {
    id: 'chair_crusher', nameZh: '摺凳伺候', nameEn: 'Chair Crusher', cost: HEAT.cost, duration: 1.9,
    cues: [
      player(0, 'weaponSwing'),
      hit(0.25, 20, 'hitHeavy', ['chair_hit']),
      player(0.6, 'weaponOverhead'),
      hit(1.04, 25, 'knockdown', ['chair_hit'], { weapon: 'break', big: true }),
    ],
    shots: [shot(SIDE, 0.9), shot(TIGHT, 1.1)],
  },
  bottle_baptism: {
    id: 'bottle_baptism', nameZh: '啤酒樽洗禮', nameEn: 'Bottle Baptism', cost: HEAT.cost, duration: 1.5,
    cues: [
      player(0, 'weaponOverhead'),
      hit(0.44, 40, 'knockdown', ['punch_heavy'], { weapon: 'break', big: true }),
    ],
    shots: [shot(SHOULDER, 0.5), shot(TIGHT, 1.1)],
  },
  cone_head: {
    id: 'cone_head', nameZh: '雪糕筒笠頭', nameEn: 'Cone Head', cost: HEAT.cost, duration: 1.7,
    cues: [
      player(0, 'weaponOverhead'),
      hit(0.44, 15, 'stagger', ['cone_hit'], { weapon: 'coneOn' }),
      player(0.8, 'frontKick'),
      hit(1.05, 20, 'knockdown', ['kick'], { weapon: 'coneOff', big: true }),
    ],
    shots: [shot(SIDE, 0.8), shot(TIGHT, 1)],
  },
  curb_stomp: {
    id: 'curb_stomp', nameZh: '落地踩爆', nameEn: 'Curb Stomp', cost: HEAT.cost, duration: 1.5,
    cues: [
      player(0, 'stomp'),
      hit(0.33, 15, 'downed', ['stomp']),
      player(0.65, 'stomp'),
      hit(0.98, 25, 'downed', ['stomp', 'punch_heavy'], { big: true }),
    ],
    shots: [shot(HIGH, 1.6)],
  },
  wall_slam: {
    id: 'wall_slam', nameZh: '撼牆', nameEn: 'Wall Slam', cost: HEAT.cost, duration: 2.1,
    cues: [
      player(0, 'grabHold'),
      target(0, 'grabbed'),
      player(0.25, 'heavyPunch'),
      hit(0.66, 20, 'hitHeavy', ['punch_heavy', 'impact_boom'], { toWall: true, big: true }),
      player(1.1, 'frontKick'),
      hit(1.35, 30, 'knockdown', ['kick'], { big: true }),
    ],
    shots: [shot(OFF_SIDE, 0.7), shot(SIDE, 1.5)],
  },
  shoulder_throw: {
    id: 'shoulder_throw', nameZh: '過膊摔', nameEn: 'Shoulder Throw', cost: HEAT.cost, duration: 1.6,
    cues: [
      player(0, 'throwToss'),
      target(0.15, 'thrown'),
      hit(0.5, 40, 'keep', ['body_fall', 'impact_boom'], { slide: 1.8, big: true }),
    ],
    shots: [shot(HERO, 0.6), shot(SIDE, 1.1)],
  },
  rage_rush: {
    id: 'rage_rush', nameZh: '怒火連環拳', nameEn: 'Rage Rush', cost: HEAT.max, duration: 2.3,
    cues: [
      player(0, 'rushPunch'),
      ...RUSH_HITS,
      player(1.2, 'uppercut'),
      hit(1.5, 30, 'knockdown', ['punch_heavy', 'impact_boom'], { big: true }),
    ],
    shots: [shot(HERO, 1), shot(SIDE, 1.4)],
  },
  stagger_rush: {
    id: 'stagger_rush', nameZh: '亂拳收皮', nameEn: 'Stagger Rush', cost: HEAT.cost, duration: 2.1,
    cues: [
      player(0, 'hook'),
      hit(0.24, 15, 'hitHeavy', ['punch_heavy']),
      player(0.5, 'uppercut'),
      hit(0.8, 20, 'stagger', ['punch_heavy']),
      player(1.1, 'spinKick'),
      hit(1.57, 25, 'knockdown', ['kick'], { big: true }),
    ],
    shots: [shot(SIDE, 1), shot(OFF_SIDE, 1.2)],
  },
  crow_killer: {
    id: 'crow_killer', nameZh: '極道・鴉殺', nameEn: 'Crow Slayer', cost: 0, duration: 2.4,
    cues: [
      player(0, 'grabHold'),
      target(0, 'grabbed'),
      player(0.6, 'heavyPunch'),
      hit(1.01, 60, 'knockdown', ['punch_heavy', 'impact_boom'], { lethal: true, big: true }),
    ],
    // Long enough to outlast the button prompt; the outcome's shots replace it.
    shots: [{ ...HERO, dur: 8, ease: 'linear' }],
    qte: {
      at: 0.55,
      count: [3, 4],
      pool: ['lightAttack', 'heavyAttack', 'grab', 'guard'],
      windowSec: 1,
      successShots: [shot(TIGHT, 0.5), shot(SIDE, 1.4)],
      fail: [
        target(0, 'heavyPunch'),
        hit(0.41, 25, 'knockdown', ['punch_heavy'], { on: 'player', big: true }),
      ],
      failDuration: 1.4,
      failShots: [shot(OFF_SIDE, 1.5)],
    },
  },
};

const WEAPON_ACTION: Readonly<Record<WeaponKind, HeatActionId>> = {
  folding_chair: 'chair_crusher',
  wooden_stool: 'chair_crusher',
  beer_bottle: 'bottle_baptism',
  traffic_cone: 'cone_head',
};

export interface HeatQuery {
  readonly heat: number;
  /** 烏鴉 is on his knees waiting for it. */
  readonly finisher: boolean;
  readonly isBoss: boolean;
  readonly targetState: CombatState;
  /** The player is holding this target in a grab. */
  readonly grabbing: boolean;
  readonly weapon: WeaponKind | null;
  readonly wallBehind: boolean;
}

/** The heat action this situation calls for, or null if none is on. */
export function selectHeatAction(q: HeatQuery): HeatActionDef | null {
  if (q.finisher) return HEAT_ACTIONS.crow_killer;
  if (q.heat < HEAT.cost) return null;
  // The boss only opens up once he's reeling or held.
  if (q.isBoss && q.targetState !== 'staggered' && q.targetState !== 'grabbed') return null;
  const id = situational(q);
  return id && HEAT_ACTIONS[id].cost <= q.heat ? HEAT_ACTIONS[id] : null;
}

function situational(q: HeatQuery): HeatActionId | null {
  if (q.targetState === 'downed') return 'curb_stomp';
  if (!STANDING.has(q.targetState)) return null;
  if (q.weapon) return WEAPON_ACTION[q.weapon];
  if (q.grabbing) return q.wallBehind ? 'wall_slam' : 'shoulder_throw';
  if (q.wallBehind) return 'wall_slam';
  if (q.heat >= HEAT.max) return 'rage_rush';
  return q.targetState === 'staggered' ? 'stagger_rush' : null;
}
