/**
 * Procedural gait: generates looping locomotion clips from a few physical
 * parameters. Each foot sweeps backwards under the hips during stance at the
 * reference ground speed (no sliding at playback rate 1) and swings forward on
 * a lifted arc; legs are solved with IK so the soles stay planted.
 */
import type { AnimClipDef, AnimKeyframe, Pose } from '../../core/types';
import type { Euler3 } from './ik';
import { ANKLE, legs, type FootPlant } from './poses';

export interface GaitParams {
  name: string;
  /** Seconds per full cycle (two steps). */
  period: number;
  /** Fraction of the cycle each foot is planted. */
  duty: number;
  /** Ground speed (m/s) the clip matches at playback rate 1. */
  speed: number;
  /** Travel direction in character space (x, z), unit length. */
  dir: [number, number];
  /** Share of the stance sweep in front of the foot's base spot (0.5 = centred). */
  front: number;
  lift: number;
  hipDrop: number;
  /** Hip bob amplitude; + = highest at mid-stance (walk), - = lowest (run). */
  bob: number;
  sway: number;
  hipYaw: number;
  lean: number;
  spineLean: number;
  chestTwist: number;
  armSwing: number;
  elbow: number;
  elbowPump: number;
  armOut: number;
  /** Toe-off heel raise (sole pitch). */
  heelLift: number;
  keys: number;
  /** Base ankle spots (x, z) for left/right; default hip-width apart. */
  feet?: { L: [number, number]; R: [number, number] };
  /** Constant hips yaw (bladed stances). */
  hipsYaw0?: number;
  /** Replaces the procedural arm/torso swing (combat guard, fleeing). */
  upper?: (phase: number) => Pose;
}

const DEFAULT_FEET = { L: [0.1, 0] as [number, number], R: [-0.1, 0] as [number, number] };
const TOE = 0.13;

export function gaitClip(g: GaitParams): AnimClipDef {
  const keys: AnimKeyframe[] = [];
  for (let i = 0; i < g.keys; i++) keys.push({ t: i / g.keys, pose: gaitPose(g, i / g.keys) });
  return { name: g.name, duration: g.period, loop: true, keys };
}

function gaitPose(g: GaitParams, p: number): Pose {
  const c = Math.cos(2 * Math.PI * p);
  const fwd = g.dir[1];
  const midStance = p - g.duty / 2;
  const root: Euler3 = [
    g.sway * Math.cos(2 * Math.PI * midStance),
    -g.hipDrop + g.bob * Math.cos(4 * Math.PI * midStance),
    0,
  ];
  const hips: Euler3 = [g.lean, (g.hipsYaw0 ?? 0) - g.hipYaw * c * fwd, 0];
  const feet = g.feet ?? DEFAULT_FEET;
  const pose: Pose = {
    rootOffset: root,
    hips,
    ...legs(hips, root, foot(g, feet.L, p), foot(g, feet.R, (p + 0.5) % 1)),
  };
  return { ...pose, ...(g.upper ? g.upper(p) : swing(g, c, fwd)) };
}

/** Ankle plant for one foot at its own phase q (0 = heel strike at the front). */
function foot(g: GaitParams, base: [number, number], q: number): FootPlant {
  const sweep = g.speed * g.duty * g.period;
  const front = g.front * sweep;
  let along: number;
  let lift = 0;
  let pitch: number;
  if (q < g.duty) {
    const s = q / g.duty;
    along = front - s * sweep;
    pitch = s < 0.15 ? -0.2 * (1 - s / 0.15) : s > 0.6 ? g.heelLift * ((s - 0.6) / 0.4) ** 2 : 0;
  } else {
    const s = (q - g.duty) / (1 - g.duty);
    const e = s * s * (3 - 2 * s);
    along = front - sweep + e * sweep;
    lift = g.lift * Math.sin(Math.PI * Math.min(1, s * 1.1));
    pitch = s < 0.3 ? g.heelLift * (1 - s / 0.3) : -0.2 * Math.sin(Math.PI * Math.min(1, (s - 0.3) / 0.7) * 0.5);
  }
  const heel = TOE * Math.sin(Math.max(0, pitch));
  return {
    at: [base[0] + g.dir[0] * along, ANKLE + lift + heel, base[1] + g.dir[1] * along],
    pitch,
  };
}

/** Natural counter-swing of arms and torso. */
function swing(g: GaitParams, c: number, fwd: number): Pose {
  const a = g.armSwing * c * fwd;
  const forwardL = Math.max(0, -c * fwd);
  const forwardR = Math.max(0, c * fwd);
  const counter = g.hipYaw * c * fwd;
  return {
    spine: [g.spineLean, counter, 0],
    chest: [0.02, g.chestTwist * c * fwd, 0],
    neck: [-(g.lean + g.spineLean) * 0.6, -g.chestTwist * c * fwd * 0.7, 0],
    head: [-(g.lean + g.spineLean) * 0.3, 0, 0],
    upperArmL: [a, 0, g.armOut],
    forearmL: [g.elbow - g.elbowPump * forwardL, 0, 0],
    handL: [0, 0, 0.1],
    upperArmR: [-a, 0, -g.armOut],
    forearmR: [g.elbow - g.elbowPump * forwardR, 0, 0],
    handR: [0, 0, -0.1],
  };
}
