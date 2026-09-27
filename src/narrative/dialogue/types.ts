/**
 * Dialogue data model. Scripts are plain data: a graph of nodes, each node a
 * run of lines, ending in choices, a `next` node, or nothing (terminal).
 */
import type { AnimClip, ItemId, SfxId } from '../../core/types';
import type { QuestId } from '../scripts/quests';
import type { SpeakerKey } from '../scripts/speakers';

export type FlagValue = boolean | number | string;

export interface Line {
  speaker: SpeakerKey;
  text: string;
  /** Short English gloss for key lines. */
  gloss?: string;
  /** Gesture the speaker plays (default: the speaker's own default). */
  anim?: AnimClip;
  /** Who the speaker turns to (default: the other side of the conversation). */
  face?: SpeakerKey;
  /** Sound played as the line appears (a pager beep, a slammed table). */
  sfx?: SfxId;
}

export type Condition =
  | { type: 'flag'; key: string; value?: FlagValue }
  | { type: 'notFlag'; key: string }
  | { type: 'money'; atLeast: number }
  | { type: 'item'; id: ItemId; count?: number };

export type Effect =
  | { type: 'setFlag'; key: string; value: FlagValue }
  | { type: 'giveItem'; id: ItemId; count?: number }
  | { type: 'takeItem'; id: ItemId; count?: number }
  | { type: 'giveMoney'; amount: number }
  | { type: 'takeMoney'; amount: number }
  | { type: 'startQuest'; quest: QuestId }
  | { type: 'advanceQuest'; quest: QuestId; stage: string }
  | { type: 'completeQuest'; quest: QuestId };

export interface Choice {
  text: string;
  next: string;
  /** Shown disabled when false. */
  condition?: Condition;
  effects?: Effect[];
}

export interface DialogueNode {
  lines: Line[];
  choices?: Choice[];
  next?: string;
  /** Applied after the node's lines (before a choice's own effects). */
  effects?: Effect[];
  /** Terminal nodes may tag the outcome for the calling script (e.g. 'fight'). */
  end?: string;
}

export interface DialogueGraph {
  id: string;
  entry: string;
  /** Character id of the conversation partner (framing, facing). */
  with?: string;
  nodes: Record<string, DialogueNode>;
}

/** What conditions and effects act on. Implemented by the narrative facade (and fakes in tests). */
export interface DialogueEnv {
  getFlag(key: string): FlagValue | undefined;
  setFlag(key: string, value: FlagValue): void;
  money(): number;
  count(id: ItemId): number;
  giveItem(id: ItemId, count: number): void;
  takeItem(id: ItemId, count: number): void;
  giveMoney(amount: number): void;
  takeMoney(amount: number): void;
  startQuest(quest: QuestId): void;
  advanceQuest(quest: QuestId, stage: string): void;
  completeQuest(quest: QuestId): void;
}
