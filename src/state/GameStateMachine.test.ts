import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/types';
import { GameStateMachine, TRANSITIONS } from './GameStateMachine';

describe('GameStateMachine', () => {
  const make = () => {
    const bus = new EventBus<GameEvents>();
    return { bus, fsm: new GameStateMachine(bus) };
  };

  it('starts in boot and follows legal transitions', () => {
    const { fsm } = make();
    expect(fsm.mode).toBe('boot');
    expect(fsm.transition('title')).toBe(true);
    expect(fsm.transition('freeRoam')).toBe(true);
    expect(fsm.transition('combat', { encounterId: 'x' })).toBe(true);
    expect(fsm.payload).toEqual({ encounterId: 'x' });
    expect(fsm.previous).toBe('freeRoam');
  });

  it('rejects illegal transitions without changing state', () => {
    const { fsm } = make();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(fsm.transition('combat', { encounterId: 'x' })).toBe(false);
    expect(fsm.mode).toBe('boot');
    warn.mockRestore();
  });

  it('back() returns from menu to the mode that opened it', () => {
    const { fsm } = make();
    fsm.transition('title');
    fsm.transition('freeRoam');
    fsm.transition('combat', { encounterId: 'x' });
    fsm.transition('menu', {});
    expect(fsm.back()).toBe(true);
    expect(fsm.mode).toBe('combat');
  });

  it('emits state:changed with from/to/payload', () => {
    const { bus, fsm } = make();
    const seen: string[] = [];
    bus.on('state:changed', (e) => seen.push(`${e.from}>${e.to}`));
    fsm.transition('title');
    fsm.transition('cutscene', { cutsceneId: 'intro' });
    expect(seen).toEqual(['boot>title', 'title>cutscene']);
  });

  it('every mode is reachable from boot', () => {
    const seen = new Set<string>(['boot']);
    const queue = ['boot'] as (keyof typeof TRANSITIONS)[];
    while (queue.length) {
      for (const n of TRANSITIONS[queue.shift()!]) {
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(TRANSITIONS).sort());
  });
});

describe('EventBus', () => {
  it('delivers, unsubscribes, and survives throwing listeners', () => {
    const bus = new EventBus<{ a: number }>();
    const got: number[] = [];
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('a', () => { throw new Error('boom'); });
    const off = bus.on('a', (n) => got.push(n));
    bus.emit('a', 1);
    off();
    bus.emit('a', 2);
    expect(got).toEqual([1]);
    err.mockRestore();
  });

  it('once and wait fire a single time', async () => {
    const bus = new EventBus<{ a: number }>();
    let count = 0;
    bus.once('a', () => count++);
    const p = bus.wait('a', (n) => n > 1);
    bus.emit('a', 1);
    bus.emit('a', 2);
    bus.emit('a', 3);
    expect(count).toBe(1);
    await expect(p).resolves.toBe(2);
  });
});
