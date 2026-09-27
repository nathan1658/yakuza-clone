import { describe, expect, it } from 'vitest';
import { Euler, Quaternion } from 'three';
import type { AnimClipDef } from '../../core/types';
import { Animator } from './Animator';
import { boneIndex } from './skeleton';

const X = boneIndex('spine') * 4;
const angleX = (a: Animator): number => new Euler().setFromQuaternion(new Quaternion().fromArray(a.pose, X)).x;

const still: AnimClipDef = { name: 'still', duration: 1, loop: true, keys: [{ t: 0, pose: {} }] };
const bend: AnimClipDef = {
  name: 'bend',
  duration: 1,
  loop: false,
  keys: [
    { t: 0, pose: { spine: [0, 0, 0], rootOffset: [0, 0, 0] } },
    { t: 1, pose: { spine: [1, 0, 0], rootOffset: [0, -1, 0] } },
  ],
};
const swing: AnimClipDef = {
  name: 'swing',
  duration: 2,
  loop: true,
  keys: [
    { t: 0, pose: { spine: [0, 0, 0] } },
    { t: 0.5, pose: { spine: [1, 0, 0] } },
  ],
};

describe('Animator', () => {
  it('interpolates keys and scales the root offset', () => {
    const a = new Animator(still, 2);
    a.play(bend, { blend: 0 });
    a.update(0.5);
    expect(angleX(a)).toBeCloseTo(0.5, 4);
    expect(a.root[1]).toBeCloseTo(-1, 5);
    expect(a.progress).toBeCloseTo(0.5);
  });

  it('holds the last key and reports finished for one-shots', () => {
    const a = new Animator(still, 1);
    a.play(bend, { blend: 0 });
    a.update(0.7);
    expect(a.finished).toBe(false);
    a.update(0.7);
    expect(a.finished).toBe(true);
    expect(a.progress).toBe(1);
    expect(angleX(a)).toBeCloseTo(1, 4);
  });

  it('wraps looping clips from the last key back to the first', () => {
    const a = new Animator(swing, 1);
    a.update(1.5);
    expect(angleX(a)).toBeCloseTo(0.5, 4);
    a.update(1);
    expect(a.progress).toBeCloseTo(0.25);
    expect(angleX(a)).toBeCloseTo(0.5, 4);
  });

  it('time-scales keys to a duration override', () => {
    const a = new Animator(still, 1);
    a.play(bend, { duration: 4, blend: 0 });
    a.update(1);
    expect(a.progress).toBeCloseTo(0.25);
    expect(angleX(a)).toBeCloseTo(0.25, 4);
  });

  it('cross-fades from the previous pose', () => {
    const a = new Animator(still, 1);
    a.play(bend, { blend: 0 });
    a.update(1);
    a.play(still, { blend: 0.2 });
    a.update(0.1);
    const mid = angleX(a);
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.9);
    a.update(0.2);
    expect(angleX(a)).toBeCloseTo(0, 5);
  });

  it('restarts one-shots by default but not loops', () => {
    const a = new Animator(swing, 1);
    a.update(0.5);
    a.play(swing);
    expect(a.progress).toBeCloseTo(0.25);
    a.play(bend, { blend: 0 });
    a.update(0.5);
    a.play(bend);
    expect(a.progress).toBe(0);
    a.update(0.25);
    a.play(bend, { restart: false });
    expect(a.progress).toBeCloseTo(0.25);
  });

  it('detects crossing a normalised time, including across a loop wrap', () => {
    const a = new Animator(swing, 1);
    a.update(0.9);
    expect(a.crossed(0.4)).toBe(true);
    a.update(0.9);
    expect(a.crossed(0.4)).toBe(false);
    a.update(0.4);
    expect(a.crossed(0)).toBe(true);
  });
});
