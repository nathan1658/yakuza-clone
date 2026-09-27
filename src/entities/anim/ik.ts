/**
 * Two-bone IK used at module load to author poses (never per frame).
 * Legs use an exact closed form for the rig's Euler 'XYZ' convention; arms are
 * solved geometrically with a pole and converted back to Euler angles.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { clamp } from '../../core/math';
import { REF_HEIGHT, SEG } from '../rig/skeleton';

export type Euler3 = [number, number, number];

export const LEG = { upper: SEG.thigh * REF_HEIGHT, lower: SEG.shin * REF_HEIGHT };
export const ARM = { upper: SEG.upperArm * REF_HEIGHT, lower: SEG.forearm * REF_HEIGHT };

const EPS = 1e-4;

export interface LegSolution {
  thigh: Euler3;
  shin: Euler3;
  /** Pitch of the shin relative to the hips; foot X = -pitch keeps the sole parallel to the hips. */
  pitch: number;
}

/**
 * Target = ankle position relative to the hip joint, in the hips frame.
 * Thigh = Rx(θ)·Rz(ζ), shin = Rx(φ). Unreachable targets are clamped along
 * their direction.
 */
export function legIK(tx: number, ty: number, tz: number, l1 = LEG.upper, l2 = LEG.lower): LegSolution {
  const len = Math.hypot(tx, ty, tz) || EPS;
  const d = clamp(len, Math.abs(l1 - l2) + EPS, l1 + l2 - EPS);
  const k = d / len;
  const x = tx * k, y = ty * k, z = tz * k;
  const phi = Math.acos(clamp((d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2), -1, 1));
  const a = l1 + l2 * Math.cos(phi);
  const b = -l2 * Math.sin(phi);
  const zeta = Math.asin(clamp(x / a, -1, 1));
  const c = a * Math.cos(zeta);
  const theta = Math.atan2(z, y) - Math.atan2(b, -c);
  return { thigh: [wrap(theta), 0, zeta], shin: [phi, 0, 0], pitch: wrap(theta) + phi };
}

export interface ArmSolution {
  upper: Euler3;
  fore: Euler3;
}

const _t = new Vector3();
const _p = new Vector3();
const _e = new Vector3();
const _u = new Vector3();
const _f = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _eu = new Euler();

/**
 * Target = wrist position relative to the shoulder joint, in the chest frame.
 * `pole` is the direction the elbow should point (e.g. down, or outward for a hook).
 */
export function armIK(target: Readonly<Euler3>, pole: Readonly<Euler3>, l1 = ARM.upper, l2 = ARM.lower): ArmSolution {
  _t.fromArray(target);
  const len = _t.length() || EPS;
  const d = clamp(len, Math.abs(l1 - l2) + EPS, l1 + l2 - EPS);
  _t.multiplyScalar(1 / len);
  _p.fromArray(pole);
  _p.addScaledVector(_t, -_p.dot(_t));
  if (_p.lengthSq() < EPS) _p.set(0, 0, 1).addScaledVector(_t, -_t.z);
  _p.normalize();

  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _e.copy(_t).multiplyScalar(along).addScaledVector(_p, h);
  _u.copy(_e).normalize();
  _f.copy(_t).multiplyScalar(d).sub(_e).normalize();

  // Local +Z of the upper arm is the flex direction (towards the forearm).
  _z.copy(_f).addScaledVector(_u, -_f.dot(_u));
  if (_z.lengthSq() < EPS) _z.copy(_p).negate().addScaledVector(_u, _p.dot(_u));
  _z.normalize();
  _y.copy(_u).negate();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  _eu.setFromQuaternion(_q.setFromRotationMatrix(_m), 'XYZ');
  const flex = Math.acos(clamp(_u.dot(_f), -1, 1));
  return { upper: [_eu.x, _eu.y, _eu.z], fore: [-flex, 0, 0] };
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
