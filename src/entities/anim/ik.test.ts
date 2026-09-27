import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { ARM, LEG, armIK, legIK, type Euler3 } from './ik';

const q = (e: Euler3) => new Quaternion().setFromEuler(new Euler(e[0], e[1], e[2], 'XYZ'));

/** Forward kinematics of a two-bone chain whose bones point along -Y at rest. */
function fk(upper: Euler3, lower: Euler3, l1: number, l2: number): Vector3 {
  const qu = q(upper);
  const ql = qu.clone().multiply(q(lower));
  return new Vector3(0, -l1, 0).applyQuaternion(qu).add(new Vector3(0, -l2, 0).applyQuaternion(ql));
}

describe('legIK', () => {
  const targets: Euler3[] = [
    [0, -0.8, 0],
    [0.05, -0.7, 0.3],
    [-0.1, -0.6, -0.35],
    [0.02, -0.45, 0.4],
    [0, -0.3, 0.55],
  ];
  it.each(targets)('reaches (%f, %f, %f)', (x, y, z) => {
    const s = legIK(x, y, z);
    const p = fk(s.thigh, s.shin, LEG.upper, LEG.lower);
    expect(p.x).toBeCloseTo(x, 5);
    expect(p.y).toBeCloseTo(y, 5);
    expect(p.z).toBeCloseTo(z, 5);
    expect(s.shin[0]).toBeGreaterThanOrEqual(0);
  });

  it('clamps unreachable targets along their direction', () => {
    const s = legIK(0, -2, 0);
    const p = fk(s.thigh, s.shin, LEG.upper, LEG.lower);
    expect(p.y).toBeCloseTo(-(LEG.upper + LEG.lower), 3);
  });
});

describe('armIK', () => {
  const cases: Array<[Euler3, Euler3]> = [
    [[0.05, 0, 0.5], [0, -1, 0]],
    [[0.25, 0.05, 0.25], [-1, 0, 0]],
    [[-0.1, 0.2, 0.3], [0, -1, 0]],
    [[0.1, -0.35, 0.2], [0, 0, -1]],
  ];
  it.each(cases)('reaches %j with pole %j', (target, pole) => {
    const s = armIK(target, pole);
    const p = fk(s.upper, s.fore, ARM.upper, ARM.lower);
    expect(p.x).toBeCloseTo(target[0], 4);
    expect(p.y).toBeCloseTo(target[1], 4);
    expect(p.z).toBeCloseTo(target[2], 4);
    expect(s.fore[0]).toBeLessThanOrEqual(0);
  });

  it('bends the elbow towards the pole', () => {
    const s = armIK([0, 0, 0.35], [0, -1, 0]);
    const elbow = new Vector3(0, -ARM.upper, 0).applyQuaternion(q(s.upper));
    expect(elbow.y).toBeLessThan(0);
  });
});
