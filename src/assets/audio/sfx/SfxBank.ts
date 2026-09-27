import type { PlaySfxOptions } from '../../../core/types';
import { gain } from '../synth/nodes';
import { RECIPES } from './recipes';
import { renderRecipe } from './render';
import type { AnySfx } from './types';
import {
  distanceGain, MAX_DISTANCE, MAX_VOICES, pickVariant, pickVictim, REF_DISTANCE, ROLLOFF, spreadRate,
  type VoiceInfo,
} from './voices';

export interface Vec3 { x: number; y: number; z: number }

interface Voice extends VoiceInfo {
  readonly src: AudioBufferSourceNode;
  readonly amp: GainNode;
  readonly panner: PannerNode | null;
}

const STEAL_FADE = 0.005;

/**
 * Pre-rendered SFX buffers plus a bounded voice pool. Buffers render in the
 * background after unlock; a sound requested before its buffer exists is skipped.
 */
export class SfxBank {
  private readonly buffers = new Map<AnySfx, AudioBuffer[]>();
  private readonly lastVariant = new Map<AnySfx, number>();
  private readonly voices: Voice[] = [];
  private rendering: Promise<void> | null = null;

  /** `ear` is the listener position, kept current by the owner, used for distance culling. */
  constructor(private readonly c: AudioContext, private readonly out: AudioNode, private readonly ear: Readonly<Vec3>) {}

  get readyCount(): number {
    return this.buffers.size;
  }

  /** Render every recipe, one at a time in priority order. Idempotent. */
  renderAll(): Promise<void> {
    return (this.rendering ??= this.renderQueue());
  }

  play(id: AnySfx, opts?: PlaySfxOptions, dest: AudioNode = this.out): void {
    const list = this.buffers.get(id);
    const volume = Math.max(0, opts?.volume ?? 1);
    const pos = opts?.position;
    const dist = pos ? Math.hypot(pos.x - this.ear.x, pos.y - this.ear.y, pos.z - this.ear.z) : 0;
    if (!list || volume === 0 || dist > MAX_DISTANCE) return;

    const v = pickVariant(list.length, this.lastVariant.get(id) ?? -1, Math.random());
    this.lastVariant.set(id, v);
    const now = this.c.currentTime;
    if (this.voices.length >= MAX_VOICES) this.steal(now);

    const src = this.c.createBufferSource();
    src.buffer = list[v];
    const rate = spreadRate(opts?.pitch ?? 1, Math.random());
    src.playbackRate.value = rate;
    const amp = gain(this.c, volume);
    const panner = pos ? this.panner(pos) : null;
    src.connect(amp).connect(panner ?? dest);
    panner?.connect(dest);

    const voice: Voice = {
      src, amp, panner,
      loudness: RECIPES[id].level * volume * distanceGain(dist),
      start: now,
      end: now + list[v].duration / rate,
    };
    this.voices.push(voice);
    src.onended = () => this.release(voice);
    src.start(now);
  }

  /** Silence everything immediately (dispose, title reload). */
  stopAll(): void {
    const now = this.c.currentTime;
    while (this.voices.length) this.fadeOut(this.voices.pop()!, now);
  }

  private async renderQueue(): Promise<void> {
    for (const id of Object.keys(RECIPES) as AnySfx[]) {
      try {
        this.buffers.set(id, await renderRecipe(id, RECIPES[id], this.c.sampleRate));
      } catch (err) {
        console.warn(`[audio] sfx '${id}' failed to render`, err);
      }
    }
  }

  private panner(pos: Vec3): PannerNode {
    const p = this.c.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = REF_DISTANCE;
    p.maxDistance = MAX_DISTANCE;
    p.rolloffFactor = ROLLOFF;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    return p;
  }

  private steal(now: number): void {
    const [victim] = this.voices.splice(pickVictim(this.voices, now), 1);
    this.fadeOut(victim, now);
  }

  private fadeOut(v: Voice, now: number): void {
    v.amp.gain.setTargetAtTime(0, now, STEAL_FADE);
    v.src.stop(now + STEAL_FADE * 6);
  }

  private release(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    v.amp.disconnect();
    v.panner?.disconnect();
  }
}
