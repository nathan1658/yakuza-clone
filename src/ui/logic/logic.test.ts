import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import type { HitEvent, InputAction } from '../../core/types';
import { Clock } from './Clock';
import { damageStyle } from './damageStyle';
import { formatMoney, formatMoneyDelta, formatPlayTime } from './format';
import { LoadingProgress } from './loadingProgress';
import { clampIndex, firstEnabled, stepIndex } from './menuNav';
import { judgeQte, QteRun } from './qte';
import { newRadarPoint, radarHeading, radarMatrix, toRadar } from './radar';
import { SlotPool } from './SlotPool';
import { blipBetween, Typewriter } from './typewriter';

describe('formatMoney', () => {
  it('groups thousands with the HK$ prefix', () => {
    expect(formatMoney(1234)).toBe('HK$1,234');
    expect(formatMoney(0)).toBe('HK$0');
    expect(formatMoney(999)).toBe('HK$999');
    expect(formatMoney(1234567)).toBe('HK$1,234,567');
  });
  it('rounds and signs', () => {
    expect(formatMoney(999.6)).toBe('HK$1,000');
    expect(formatMoney(-20)).toBe('-HK$20');
    expect(formatMoneyDelta(120)).toBe('+HK$120');
    expect(formatMoneyDelta(-1500)).toBe('-HK$1,500');
  });
  it('formats play time', () => {
    expect(formatPlayTime(3725)).toBe('1:02:05');
    expect(formatPlayTime(-3)).toBe('0:00:00');
  });
});

describe('radar transform', () => {
  const p = newRadarPoint();
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

  it('puts camera-forward at the top and camera-right on the right (yaw 0)', () => {
    toRadar(0, 10, 0, 1, 100, p); // forward = +Z
    near(p.x, 0); near(p.y, -10);
    toRadar(-10, 0, 0, 1, 100, p); // right = (-1, 0)
    near(p.x, 10); near(p.y, 0);
  });

  it('rotates with the camera yaw', () => {
    toRadar(10, 0, Math.PI / 2, 2, 100, p); // yaw 90°: forward = +X
    near(p.x, 0); near(p.y, -20);
    toRadar(0, -10, Math.PI / 2, 1, 100, p); // north (-Z) is to the left
    near(p.x, -10); near(p.y, 0);
    near(p.angle, -Math.PI / 2);
  });

  it('clamps off-radar points onto the rim, keeping direction', () => {
    toRadar(0, 300, 0, 1, 80, p);
    expect(p.clamped).toBe(true);
    near(Math.hypot(p.x, p.y), 80);
    near(p.x, 0); near(p.y, -80);
    toRadar(0, 30, 0, 1, 80, p);
    expect(p.clamped).toBe(false);
  });

  it('canvas matrix agrees with the point transform', () => {
    const yaw = 0.7;
    const [a, b, c, d] = radarMatrix(yaw, 3);
    toRadar(4, -9, yaw, 3, 1e9, p);
    near(a * 4 + c * -9, p.x);
    near(b * 4 + d * -9, p.y);
  });

  it('player heading is relative to the camera', () => {
    near(radarHeading(0.5, 0.5), 0); // facing where the camera looks = up
    const h = radarHeading(0, Math.PI / 2); // facing +Z while camera looks +X
    toRadar(0, 1, Math.PI / 2, 1, 100, p);
    near(h, p.angle);
  });
});

