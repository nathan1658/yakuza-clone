/**
 * Pure camera-shot builders for cutscenes. Positions are feet positions
 * (y = 0); heights are added here. Yaw convention: yaw θ faces
 * (sin θ, 0, cos θ); the right-hand side of direction (x, z) is (-z, 0, x).
 */
import { Vector3 } from 'three';
import type { CameraShot, EaseName } from '../../core/types';

const HEAD = 1.6;
const CHEST = 1.35;
/** A shot that never ends on its own; the next shot replaces it. */
const HOLD_SEC = 600;

function flatDir(from: Vector3, to: Vector3): Vector3 {
  const d = new Vector3(to.x - from.x, 0, to.z - from.z);
  return d.lengthSq() < 1e-6 ? new Vector3(0, 0, 1) : d.normalize();
}

function rightOf(dir: Vector3): Vector3 {
  return new Vector3(-dir.z, 0, dir.x);
}

export function yawDir(yaw: number): Vector3 {
  return new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}

/** The camera spot over `a`'s shoulder (side 1 = right, -1 = left) when facing `b`. */
export function shoulderSpot(a: Vector3, b: Vector3, side: 1 | -1): Vector3 {
  const dir = flatDir(a, b);
  return a.clone().addScaledVector(dir, -1.6).addScaledVector(rightOf(dir), 0.6 * side).setY(1.65);
}

/** Over `a`'s shoulder (side 1 = right, -1 = left) looking at `b`'s face. */
export function overShoulder(a: Vector3, b: Vector3, side: 1 | -1, duration: number): CameraShot {
  return { position: shoulderSpot(a, b, side), lookAt: new Vector3(b.x, b.y + HEAD - 0.1, b.z), fov: 45, duration };
}

/** Over standing `a`'s shoulder (side 1 = right), looking down at `b` lying on the ground. */
export function lookDown(a: Vector3, b: Vector3, side: 1 | -1, duration: number): CameraShot {
  const dir = flatDir(a, b);
  const position = a.clone().addScaledVector(dir, -1.1).addScaledVector(rightOf(dir), 0.7 * side);
  position.y = 2.1;
  return { position, lookAt: new Vector3(b.x, 0.35, b.z), fov: 45, duration };
}

/** A camera parked at `position` that keeps its eyes on a moving `target` (feet position). */
export function track(position: Vector3, target: () => Vector3, duration: number, fov = 50): CameraShot {
  const eye = new Vector3();
  return { position, lookAt: () => eye.copy(target()).setY(CHEST), fov, duration };
}

/** Side-on shot of two people, slowly pushing in. */
export function twoShot(a: Vector3, b: Vector3, duration: number, dist = 4.5): CameraShot {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const side = rightOf(flatDir(a, b));
  const at = (d: number) => mid.clone().addScaledVector(side, d).setY(1.6);
  const lookAt = mid.clone().setY(CHEST);
  return { position: at(dist), toPosition: at(dist * 0.8), lookAt, fov: 50, duration, ease: 'inOutQuad' };
}

/**
 * Wide shot of `center` seen from the direction `yaw` points away from
 * (the camera stands `dist` behind the centre along yaw), drifting in.
 */
export function establishing(center: Vector3, yaw: number, dist: number, height: number, duration: number): CameraShot {
  const back = yawDir(yaw).multiplyScalar(-1);
  const position = center.clone().addScaledVector(back, dist).setY(height);
  const toPosition = center.clone().addScaledVector(back, dist * 0.75).setY(height * 0.8);
  const lookAt = center.clone().setY(2);
  return { position, toPosition, lookAt, fov: 55, duration, ease: 'inOutCubic' };
}

/**
 * Wide shot from behind `from` towards `at`: it starts 4 m behind them and
 * drifts in to 2.5 m, so it never ends up in front of them however far `at` is.
 */
export function behind(from: Vector3, at: Vector3, height: number, duration: number): CameraShot {
  const back = flatDir(at, from);
  const position = from.clone().addScaledVector(back, 4).setY(height);
  const toPosition = from.clone().addScaledVector(back, 2.5).setY(height * 0.8);
  return { position, toPosition, lookAt: at.clone().setY(CHEST), fov: 55, duration, ease: 'inOutCubic' };
}

/** Face close-up of a character standing at `pos` facing `yaw`. */
export function closeUp(pos: Vector3, yaw: number, duration: number, dist = 1.4, ease: EaseName = 'outCubic'): CameraShot {
  const f = yawDir(yaw);
  const eye = pos.clone().setY(pos.y + HEAD);
  const position = eye.clone().addScaledVector(f, dist).addScaledVector(rightOf(f), 0.25);
  const toPosition = eye.clone().addScaledVector(f, dist * 0.85).addScaledVector(rightOf(f), 0.2);
  return { position, toPosition, lookAt: eye, fov: 40, duration, ease };
}

/** Low tracking shot looking up at someone (menace). */
export function lowAngle(pos: Vector3, yaw: number, duration: number): CameraShot {
  const f = yawDir(yaw);
  const position = pos.clone().addScaledVector(f, 2.6).addScaledVector(rightOf(f), -0.8).setY(0.45);
  const toPosition = pos.clone().addScaledVector(f, 2.1).addScaledVector(rightOf(f), -0.6).setY(0.5);
  return { position, toPosition, lookAt: pos.clone().setY(HEAD), fov: 50, duration, ease: 'inOutQuad' };
}

/** Rising pull-back from `center`, the camera behind it along `yaw` (for endings). */
export function craneUp(center: Vector3, yaw: number, duration: number): CameraShot {
  const back = yawDir(yaw).multiplyScalar(-1);
  const position = center.clone().addScaledVector(back, 4).setY(1.8);
  const toPosition = center.clone().addScaledVector(back, 10).setY(7.5);
  const lookAt = center.clone().setY(1.2);
  return { position, toPosition, lookAt, fov: 55, duration, ease: 'inOutCubic' };
}

/** The final frame of `shot`, held indefinitely (so a sequence never falls back to the gameplay camera). */
export function holdOf(shot: CameraShot): CameraShot {
  return {
    position: shot.toPosition ?? shot.position,
    lookAt: shot.toLookAt ?? shot.lookAt,
    fov: shot.fov,
    duration: HOLD_SEC,
  };
}

/** A static shot held until replaced. */
export function still(position: Vector3, lookAt: Vector3, fov = 50): CameraShot {
  return { position, lookAt, fov, duration: HOLD_SEC };
}
