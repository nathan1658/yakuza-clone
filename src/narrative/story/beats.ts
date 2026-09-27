/**
 * The main story as data: an ordered list of beats. Exactly one beat is
 * current; it waits for its trigger, runs its script, then the next beat
 * becomes current. The marker, quest stage, flags and unlocks all come from
 * this table, so a chapter skip can be derived from it instead of maintained
 * by hand.
 */
import type { EncounterId, LocationId } from '../../core/types';
import type { FlagValue } from '../dialogue/types';
import type { QuestId } from '../scripts/quests';

export const BEAT_IDS = [
  'ch1_meet_chicken',
  'ch1_alley',
  'ch1_aftermath',
  'ch2_go_typhoon',
  'ch2_ambush',
  'ch2_shrimp',
  'ch3_crossing',
  'ch3_boss',
  'ch3_ending',
  'postgame',
] as const;

export type BeatId = (typeof BEAT_IDS)[number];

/** 4 = post-game. */
export type ChapterNo = 1 | 2 | 3 | 4;

export type BeatTrigger =
  | { kind: 'talk'; npc: string }
  | { kind: 'zone'; at: LocationId; radius: number }
  /** Runs right after the previous beat, in the same story run. */
  | { kind: 'auto' }
  /** Never fires (terminal). */
  | { kind: 'none' };

export interface BeatDef {
  id: BeatId;
  chapter: ChapterNo;
  quest?: { id: QuestId; stage: string };
  trigger: BeatTrigger;
  /** The story fight this beat ends with (resumed after a death / reload). */
  encounter?: EncounterId;
  /** Flags set when the beat completes. */
  sets?: Record<string, FlagValue>;
  /** Quests unlocked when the beat completes. */
  unlocks?: QuestId[];
}

export const BEATS: readonly BeatDef[] = [
  {
    id: 'ch1_meet_chicken',
    chapter: 1,
    quest: { id: 'main_ch1', stage: 'find_chicken' },
    trigger: { kind: 'talk', npc: 'npc_chicken' },
  },
  {
    id: 'ch1_alley',
    chapter: 1,
    quest: { id: 'main_ch1', stage: 'alley' },
    trigger: { kind: 'zone', at: 'percy_alley', radius: 9 },
    encounter: 'prologue_alley',
  },
  {
    id: 'ch1_aftermath',
    chapter: 1,
    quest: { id: 'main_ch1', stage: 'aftermath' },
    trigger: { kind: 'auto' },
    sets: { ch1_done: true, substories_unlocked: true, random_on: true },
    unlocks: ['sub_debt', 'sub_pager'],
  },
  {
    id: 'ch2_go_typhoon',
    chapter: 2,
    quest: { id: 'main_ch2', stage: 'find_shrimp' },
    trigger: { kind: 'zone', at: 'typhoon_entry', radius: 7 },
  },
  {
    id: 'ch2_ambush',
    chapter: 2,
    quest: { id: 'main_ch2', stage: 'promenade' },
    trigger: { kind: 'zone', at: 'typhoon_promenade', radius: 8 },
    encounter: 'typhoon_ambush',
  },
  {
    id: 'ch2_shrimp',
    chapter: 2,
    quest: { id: 'main_ch2', stage: 'pier' },
    trigger: { kind: 'talk', npc: 'npc_shrimp' },
    sets: { ch2_done: true },
  },
  {
    id: 'ch3_crossing',
    chapter: 3,
    quest: { id: 'main_ch3', stage: 'to_sogo' },
    trigger: { kind: 'zone', at: 'sogo_crossing', radius: 12 },
    encounter: 'sogo_goons',
  },
  {
    id: 'ch3_boss',
    chapter: 3,
    quest: { id: 'main_ch3', stage: 'plaza' },
    trigger: { kind: 'zone', at: 'sogo_plaza_entry', radius: 6 },
    encounter: 'sogo_boss',
  },
  {
    id: 'ch3_ending',
    chapter: 3,
    quest: { id: 'main_ch3', stage: 'ending' },
    trigger: { kind: 'auto' },
    sets: { game_cleared: true },
  },
  {
    id: 'postgame',
    chapter: 4,
    trigger: { kind: 'none' },
  },
];

export function beatDef(id: BeatId): BeatDef {
  const b = BEATS.find((d) => d.id === id);
  if (!b) throw new Error(`[narrative] unknown beat ${id}`);
  return b;
}

export function beatIndex(id: BeatId): number {
  return BEAT_IDS.indexOf(id);
}

export function nextBeat(id: BeatId): BeatId | null {
  return BEAT_IDS[beatIndex(id) + 1] ?? null;
}

export function isBeatId(v: unknown): v is BeatId {
  return typeof v === 'string' && (BEAT_IDS as readonly string[]).includes(v);
}

/** Is `id` within [from, until)? Missing bounds are open. */
export function beatInRange(id: BeatId, from?: BeatId, until?: BeatId): boolean {
  const i = beatIndex(id);
  return (from === undefined || i >= beatIndex(from)) && (until === undefined || i < beatIndex(until));
}
