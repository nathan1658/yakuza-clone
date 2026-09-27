/**
 * Named NPCs the narrative spawns, and where each one stands as the story
 * moves on. The first placement whose beat range (and flag) matches wins;
 * no match means the NPC is not in the world right now.
 */
import type { Vector3 } from 'three';
import type {
  AnimClip, AppearancePreset, CharacterAppearance, CharacterSpawnDef, Faction, LocationId,
} from '../../core/types';
import type { FlagValue } from '../dialogue/types';
import { beatInRange, type BeatId } from '../story/beats';

export interface NpcPlacement {
  at: LocationId;
  /**
   * World-space XZ offsets from the anchor, tried in order; the first
   * walkable one is used. Default: the anchor itself.
   */
  offsets?: ReadonlyArray<readonly [number, number]>;
  /** Beat range [from, until). */
  from?: BeatId;
  until?: BeatId;
  /** Only while this story flag is truthy. */
  flag?: string;
}

export interface NpcDef {
  id: string;
  name: string;
  role: 'npc' | 'vendor';
  /** Default 'civilian'. */
  faction?: Faction;
  appearance: AppearancePreset | CharacterAppearance;
  idleClip?: AnimClip;
  placements: readonly NpcPlacement[];
}

/** 炒蟹強: stocky boat cook in a sweat-stained singlet. */
const CRAB_KEUNG: CharacterAppearance = {
  height: 1.68,
  build: 'heavy',
  skinTone: 0xb07a4f,
  hair: 'crew',
  hairColor: 0x1a1a1a,
  top: 'singlet',
  topColor: 0xf2efe6,
  bottom: 'shorts',
  bottomColor: 0x2f3b4c,
  shoeColor: 0x3a3a3a,
  accessories: ['watch'],
};

/** A 洪興 brother who turns up for the ending. */
export const BROTHER_APPEARANCE: CharacterAppearance = {
  height: 1.75,
  build: 'normal',
  skinTone: 0xc68e62,
  hair: 'short',
  hairColor: 0x111111,
  top: 'shirt',
  topColor: 0x1f2a44,
  topAccent: 0xffffff,
  bottom: 'jeans',
  bottomColor: 0x25324a,
  accessories: ['goldChain'],
};

const SIDE_STEP: ReadonlyArray<readonly [number, number]> = [[-2.5, 0], [2.5, 0], [0, 2.5], [0, -2.5], [0, 0]];

/** 山雞: in the world most of the story, and walked into two cutscenes. */
export const CHICKEN: NpcDef = {
  id: 'npc_chicken',
  name: '山雞',
  role: 'npc',
  faction: 'hungHing',
  appearance: 'chicken',
  idleClip: 'lean',
  placements: [
    { at: 'percy_informant', until: 'ch2_go_typhoon' },
    { at: 'percy_north', from: 'ch2_go_typhoon', until: 'ch3_crossing' },
    { at: 'percy_informant', from: 'postgame' },
  ],
};

export const NPCS: readonly NpcDef[] = [
  CHICKEN,
  {
    id: 'npc_shrimp',
    name: '蝦叔',
    role: 'npc',
    appearance: 'fishermanUncle',
    idleClip: 'smoke',
    placements: [{ at: 'typhoon_pier', from: 'ch2_go_typhoon' }],
  },
  {
    id: 'npc_auntie',
    name: '魚蛋嬸',
    role: 'vendor',
    appearance: 'vendorAuntie',
    idleClip: 'vendorIdle',
    placements: [{ at: 'percy_curry_fishball' }],
  },
  {
    id: 'npc_ctt_boss',
    name: '冰室老闆',
    role: 'vendor',
    appearance: 'chaChaanTengBoss',
    idleClip: 'vendorIdle',
    placements: [{ at: 'percy_cha_chaan_teng' }],
  },
  {
    id: 'npc_newsstand',
    name: '報紙檔伯伯',
    role: 'vendor',
    appearance: 'newsstandUncle',
    idleClip: 'vendorIdle',
    placements: [{ at: 'hennessy_newsstand' }],
  },
  {
    id: 'npc_crab',
    name: '炒蟹強',
    role: 'vendor',
    appearance: CRAB_KEUNG,
    idleClip: 'vendorIdle',
    placements: [{ at: 'typhoon_crab_boat' }],
  },
  {
    id: 'npc_debtor',
    name: '魚蛋佬',
    role: 'npc',
    appearance: 'debtor',
    idleClip: 'crossArms',
    placements: [{ at: 'substory_debt', offsets: SIDE_STEP, flag: 'substories_unlocked' }],
  },
  {
    id: 'npc_pager_owner',
    name: '阿芝',
    role: 'npc',
    appearance: 'pagerOwner',
    idleClip: 'phone',
    placements: [
      {
        at: 'hennessy_center',
        offsets: [[4, -9.5], [4, 9.5], [-4, -9.5], [4, -6], [0, 0]],
        flag: 'substories_unlocked',
      },
    ],
  },
];

/** The 洪興 brother who only exists in the ending cutscene. */
export const BROTHER: NpcDef = {
  id: 'npc_brother_1',
  name: '洪興兄弟',
  role: 'npc',
  faction: 'hungHing',
  appearance: BROTHER_APPEARANCE,
  placements: [],
};

/** Characters that only exist inside cutscenes (spawned and removed by the scene). */
export const CUTSCENE_ONLY_IDS: readonly string[] = [BROTHER.id];

export function npcDef(id: string): NpcDef | undefined {
  return NPCS.find((n) => n.id === id);
}

/** Where `def` stands at `beat`, or null when absent. */
export function placementFor(def: NpcDef, beat: BeatId, getFlag: (key: string) => FlagValue | undefined): NpcPlacement | null {
  return def.placements.find((p) => beatInRange(beat, p.from, p.until) && (!p.flag || Boolean(getFlag(p.flag)))) ?? null;
}

export function spawnDefOf(def: NpcDef, position: Vector3, yaw: number): CharacterSpawnDef & { id: string } {
  return {
    id: def.id,
    name: def.name,
    role: def.role,
    faction: def.faction ?? 'civilian',
    appearance: def.appearance,
    position,
    yaw,
    idleClip: def.idleClip ?? 'idle',
  };
}
