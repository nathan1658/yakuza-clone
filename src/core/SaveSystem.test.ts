import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, SAVE_VERSION, SaveSystem } from './SaveSystem';
import { EventBus } from './EventBus';
import type { GameContext, GameEvents, GameModeId, GameTime, ISaveable, SaveMeta } from './types';

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

class FakeSaveable implements ISaveable {
  value: unknown;
  resets = 0;
  constructor(
    readonly saveKey: string,
    readonly initial: unknown,
  ) {
    this.value = initial;
  }
  serialize(): unknown {
    return this.value;
  }
  deserialize(data: unknown): void {
    this.value = data;
  }
  reset(): void {
    this.value = this.initial;
    this.resets++;
  }
}

const META = { chapterZh: '第一章：銅鑼灣', locationZh: '崇光十字路口' };

function setup(storage = new MemoryStorage()) {
  const events = new EventBus<GameEvents>();
  const state = { mode: 'freeRoam' as GameModeId };
  const ctx = { events, state } as unknown as GameContext;
  const save = new SaveSystem(ctx, storage);
  save.init();
  const player = new FakeSaveable('player', { hp: 100, money: 0 });
  const inventory = new FakeSaveable('inventory', { items: [] });
  const narrative = new FakeSaveable('narrative', { chapter: 1 });
  for (const s of [player, inventory, narrative]) save.register(s);
  const time: GameTime = { dt: 0, realDt: 0, elapsed: 0, realElapsed: 0, frame: 0 };
  const tick = (realDt: number, dt = realDt) => {
    time.realDt = realDt;
    time.dt = dt;
    save.update(time);
  };
  return { save, storage, events, state, player, inventory, narrative, tick };
}

function writeRaw(storage: MemoryStorage, file: unknown): void {
  storage.setItem(SAVE_KEY, typeof file === 'string' ? file : JSON.stringify(file));
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SaveSystem round trip', () => {
  it('has no save on empty storage', () => {
    const s = setup();
    expect(s.save.name).toBe('save');
    expect(s.save.hasSave()).toBe(false);
    expect(s.save.getMeta()).toBeNull();
    expect(s.save.load()).toBe(false);
    expect(s.player.resets).toBe(0);
  });

  it('writes one slot with version, timestamp, meta and every saveable; emits save:done', () => {
    const s = setup();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const done = vi.fn();
    s.events.on('save:done', done);
    s.player.value = { hp: 42, money: 900 };
    s.tick(12.5);
    s.save.save(META);

    const expectedMeta: SaveMeta = { version: SAVE_VERSION, timestamp: 1_700_000_000_000, ...META, playTimeSec: 12.5 };
    expect(done).toHaveBeenCalledWith({ meta: expectedMeta });
    expect([...s.storage.items.keys()]).toEqual([SAVE_KEY]);
    expect(JSON.parse(s.storage.getItem(SAVE_KEY)!)).toEqual({
      version: SAVE_VERSION,
      timestamp: 1_700_000_000_000,
      meta: expectedMeta,
      data: { player: { hp: 42, money: 900 }, inventory: { items: [] }, narrative: { chapter: 1 } },
    });
    expect(s.save.hasSave()).toBe(true);
    expect(s.save.getMeta()).toEqual(expectedMeta);
  });

  it('load deserializes present keys, resets missing ones and restores play time', () => {
    const storage = new MemoryStorage();
    const first = setup(storage);
    first.player.value = { hp: 7, money: 3 };
    first.narrative.value = { chapter: 4 };
    first.tick(99);
    first.save.save(META);
    const file = JSON.parse(storage.getItem(SAVE_KEY)!);
    delete file.data.inventory;
    writeRaw(storage, file);

    const s = setup(storage);
    s.inventory.value = { items: ['stale'] };
    expect(s.save.load()).toBe(true);
    expect(s.player.value).toEqual({ hp: 7, money: 3 });
    expect(s.narrative.value).toEqual({ chapter: 4 });
    expect(s.inventory.value).toEqual({ items: [] });
    expect(s.inventory.resets).toBe(1);
    expect(s.player.resets).toBe(0);
    expect(s.save.playTimeSec).toBe(99);
  });

  it('a null payload is data, not a missing key', () => {
    const s = setup();
    s.inventory.value = null;
    s.save.save(META);
    s.inventory.value = { items: ['x'] };
    expect(s.save.load()).toBe(true);
    expect(s.inventory.value).toBeNull();
    expect(s.inventory.resets).toBe(0);
  });

  it('resetAll resets every saveable and zeroes play time', () => {
    const s = setup();
    s.player.value = { hp: 1, money: 1 };
    s.tick(30);
    s.save.resetAll();
    expect(s.player.value).toEqual({ hp: 100, money: 0 });
    expect([s.player.resets, s.inventory.resets, s.narrative.resets]).toEqual([1, 1, 1]);
    expect(s.save.playTimeSec).toBe(0);
  });
});