describe('Typewriter', () => {
  it('reveals code points over time, first char immediately', () => {
    const tw = new Typewriter('ABCD', 10);
    tw.advance(0);
    expect(tw.visibleText()).toBe('A');
    tw.advance(0.1);
    expect(tw.visibleText()).toBe('AB');
    tw.advance(0.25);
    expect(tw.visibleText()).toBe('ABCD');
    expect(tw.done).toBe(true);
    expect(tw.hiddenText()).toBe('');
  });

  it('is surrogate-pair safe', () => {
    const tw = new Typewriter('𠮷野家', 10);
    expect(tw.chars).toHaveLength(3);
    tw.advance(0);
    expect(tw.visibleText()).toBe('𠮷');
    expect(tw.hiddenText()).toBe('野家');
  });

  it('holds after punctuation', () => {
    const plain = new Typewriter('ab', 10);
    const comma = new Typewriter('，b', 10);
    plain.advance(0.15);
    comma.advance(0.15);
    expect(plain.shown).toBe(2);
    expect(comma.shown).toBe(1);
  });

  it('finish() shows everything', () => {
    const tw = new Typewriter('你玩完喇');
    tw.finish();
    expect(tw.visibleText()).toBe('你玩完喇');
    expect(tw.advance(1)).toBe(false);
  });

  it('blips every few voiced characters, never on punctuation', () => {
    const chars = Array.from('喂，你好嘢呀');
    expect(blipBetween(chars, 0, 1)).toBe(true);
    expect(blipBetween(chars, 1, 3)).toBe(false);
    expect(blipBetween(chars, 3, 4)).toBe(true);
    expect(blipBetween(Array.from('……'), 0, 2)).toBe(false);
  });
});

describe('QTE judging', () => {
  const pressing = (...keys: InputAction[]) => (a: InputAction) => keys.includes(a);

  it('hits on the expected key, misses on a wrong one or timeout', () => {
    expect(judgeQte('lightAttack', pressing('lightAttack'), 0.1, 1)).toBe('hit');
    expect(judgeQte('lightAttack', pressing('guard'), 0.1, 1)).toBe('miss');
    expect(judgeQte('lightAttack', pressing(), 1, 1)).toBe('miss');
    expect(judgeQte('lightAttack', pressing(), 0.5, 1)).toBe('pending');
  });

  it('ignores non-answer keys (camera, movement)', () => {
    expect(judgeQte('dodge', pressing('moveForward', 'lockOn'), 0.2, 1)).toBe('pending');
  });

  it('a press on the last frame still counts', () => {
    expect(judgeQte('grab', pressing('grab'), 1.5, 1)).toBe('hit');
  });

  it('runs a sequence with a fresh window per key', () => {
    const run = new QteRun(['lightAttack', 'heavyAttack'], 1);
    expect(run.step(0.9, pressing())).toBe('pending');
    expect(run.progress).toBeCloseTo(0.9);
    expect(run.step(0.05, pressing('lightAttack'))).toBe('advance');
    expect(run.progress).toBe(0);
    expect(run.step(0.9, pressing())).toBe('pending');
    expect(run.step(0.05, pressing('heavyAttack'))).toBe('success');
  });

  it('fails the sequence on timeout', () => {
    const run = new QteRun(['guard'], 0.5);
    expect(run.step(0.3, pressing())).toBe('pending');
    expect(run.step(0.3, pressing())).toBe('fail');
  });
});

describe('menu navigation reducer', () => {
  it('wraps both ways', () => {
    const all = [true, true, true];
    expect(stepIndex(2, 1, all)).toBe(0);
    expect(stepIndex(0, -1, all)).toBe(2);
  });
  it('skips disabled rows', () => {
    const e = [true, false, true, false];
    expect(stepIndex(0, 1, e)).toBe(2);
    expect(stepIndex(2, 1, e)).toBe(0);
    expect(stepIndex(0, -1, e)).toBe(2);
  });
  it('stays put when nothing is selectable', () => {
    expect(stepIndex(1, 1, [false, false])).toBe(1);
    expect(firstEnabled([false, false])).toBe(-1);
  });
  it('finds the first enabled row from a start point', () => {
    expect(firstEnabled([false, true, true])).toBe(1);
    expect(firstEnabled([true, false, false], 1)).toBe(0);
  });
  it('clamps a cursor after the list shrinks', () => {
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(4, 0)).toBe(0);
  });
});

