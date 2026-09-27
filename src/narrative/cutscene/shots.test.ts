import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Vec3Source } from '../../core/types';
import { behind, closeUp, craneUp, establishing, holdOf, lookDown, lowAngle, overShoulder, track, twoShot, yawDir } from './shots';

const v = (s: Vec3Source | undefined): Vector3 => {
  if (!s) throw new Error('missing');
  return typeof s === 'function' ? s() : s;
};

describe('shots', () => {
  it('over-the-shoulder sits behind A, on the requested side, looking at B', () => {
    const a = new Vector3(0, 0, 0);
    const b = new Vector3(0, 0, 5); // A faces +Z, so right is -X
    const right = overShoulder(a, b, 1, 2);
    const left = overShoulder(a, b, -1, 2);
    expect(v(right.position).z).toBeCloseTo(-1.6);
    expect(v(right.position).x).toBeCloseTo(-0.6);
    expect(v(left.position).x).toBeCloseTo(0.6);
    expect(v(right.lookAt).z).toBeCloseTo(5);
    expect(v(right.lookAt).y).toBeGreaterThan(1);
  });

  it('two-shot looks at the midpoint from the side and pushes in', () => {
    const s = twoShot(new Vector3(-1, 0, 0), new Vector3(1, 0, 0), 3);
    expect(v(s.lookAt).x).toBeCloseTo(0);
    expect(Math.abs(v(s.position).z)).toBeCloseTo(4.5);
    expect(Math.abs(v(s.toPosition).z)).toBeLessThan(4.5);
  });

  it('establishing shot stands behind the centre along yaw', () => {
    const s = establishing(new Vector3(10, 0, 10), 0, 20, 8, 4);
    expect(v(s.position).z).toBeCloseTo(-10);
    expect(v(s.position).y).toBeCloseTo(8);
  });

  it('behind-shot stays behind the player however far the target is', () => {
    const from = new Vector3(0, 0, 0);
    for (const far of [1, 8, 30]) {
      const s = behind(from, new Vector3(0, 0, far), 3, 2);
      expect(v(s.position).z).toBeCloseTo(-4);
      expect(v(s.toPosition).z).toBeCloseTo(-2.5);
      expect(v(s.lookAt).z).toBeCloseTo(far);
    }
  });

  it('look-down sits high over A and aims at the ground by B', () => {
    const s = lookDown(new Vector3(0, 0, 0), new Vector3(0, 0, 2), 1, 2);
    expect(v(s.position).z).toBeLessThan(0);
    expect(v(s.position).y).toBeGreaterThan(v(s.lookAt).y + 1);
  });

  it('low angle looks up at the face from in front', () => {
    const s = lowAngle(new Vector3(0, 0, 0), 0, 2);
    expect(v(s.position).z).toBeGreaterThan(2);
    expect(v(s.position).y).toBeLessThan(v(s.lookAt).y);
  });

  it('crane rises and pulls back behind the centre', () => {
    const s = craneUp(new Vector3(0, 0, 0), 0, 8);
    expect(v(s.toPosition).y).toBeGreaterThan(v(s.position).y);
    expect(v(s.toPosition).z).toBeLessThan(v(s.position).z);
  });

  it('track keeps its eye on a moving target', () => {
    const target = new Vector3(0, 0, 0);
    const s = track(new Vector3(5, 2, 0), () => target, 3);
    target.set(3, 0, 4);
    expect(v(s.lookAt).x).toBeCloseTo(3);
    expect(v(s.lookAt).z).toBeCloseTo(4);
  });

  it('close-up is in front of the face', () => {
    const yaw = Math.PI / 2; // facing +X
    expect(yawDir(yaw).x).toBeCloseTo(1);
    const s = closeUp(new Vector3(0, 0, 0), yaw, 2);
    expect(v(s.position).x).toBeGreaterThan(1);
    expect(v(s.lookAt).y).toBeCloseTo(1.6);
  });

  it('holdOf freezes the end frame for a long time', () => {
    const s = twoShot(new Vector3(-1, 0, 0), new Vector3(1, 0, 0), 3);
    const h = holdOf(s);
    expect(h.position).toBe(s.toPosition);
    expect(h.toPosition).toBeUndefined();
    expect(h.duration).toBeGreaterThan(60);
  });
});