describe('SaveSystem play time', () => {
  it('counts real time only in gameplay modes', () => {
    const s = setup();
    const counted: GameModeId[] = ['freeRoam', 'combat', 'heatAction', 'dialogue', 'cutscene', 'shop'];
    const paused: GameModeId[] = ['boot', 'title', 'menu', 'gameOver', 'credits'];
    for (const mode of counted) {
      s.state.mode = mode;
      s.tick(1, 0.1); // real time, not slow-motion time
    }
    for (const mode of paused) {
      s.state.mode = mode;
      s.tick(1);
    }
    expect(s.save.playTimeSec).toBeCloseTo(counted.length, 9);
  });
});

describe('SaveSystem never throws', () => {
  const valid = (over: Record<string, unknown> = {}) => ({
    version: SAVE_VERSION,
    timestamp: 5,
    meta: { version: SAVE_VERSION, timestamp: 5, ...META, playTimeSec: 1 },
    data: {},
    ...over,
  });

  it.each([
    ['not JSON', '{oops'],
    ['JSON null', 'null'],
    ['an array', '[]'],
    ['an older version', valid({ version: SAVE_VERSION - 1 })],
    ['a newer meta version', valid({ meta: { ...valid().meta, version: SAVE_VERSION + 1 } })],
    ['data that is not an object', valid({ data: [1, 2] })],
    ['meta without a chapter', valid({ meta: { ...valid().meta, chapterZh: undefined } })],
    ['a non-numeric play time', valid({ meta: { ...valid().meta, playTimeSec: 'long' } })],
  ])('treats %s as no save', (_label, file) => {
    const s = setup();
    writeRaw(s.storage, file);
    expect(s.save.hasSave()).toBe(false);
    expect(s.save.getMeta()).toBeNull();
    expect(s.save.load()).toBe(false);
    expect(s.player.resets).toBe(0);
  });

  it('accepts a minimal valid file', () => {
    const s = setup();
    writeRaw(s.storage, valid());
    expect(s.save.hasSave()).toBe(true);
    expect(s.save.load()).toBe(true);
    expect(s.player.resets).toBe(1); // no data for it
  });

  it('logs a failed write (quota) without throwing; announces save:failed, not save:done', () => {
    const s = setup();
    const done = vi.fn();
    const failed = vi.fn();
    s.events.on('save:done', done);
    s.events.on('save:failed', failed);
    vi.spyOn(s.storage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => s.save.save(META)).not.toThrow();
    expect(done).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('reads as no save when storage itself throws', () => {
    const s = setup();
    vi.spyOn(s.storage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(s.save.hasSave()).toBe(false);
    expect(s.save.load()).toBe(false);
  });

  it('a throwing serialize aborts the whole save (no partial slot)', () => {
    const s = setup();
    s.save.save(META);
    const before = s.storage.getItem(SAVE_KEY);
    vi.spyOn(s.inventory, 'serialize').mockImplementation(() => {
      throw new Error('boom');
    });
    const failed = vi.fn();
    s.events.on('save:failed', failed);
    expect(() => s.save.save({ chapterZh: '第二章', locationZh: '旺角' })).not.toThrow();
    expect(s.storage.getItem(SAVE_KEY)).toBe(before);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('a throwing deserialize resets only that saveable', () => {
    const s = setup();
    s.player.value = { hp: 5, money: 5 };
    s.narrative.value = { chapter: 3 };
    s.save.save(META);
    vi.spyOn(s.narrative, 'deserialize').mockImplementation(() => {
      throw new Error('bad shape');
    });
    s.narrative.value = { chapter: 9 };
    expect(s.save.load()).toBe(true);
    expect(s.player.value).toEqual({ hp: 5, money: 5 });
    expect(s.narrative.value).toEqual({ chapter: 1 });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('works (as "no save") when there is no usable localStorage', () => {
    const events = new EventBus<GameEvents>();
    const ctx = { events, state: { mode: 'freeRoam' } } as unknown as GameContext;
    const save = new SaveSystem(ctx); // node: globalThis.localStorage is absent or not a Storage
    expect(save.hasSave()).toBe(false);
    expect(() => save.save(META)).not.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('warns when a saveKey is registered twice and keeps the later saveable', () => {
    const s = setup();
    const replacement = new FakeSaveable('player', { hp: 1 });
    s.save.register(replacement);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    s.save.save(META);
    expect(JSON.parse(s.storage.getItem(SAVE_KEY)!).data.player).toEqual({ hp: 1 });
  });
});
