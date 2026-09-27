/**
 * Everything the narrative persists (save key 'narrative'): the current beat,
 * a story fight that was in progress when the autosave was written, flags and
 * the quest log. deserialize() validates field by field and falls back to
 * new-game values, so a stale or hand-edited save can never wedge the story.
 */
import type { EncounterId, ISaveable } from '../core/types';
import type { FlagValue } from './dialogue/types';
import { QuestLog, type QuestChange, type QuestLogData } from './QuestLog';
import { BEAT_IDS, isBeatId, type BeatId } from './story/beats';

export interface StoryData {
  v: 1;
  beat: BeatId;
  pendingFight: EncounterId | null;
  flags: Record<string, FlagValue>;
  quests: QuestLogData;
}

/** Encounters the story can be waiting on when a save is written. */
const RESUMABLE: readonly EncounterId[] = ['prologue_alley', 'typhoon_ambush', 'sogo_goons', 'sogo_boss', 'substory_debt'];

export class StoryState implements ISaveable {
  readonly saveKey = 'narrative';
  beat: BeatId = BEAT_IDS[0];
  pendingFight: EncounterId | null = null;
  readonly quests: QuestLog;
  private flags: Record<string, FlagValue> = {};

  constructor(onQuestChange?: (change: QuestChange) => void) {
    this.quests = new QuestLog(onQuestChange);
  }

  getFlag(key: string): FlagValue | undefined {
    return this.flags[key];
  }

  setFlag(key: string, value: FlagValue): void {
    this.flags[key] = value;
  }

  serialize(): StoryData {
    return {
      v: 1,
      beat: this.beat,
      pendingFight: this.pendingFight,
      flags: { ...this.flags },
      quests: this.quests.serialize(),
    };
  }

  deserialize(data: unknown): void {
    this.reset();
    if (!isRecord(data) || data.v !== 1) return;
    if (isBeatId(data.beat)) this.beat = data.beat;
    if (RESUMABLE.includes(data.pendingFight as EncounterId)) this.pendingFight = data.pendingFight as EncounterId;
    this.flags = validFlags(data.flags);
    this.quests.deserialize(data.quests);
  }

  reset(): void {
    this.beat = BEAT_IDS[0];
    this.pendingFight = null;
    this.flags = {};
    this.quests.reset();
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validFlags(raw: unknown): Record<string, FlagValue> {
  const out: Record<string, FlagValue> = {};
  if (!isRecord(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
  }
  return out;
}
