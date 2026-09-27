/**
 * Pure quest bookkeeping: status + current stage per quest. Emits a change
 * record on every visible change; the facade turns those into bus events,
 * toasts and sounds. reset()/deserialize() are silent (the HUD pulls).
 */
import type { QuestKind, QuestView } from '../core/types';
import { QUESTS, questDef, type QuestId } from './scripts/quests';

export type QuestStatus = QuestView['status'];

export interface QuestState {
  status: QuestStatus;
  stage: string;
}

export type QuestLogData = Record<QuestId, QuestState>;

export type QuestChange =
  | { type: 'updated'; id: QuestId; kind: QuestKind; from: QuestStatus; status: QuestStatus; objectiveZh: string }
  | { type: 'completed'; id: QuestId; kind: QuestKind };

const STATUSES: readonly QuestStatus[] = ['locked', 'available', 'active', 'completed'];

export class QuestLog {
  private data: QuestLogData = defaults();

  constructor(private readonly onChange: (change: QuestChange) => void = () => {}) {}

  reset(): void {
    this.data = defaults();
  }

  status(id: QuestId): QuestStatus {
    return this.data[id].status;
  }

  stage(id: QuestId): string {
    return this.data[id].stage;
  }

  isActive(id: QuestId, stage?: string): boolean {
    const q = this.data[id];
    return q.status === 'active' && (stage === undefined || q.stage === stage);
  }

  /** locked → available. */
  unlock(id: QuestId): void {
    if (this.data[id].status === 'locked') this.set(id, 'available', this.data[id].stage);
  }

  /** Make the quest active (at `stage`, default: its current stage). Completed quests stay completed. */
  start(id: QuestId, stage?: string): void {
    if (this.data[id].status === 'completed') return;
    this.set(id, 'active', stage ?? this.data[id].stage);
  }

  /** Move an active (or not yet started) quest to `stage`. */
  advance(id: QuestId, stage: string): void {
    this.start(id, stage);
  }

  complete(id: QuestId): void {
    if (this.data[id].status === 'completed') return;
    this.set(id, 'completed', this.data[id].stage);
    this.onChange({ type: 'completed', id, kind: questDef(id).kind });
  }

  objective(id: QuestId): string {
    const q = this.data[id];
    if (q.status === 'completed') return '已完成';
    const def = questDef(id);
    return (def.stages.find((s) => s.id === q.stage) ?? def.stages[0]).objectiveZh;
  }

  views(): QuestView[] {
    return QUESTS.map((d) => ({
      id: d.id,
      kind: d.kind,
      titleZh: d.titleZh,
      titleEn: d.titleEn,
      status: this.data[d.id].status,
      objectiveZh: this.objective(d.id),
      descriptionZh: d.descriptionZh,
    }));
  }

  /** Active main quest first, then an active substory; null when nothing is active. */
  tracked(): { titleZh: string; objectiveZh: string } | null {
    const pick = (kind: QuestKind) => QUESTS.find((d) => d.kind === kind && this.data[d.id].status === 'active');
    const def = pick('main') ?? pick('substory');
    return def ? { titleZh: def.titleZh, objectiveZh: this.objective(def.id) } : null;
  }

  serialize(): QuestLogData {
    return structuredClone(this.data);
  }

  /** Invalid or missing entries fall back to their defaults. */
  deserialize(raw: unknown): void {
    const next = defaults();
    const src = isRecord(raw) ? raw : {};
    for (const def of QUESTS) {
      const entry = src[def.id];
      if (isQuestState(entry, def.id)) next[def.id] = { status: entry.status, stage: entry.stage };
    }
    this.data = next;
  }

  private set(id: QuestId, status: QuestStatus, stage: string): void {
    const q = this.data[id];
    if (!hasStage(id, stage)) {
      console.warn(`[narrative] quest ${id} has no stage "${stage}"`);
      return;
    }
    if (q.status === status && q.stage === stage) return;
    const from = q.status;
    this.data[id] = { status, stage };
    this.onChange({ type: 'updated', id, kind: questDef(id).kind, from, status, objectiveZh: this.objective(id) });
  }
}

function defaults(): QuestLogData {
  const out = {} as QuestLogData;
  for (const def of QUESTS) {
    out[def.id] = { status: def.id === 'main_ch1' ? 'active' : 'locked', stage: def.stages[0].id };
  }
  return out;
}

function hasStage(id: QuestId, stage: string): boolean {
  return questDef(id).stages.some((s) => s.id === stage);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isQuestState(v: unknown, id: QuestId): v is QuestState {
  if (!isRecord(v)) return false;
  const { status, stage } = v;
  return STATUSES.includes(status as QuestStatus) && typeof stage === 'string' && hasStage(id, stage);
}
