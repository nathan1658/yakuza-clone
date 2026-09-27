import { Vector3 } from 'three';
import type { PlaySfxOptions } from '../../../core/types';
import type { AnySfx } from '../sfx/types';
import { gain } from '../synth/nodes';
import { renderBed } from './beds';
import { ambienceTargets, LAYERS, type AmbienceInput, type LayerId, type LayerLevels } from './levels';

/** Loop gain at layer level 1 (beds are normalised to unit peak). */
const BASE: LayerLevels = { rain: 0.65, drips: 0.35, city: 0.4, harbour: 0.5, neon: 0.12 };
/** Time constant of layer level changes, seconds. */
const GLIDE = 0.6;
const EPS = 0.005;
const MIN_LEVEL = 0.05;

/** A random event on top of a bed; its loudness follows the layer it belongs to. */
interface OneShot {
  readonly id: AnySfx;
  readonly layer: LayerId;
  readonly every: readonly [number, number];
  readonly volume: number;
  readonly near: number;
  readonly far: number;
  readonly height: number;
  /** Half-width of the bearing arc around north (-Z, the harbour side); PI = anywhere. */
  readonly arc: number;
}

const ONE_SHOTS: readonly OneShot[] = [
  { id: 'car_horn', layer: 'city', every: [8, 20], volume: 0.5, near: 12, far: 30, height: 1, arc: Math.PI },
  { id: 'tram_bell', layer: 'city', every: [25, 60], volume: 0.6, near: 20, far: 35, height: 3, arc: Math.PI },
  { id: 'rope_creak', layer: 'harbour', every: [4, 10], volume: 0.7, near: 3, far: 8, height: 0.5, arc: 1.2 },
  { id: 'ship_horn', layer: 'harbour', every: [30, 60], volume: 2, near: 30, far: 45, height: 8, arc: 0.8 },
];

const between = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export type OneShotSink = (id: AnySfx, opts: PlaySfxOptions) => void;

/** Looping weather/city/harbour beds plus scattered one-shots, all on the ambience bus. */
export class Ambience {
  private readonly gains: Record<LayerId, GainNode>;
  private readonly sources: AudioBufferSourceNode[] = [];
  private readonly targets = {} as LayerLevels;
  private readonly applied: LayerLevels = { rain: -1, drips: -1, city: -1, harbour: -1, neon: -1 };
  private readonly timers = ONE_SHOTS.map((s) => between(s.every[0] / 2, s.every[1]));
  private readonly spot = new Vector3();
  private readonly shotOpts: PlaySfxOptions = { position: this.spot, volume: 1 };
  private rendering: Promise<void> | null = null;
  private disposed = false;

  constructor(private readonly c: AudioContext, out: AudioNode, private readonly oneShot: OneShotSink) {
    this.gains = { rain: gain(c), drips: gain(c), city: gain(c), harbour: gain(c), neon: gain(c) };
    for (const id of LAYERS) this.gains[id].connect(out);
  }

  /** Render every bed and start its loop. Idempotent. */
  render(): Promise<void> {
    return (this.rendering ??= this.renderQueue());
  }

  update(realDt: number, input: AmbienceInput): void {
    ambienceTargets(input, this.targets);
    const now = this.c.currentTime;
    for (const id of LAYERS) {
      const t = this.targets[id];
      if (Math.abs(t - this.applied[id]) < EPS) continue;
      this.applied[id] = t;
      this.gains[id].gain.setTargetAtTime(t * BASE[id], now, GLIDE);
    }
    for (let i = 0; i < ONE_SHOTS.length; i++) {
      this.timers[i] -= realDt;
      if (this.timers[i] > 0) continue;
      const shot = ONE_SHOTS[i];
      this.timers[i] = between(shot.every[0], shot.every[1]);
      this.fire(shot, input);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const s of this.sources) s.stop();
    for (const id of LAYERS) this.gains[id].disconnect();
  }

  private fire(shot: OneShot, input: AmbienceInput): void {
    const level = this.targets[shot.layer];
    if (level < MIN_LEVEL) return;
    const bearing = (Math.random() * 2 - 1) * shot.arc;
    const dist = between(shot.near, shot.far);
    this.spot.set(input.x + Math.sin(bearing) * dist, shot.height, input.z - Math.cos(bearing) * dist);
    this.shotOpts.volume = shot.volume * level;
    this.oneShot(shot.id, this.shotOpts);
  }

  private async renderQueue(): Promise<void> {
    for (const id of LAYERS) {
      try {
        this.start(id, await renderBed(id, this.c));
      } catch (err) {
        console.warn(`[audio] ambience '${id}' failed to render`, err);
      }
    }
  }

  private start(id: LayerId, buffer: AudioBuffer): void {
    if (this.disposed) return;
    const src = this.c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.gains[id]);
    src.start(this.c.currentTime, Math.random() * buffer.duration);
    this.sources.push(src);
  }
}
