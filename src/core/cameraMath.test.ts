import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  COLLISION_MARGIN,
  MIN_COLLISION_DISTANCE,
  PITCH_MAX,
  PITCH_MIN,
  allowedDistance,
  applyMousePitch,
  applyMouseYaw,
  dampAngle,
  nextCollisionDistance,
  orbitOffset,
  punchEnvelope,
  shakeNoise,
  yawOfDirection,
} from './cameraMath';

const SENS = 0.0022;

function orbitCamera(yaw: number, pitch: number, pivot = new Vector3(3, 1.5, -2)): PerspectiveCamera {
  const cam = new PerspectiveCamera(55, 16 / 9, 0.1, 900);
  cam.position.copy(pivot).add(orbitOffset(yaw, pitch, 4.4, new Vector3()));
  cam.lookAt(pivot);
  cam.updateMatrixWorld(true);
  return cam;
}

const right = (yaw: number) => new Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
const forward = (yaw: number) => new Vector3(Math.sin(yaw), 0, Math.cos(yaw));

describe('orbit conventions', () => {
  it.each([0, 0.7, -2.1, Math.PI])('yaw %s: camera looks along forward and right is screen-right', (yaw) => {
    const pivot = new Vector3(3, 1.5, -2);
    const cam = orbitCamera(yaw, 0.3, pivot);
    const dir = cam.getWorldDirection(new Vector3()).setY(0).normalize();
    expect(dir.dot(forward(yaw))).toBeCloseTo(1, 6);
    expect(yawOfDirection(dir.x, dir.z)).toBeCloseTo(Math.atan2(Math.sin(yaw), Math.cos(yaw)), 6);

    const ndcRight = pivot.clone().add(right(yaw)).project(cam);
    expect(ndcRight.x).toBeGreaterThan(0.1); // pressing D (move along right) goes screen-right
    const ndcForward = pivot.clone().add(forward(yaw)).project(cam);
    expect(Math.abs(ndcForward.x)).toBeLessThan(1e-6);
  });

  it('positive pitch puts the camera above the pivot', () => {
    expect(orbitOffset(0.4, 0.5, 4, new Vector3()).y).toBeGreaterThan(0);
    expect(orbitOffset(0.4, 0.5, 4, new Vector3()).length()).toBeCloseTo(4, 9);
  });

  it('mouse right turns the view right, mouse down looks down', () => {
    const yaw = 1.2;
    const turned = applyMouseYaw(yaw, 50, SENS);
    expect(forward(turned).dot(right(yaw))).toBeGreaterThan(0);
    expect(applyMousePitch(0.2, 40, SENS)).toBeGreaterThan(0.2);
    expect(applyMousePitch(0.2, 1e6, SENS)).toBe(PITCH_MAX);
    expect(applyMousePitch(0.2, -1e6, SENS)).toBe(PITCH_MIN);
  });
});

describe('collision distance', () => {
  it('keeps a margin in front of hits but never closer than the minimum', () => {
    expect(allowedDistance(null, 4.4)).toBe(4.4);
    expect(allowedDistance(3, 4.4)).toBeCloseTo(3 - COLLISION_MARGIN, 9);
    expect(allowedDistance(0.2, 4.4)).toBe(MIN_COLLISION_DISTANCE);
    expect(allowedDistance(10, 4.4)).toBe(4.4);
  });

  it('pulls in instantly and eases back out slowly', () => {
    expect(nextCollisionDistance(Infinity, 4.4, 1 / 60)).toBe(4.4);
    expect(nextCollisionDistance(4.4, 1.2, 1 / 60)).toBe(1.2);
    let d = 1.2;
    const steps: number[] = [];
    for (let i = 0; i < 60; i++) steps.push((d = nextCollisionDistance(d, 4.4, 1 / 60)));
    expect(steps[0]).toBeGreaterThan(1.2);
    expect(steps[0]).toBeLessThan(1.4); // no pop
    expect(steps[59]).toBeGreaterThan(3.5); // mostly recovered after 1 s
    expect(steps[59]).toBeLessThan(4.4);
  });
});

describe('effects', () => {
  it('punch rises fast, falls smoothly and is zero at both ends', () => {
    expect(punchEnvelope(0)).toBe(0);
    expect(punchEnvelope(1)).toBe(0);
    expect(punchEnvelope(0.15)).toBeCloseTo(1, 6);
    expect(punchEnvelope(0.05)).toBeGreaterThan(0.5);
    expect(punchEnvelope(0.5)).toBeGreaterThan(punchEnvelope(0.8));
  });

  it('shake noise is bounded and smooth', () => {
    let prev = shakeNoise(0, 1);
    for (let t = 0; t < 2; t += 1 / 240) {
      const v = shakeNoise(t, 1);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.25);
      prev = v;
    }
    expect(shakeNoise(0.37, 1)).not.toBeCloseTo(shakeNoise(0.37, 2), 3);
  });

  it('dampAngle takes the short way round', () => {
    const a = dampAngle(3.0, -3.0, 10, 1 / 60);
    expect(a).toBeGreaterThan(3.0); // crosses +π instead of sweeping through 0
  });
});
