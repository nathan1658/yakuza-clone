/**
 * Keyframe sampler + cross-fader. Pure data in, pure data out: writes one
 * quaternion per bone and a root offset into flat buffers that the rig copies
 * onto its bones, so it can be tested without a scene.
 */
import { Euler, Quaternion } from 'three';
import type { AnimClipDef, PlayAnimOptions } from '../../core/types';
import { clamp, ease } from '../../core/math';
import { BONES } from './skeleton';

const NB = BONES.length;

interface Prepared {
  readonly def: AnimClipDef;
  readonly times: Float32Array;
  /** keys × bones × 4 */
  readonly quats: Float32Array;
  /** keys × 3 */
  readonly roots: Float32Array;
}

const prepared = new WeakMap<AnimClipDef, Prepared>();
const _e = new Euler();
const _q = new Quaternion();

function prepare(def: AnimClipDef): Prepared {
  let p = prepared.get(def);
  if (p) return p;
  const n = def.keys.length;
  const times = new Float32Array(n);
  const quats = new Float32Array(n * NB * 4);
  const roots = new Float32Array(n * 3);
  def.keys.forEach((k, i) => {
    times[i] = k.t;
    BONES.forEach((b, j) => {
      const r = k.pose[b];
      _q.setFromEuler(r ? _e.set(r[0], r[1], r[2], 'XYZ') : _e.set(0, 0, 0, 'XYZ'));
      _q.toArray(quats, (i * NB + j) * 4);
    });
    const o = k.pose.rootOffset;
    if (o) roots.set(o, i * 3);
  });
  p = { def, times, quats, roots };
  prepared.set(def, p);
  return p;
}

const smooth = (x: number): number => x * x * (3 - 2 * x);

/** three's flat slerp works on any array-like; its typings only admit number[]. */
const slerpFlat = Quaternion.slerpFlat as unknown as (
  dst: Float32Array, dstOffset: number, a: Float32Array, aOffset: number, b: Float32Array, bOffset: number, t: number,
) => void;

export class Animator {
  /** Output: one quaternion (x, y, z, w) per bone, in BONES order. */
  readonly pose = new Float32Array(NB * 4);
  /** Output: hips offset from bind position, in metres (already height-scaled). */
  readonly root = new Float32Array(3);
  /** Playback-rate multiplier for the current clip; reset to 1 on every (re)start. */
  rate = 1;

  private clip: Prepared;
  private duration: number;
  private loop: boolean;
  private time = 0;
  private prevNorm = 0;
  private norm = 0;
  private keyIndex = 0;
  private readonly from = new Float32Array(NB * 4);
  private readonly fromRoot = new Float32Array(3);
  private blendTime = 0;
  private blendDur = 0;
  private readonly sampled = new Float32Array(NB * 4);
  private readonly sampledRoot = new Float32Array(3);

  constructor(
    initial: AnimClipDef,
    private readonly rootScale: number,
  ) {
    this.clip = prepare(initial);
    this.duration = initial.duration;
    this.loop = initial.loop;
    for (let i = 0; i < NB; i++) this.pose[i * 4 + 3] = 1;
    this.sample();
    this.pose.set(this.sampled);
    this.root.set(this.sampledRoot);
  }

  get def(): AnimClipDef {
    return this.clip.def;
  }

  get looping(): boolean {
    return this.loop;
  }

  get progress(): number {
    return this.loop ? this.norm - Math.floor(this.norm) : clamp(this.norm, 0, 1);
  }

  get finished(): boolean {
    return !this.loop && this.time >= this.duration;
  }

  play(def: AnimClipDef, opts: PlayAnimOptions = {}): void {
    const loop = opts.loop ?? def.loop;
    const restart = opts.restart ?? !loop;
    const duration = Math.max(1e-3, opts.duration ?? def.duration);
    if (def === this.clip.def && !restart) {
      this.time *= duration / this.duration;
      this.duration = duration;
      this.loop = loop;
      return;
    }
    this.from.set(this.pose);
    this.fromRoot.set(this.root);
    this.blendDur = Math.max(0, opts.blend ?? 0.12);
    this.blendTime = 0;
    this.clip = prepare(def);
    this.duration = duration;
    this.loop = loop;
    this.time = 0;
    this.norm = 0;
    this.prevNorm = 0;
    this.keyIndex = 0;
    this.rate = 1;
  }

  /** Did playback pass normalised clip time `at` (0..1) during the last update? */
  crossed(at: number): boolean {
    return Math.floor(this.norm - at) > Math.floor(this.prevNorm - at);
  }

  update(dt: number): void {
    this.time += dt * this.rate;
    if (!this.loop && this.time > this.duration) this.time = this.duration;
    this.prevNorm = this.norm;
    this.norm = this.time / this.duration;
    this.sample();
    this.blendTime += dt;
    const w = this.blendDur > 0 ? smooth(clamp(this.blendTime / this.blendDur, 0, 1)) : 1;
    if (w >= 1) {
      this.pose.set(this.sampled);
      this.root.set(this.sampledRoot);
      return;
    }
    for (let i = 0; i < NB; i++) slerpFlat(this.pose, i * 4, this.from, i * 4, this.sampled, i * 4, w);
    for (let i = 0; i < 3; i++) this.root[i] = this.fromRoot[i] + (this.sampledRoot[i] - this.fromRoot[i]) * w;
  }

  private sample(): void {
    const { times, quats, roots, def } = this.clip;
    const n = times.length;
    const t = this.loop ? this.norm - Math.floor(this.norm) : clamp(this.norm, 0, 1);
    let i = this.keyIndex < n && times[this.keyIndex] <= t ? this.keyIndex : 0;
    while (i + 1 < n && times[i + 1] <= t) i++;
    this.keyIndex = i;
    const last = i === n - 1;
    if (last && !this.loop) {
      this.copyKey(i);
      return;
    }
    const j = last ? 0 : i + 1;
    const span = (last ? 1 + times[0] : times[j]) - times[i];
    const u = ease(def.keys[i].ease, span > 0 ? (t - times[i]) / span : 1);
    const a = i * NB * 4;
    const b = j * NB * 4;
    for (let k = 0; k < NB; k++) slerpFlat(this.sampled, k * 4, quats, a + k * 4, quats, b + k * 4, u);
    for (let k = 0; k < 3; k++) {
      this.sampledRoot[k] = (roots[i * 3 + k] + (roots[j * 3 + k] - roots[i * 3 + k]) * u) * this.rootScale;
    }
  }

  private copyKey(i: number): void {
    const { quats, roots } = this.clip;
    this.sampled.set(quats.subarray(i * NB * 4, (i + 1) * NB * 4));
    for (let k = 0; k < 3; k++) this.sampledRoot[k] = roots[i * 3 + k] * this.rootScale;
  }
}
