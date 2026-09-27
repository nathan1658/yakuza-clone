import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { approach, cameraRelative, locomotionClip, locomotionRate, separation, steerAround } from './motion';

describe('locomotionClip', () => {
  it('normal stance picks idle clip / walk / run / sprint by speed', () => {
    expect(locomotionClip('normal', 'smoke', 0.1, 0, 0)).toBe('smoke');
    expect(locomotionClip('normal', 'idle', 1.5, 0, 0)).toBe('walk');
    expect(locomotionClip('normal', 'idle', 0, 4.5, 0)).toBe('run');
    expect(locomotionClip('normal', 'idle', 0, -7.5, 0)).toBe('sprint');
  });

  it('combat stance strafes relative to facing', () => {
    expect(locomotionClip('combat', 'idle', 0, 0, 0)).toBe('combatIdle');
    // facing +Z: left is +X
    expect(locomotionClip('combat', 'idle', 0, 3, 0)).toBe('combatWalkF');
    expect(locomotionClip('combat', 'idle', 0, -3, 0)).toBe('combatWalkB');
    expect(locomotionClip('combat', 'idle', 3, 0, 0)).toBe('combatWalkL');
    expect(locomotionClip('combat', 'idle', -3, 0, 0)).toBe('combatWalkR');
    // facing +X (yaw π/2): moving +X is forward, +Z is to the right
    expect(locomotionClip('combat', 'idle', 3, 0, Math.PI / 2)).toBe('combatWalkF');
    expect(locomotionClip('combat', 'idle', 0, 3, Math.PI / 2)).toBe('combatWalkR');
  });

  it('rate follows speed within limits and is 1 for non-gait clips', () => {
    expect(locomotionRate('walk', 1.5)).toBeCloseTo(1);
    expect(locomotionRate('run', 100)).toBe(1.6);
    expect(locomotionRate('run', 0.1)).toBe(0.6);
    expect(locomotionRate('idle', 3)).toBe(1);
  });
});

describe('cameraRelative', () => {
  const v = new Vector3();
  it('maps forward/right onto the camera axes', () => {
    cameraRelative(0, 1, 0, v);
    expect([v.x, v.z]).toEqual([0, 1]);
    cameraRelative(1, 0, 0, v);
    expect(v.x).toBeCloseTo(-1);
    expect(v.z).toBeCloseTo(0);
    cameraRelative(0, 1, Math.PI / 2, v);
    expect(v.x).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
  });

  it('clamps diagonal input to unit length', () => {
    cameraRelative(1, 1, 0.3, v);
    expect(v.length()).toBeCloseTo(1);
    expect(v.y).toBe(0);
  });
});

describe('approach', () => {
  it('steps toward the target and snaps when close', () => {
    const cur = new Vector3();
    approach(cur, new Vector3(10, 0, 0), 2);
    expect(cur.x).toBeCloseTo(2);
    approach(cur, new Vector3(2.5, 0, 0), 2);
    expect(cur.x).toBe(2.5);
  });
});

describe('separation', () => {
  const out = new Vector3();
  it('ignores discs that do not overlap', () => {
    expect(separation(0, 0, 1, 0, 0.7, 1, out)).toBe(false);
  });

  it('pushes A away from B by the resolved overlap', () => {
    expect(separation(0, 0, 0.5, 0, 0.7, 1, out)).toBe(true);
    expect(out.x).toBeCloseTo(-0.2);
    separation(0, 0.3, 0, 0, 0.7, 0.5, out);
    expect(out.z).toBeCloseTo(0.2);
    expect(out.x).toBeCloseTo(0);
  });

  it('separates coincident centres', () => {
    expect(separation(2, 2, 2, 2, 0.7, 1, out)).toBe(true);
    expect(out.x).toBeCloseTo(0.7);
  });
});

describe('steerAround', () => {
  it('leaves walkers outside the radius alone', () => {
    const v = steerAround(new Vector3(-1, 0, 0), 2, 0, 1.6, 2.5);
    expect(v.x).toBe(-1);
    expect(v.z).toBe(0);
  });

  it('passes a head-on obstacle on the right', () => {
    // Heading −X, the walker's right is −Z.
    const v = steerAround(new Vector3(-1, 0, 0), 1, 0, 1.6, 2.5);
    expect(v.z).toBeLessThan(0);
    expect(v.x).toBeGreaterThan(-1);
  });

  it('keeps to the side the walker is already on', () => {
    const v = steerAround(new Vector3(-1, 0, 0), 1, 0.2, 1.6, 2.5);
    expect(v.z).toBeGreaterThan(0);
  });
});