describe('SlotPool (damage numbers)', () => {
  it('hands out free slots, then recycles the oldest', () => {
    const pool = new SlotPool(['a', 'b']);
    const first = pool.acquire();
    const second = pool.acquire();
    expect(first.recycled || second.recycled).toBe(false);
    expect(pool.activeCount).toBe(2);
    expect(pool.freeCount).toBe(0);
    const third = pool.acquire();
    expect(third.recycled).toBe(true);
    expect(third.item).toBe(first.item);
    expect(pool.activeItems).toEqual([second.item, first.item]);
    expect(pool.activeCount).toBe(2);
  });

  it('release returns a slot once; unknown releases are ignored', () => {
    const pool = new SlotPool([1, 2, 3]);
    const { item } = pool.acquire();
    pool.release(item);
    pool.release(item);
    pool.release(42);
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(3);
  });

  it('releaseAll frees everything', () => {
    const pool = new SlotPool([1, 2, 3]);
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(3);
  });
});

describe('Clock', () => {
  it('fires timers in order once due, and can cancel', () => {
    const clock = new Clock();
    const log: string[] = [];
    clock.schedule(0.2, () => log.push('b'));
    clock.schedule(0.1, () => log.push('a'));
    const cancel = clock.schedule(0.15, () => log.push('x'));
    cancel();
    clock.tick(0.05);
    expect(log).toEqual([]);
    clock.tick(0.2);
    expect(log).toEqual(['a', 'b']);
  });

  it('wait() resolves after real time passes', async () => {
    const clock = new Clock();
    const done = vi.fn();
    void clock.wait(0.5).then(done);
    clock.tick(0.4);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    clock.tick(0.2);
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
  });

  it('timers scheduled from a timer run on a later tick', () => {
    const clock = new Clock();
    const log: number[] = [];
    clock.schedule(0, () => clock.schedule(0, () => log.push(2)));
    clock.tick(0.01);
    expect(log).toEqual([]);
    clock.tick(0.01);
    expect(log).toEqual([2]);
  });
});

describe('LoadingProgress', () => {
  it('folds world build progress into the world slice, never going backwards', () => {
    const lp = new LoadingProgress();
    expect(lp.map(0, 'save')[0]).toBe(0);
    expect(lp.map(0.3, 'ui')).toEqual([0.3, '貼好街招']);
    expect(lp.map(0.4, 'world')[0]).toBeCloseTo(0.4);
    const [mid, label] = lp.map(0.5, '起樓');
    expect(mid).toBeCloseTo(0.45);
    expect(label).toBe('起樓');
    expect(lp.map(0.2, '招牌')[0]).toBeCloseTo(0.45);
    expect(lp.map(0.5, 'entities')[0]).toBeCloseTo(0.5);
  });
});

describe('damageStyle', () => {
  const hit = (over: Partial<HitEvent>): HitEvent => ({
    attackerId: 'player', targetId: 'enemy_1', damage: 12, position: new Vector3(),
    kind: 'light', blocked: false, knockdown: false, ...over,
  });

  it('classifies dealt, heavy, taken and blocked hits', () => {
    expect(damageStyle(hit({}), 'player')).toEqual({ text: '12', tone: 'dealt', crit: false });
    expect(damageStyle(hit({ kind: 'weapon' }), 'player')?.tone).toBe('heavy');
    expect(damageStyle(hit({ targetId: 'player', attackerId: 'enemy_1' }), 'player'))
      .toEqual({ text: '-12', tone: 'taken', crit: false });
    expect(damageStyle(hit({ blocked: true }), 'player')?.text).toBe('擋');
  });

  it('crits on heat/throw/knockdown and hides zero damage', () => {
    expect(damageStyle(hit({ kind: 'heat', damage: 80 }), 'player')?.crit).toBe(true);
    expect(damageStyle(hit({ knockdown: true }), 'player')?.crit).toBe(true);
    expect(damageStyle(hit({ damage: 0.2 }), 'player')).toBeNull();
  });
});
