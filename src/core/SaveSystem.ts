import type { GameContext, GameModeId, GameSystem, GameTime, ISaveSystem, ISaveable, SaveMeta } from './types';

/** Bump when the save layout changes incompatibly; older saves are then ignored. */
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'hk-dragon.save';

/** Modes in which the play-time clock runs (real time). */
const PLAYTIME_MODES: ReadonlySet<GameModeId> = new Set<GameModeId>([
  'freeRoam', 'combat', 'heatAction', 'dialogue', 'cutscene', 'shop',
]);

interface SaveFile {
  version: number;
  timestamp: number;
  meta: SaveMeta;
  data: Record<string, unknown>;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Single-slot save in localStorage. Never throws: a missing, corrupt or
 * outdated save simply reads as "no save"; storage failures are logged.
 */
export class SaveSystem implements ISaveSystem, GameSystem {
  readonly name = 'save';

  private readonly saveables = new Map<string, ISaveable>();
  private playTime = 0;

  /** `storage` is for tests; the game uses window.localStorage. */
  constructor(
    private readonly ctx: GameContext,
    private readonly storage?: StorageLike,
  ) {}

  get playTimeSec(): number {
    return this.playTime;
  }

  init(): void {
    // Nothing to prepare: saveables register themselves during their own init().
  }

  update(time: GameTime): void {
    if (PLAYTIME_MODES.has(this.ctx.state.mode)) this.playTime += time.realDt;
  }

  register(saveable: ISaveable): void {
    if (this.saveables.has(saveable.saveKey)) {
      console.warn(`[SaveSystem] saveKey "${saveable.saveKey}" registered twice; the later one wins`);
    }
    this.saveables.set(saveable.saveKey, saveable);
  }

  save(meta: Omit<SaveMeta, 'version' | 'timestamp' | 'playTimeSec'>): void {
    const data = this.serializeAll();
    const timestamp = Date.now();
    const full: SaveMeta = {
      version: SAVE_VERSION,
      timestamp,
      chapterZh: meta.chapterZh,
      locationZh: meta.locationZh,
      playTimeSec: this.playTime,
    };
    const ok = data !== null && this.write({ version: SAVE_VERSION, timestamp, meta: full, data });
    if (ok) this.ctx.events.emit('save:done', { meta: full });
    else this.ctx.events.emit('save:failed', {});
  }

  load(): boolean {
    const file = this.readFile();
    if (!file) return false;
    for (const saveable of this.saveables.values()) restore(saveable, file.data);
    this.playTime = file.meta.playTimeSec;
    return true;
  }

  hasSave(): boolean {
    return this.readFile() !== null;
  }

  getMeta(): SaveMeta | null {
    return this.readFile()?.meta ?? null;
  }

  resetAll(): void {
    for (const saveable of this.saveables.values()) safeReset(saveable);
    this.playTime = 0;
  }

  /** Every saveable's data, or null (logged) if any of them fails — never write a partial save. */
  private serializeAll(): Record<string, unknown> | null {
    const data: Record<string, unknown> = {};
    for (const [key, saveable] of this.saveables) {
      try {
        data[key] = saveable.serialize();
      } catch (err) {
        console.error(`[SaveSystem] serialize() of "${key}" threw; save aborted`, err);
        return null;
      }
    }
    return data;
  }

  private write(file: SaveFile): boolean {
    try {
      const store = this.store();
      if (!store) throw new Error('localStorage is unavailable');
      store.setItem(SAVE_KEY, JSON.stringify(file));
      return true;
    } catch (err) {
      console.error('[SaveSystem] could not write the save', err);
      return false;
    }
  }

  private readFile(): SaveFile | null {
    try {
      const raw = this.store()?.getItem(SAVE_KEY) ?? null;
      return raw === null ? null : parseSaveFile(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  /** Injected storage, else window.localStorage when it is a real Storage (reading it may throw). */
  private store(): StorageLike | null {
    if (this.storage) return this.storage;
    const ls: Partial<StorageLike> | undefined = globalThis.localStorage;
    return typeof ls?.getItem === 'function' && typeof ls.setItem === 'function' ? (ls as StorageLike) : null;
  }
}

function restore(saveable: ISaveable, data: Record<string, unknown>): void {
  if (!Object.hasOwn(data, saveable.saveKey)) return safeReset(saveable);
  try {
    saveable.deserialize(data[saveable.saveKey]);
  } catch (err) {
    console.error(`[SaveSystem] deserialize() of "${saveable.saveKey}" threw; resetting it`, err);
    safeReset(saveable);
  }
}

function safeReset(saveable: ISaveable): void {
  try {
    saveable.reset();
  } catch (err) {
    console.error(`[SaveSystem] reset() of "${saveable.saveKey}" threw`, err);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isMeta(v: unknown): v is SaveMeta {
  return (
    isRecord(v) &&
    v.version === SAVE_VERSION &&
    isFiniteNumber(v.timestamp) &&
    isFiniteNumber(v.playTimeSec) &&
    typeof v.chapterZh === 'string' &&
    typeof v.locationZh === 'string'
  );
}

/** The parsed file if it is a well-formed save of the current version, else null. */
function parseSaveFile(v: unknown): SaveFile | null {
  const ok = isRecord(v) && v.version === SAVE_VERSION && isFiniteNumber(v.timestamp) && isMeta(v.meta) && isRecord(v.data);
  return ok ? (v as unknown as SaveFile) : null;
}
