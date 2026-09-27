import type { Bus, Volumes } from '../settings';
import { gain } from '../synth/nodes';
import { softClipCurve } from './clip';
import { mergeDuck, type DuckState } from './duck';

const VOLUME_TC = 0.02;
const MODE_DUCK_TC = 0.15;
const DUCK_ATTACK_TC = 0.03;
const DUCK_RELEASE_TC = 0.15;
/** Level where the safety clipper starts bending (-1.9 dBFS); normal mixes peak below it. */
const CLIP_KNEE = 0.8;

/**
 * Bus graph:
 *   music, ambience → modeDuck → timedDuck ─┐
 *   sfx ────────────────────────────────────┴→ master → limiter → clipper → destination
 */
export class Mixer {
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly ambience: GainNode;
  private readonly master: GainNode;
  private readonly modeDuck: GainNode;
  private readonly timedDuck: GainNode;
  private duckState: DuckState = { amount: 0, until: 0 };

  constructor(private readonly c: BaseAudioContext, volumes: Readonly<Volumes>) {
    this.master = gain(c, volumes.master);
    this.music = gain(c, volumes.music);
    this.sfx = gain(c, volumes.sfx);
    this.ambience = gain(c, volumes.ambience);
    this.modeDuck = gain(c, 1);
    this.timedDuck = gain(c, 1);

    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    const clipper = c.createWaveShaper();
    // No oversampling: its resampling filter rings past the curve's ceiling.
    clipper.curve = softClipCurve(CLIP_KNEE);

    this.music.connect(this.modeDuck);
    this.ambience.connect(this.modeDuck);
    this.modeDuck.connect(this.timedDuck).connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(limiter).connect(clipper).connect(c.destination);
  }

  setVolume(bus: Bus, value: number): void {
    const node = bus === 'master' ? this.master : this[bus];
    node.gain.setTargetAtTime(value, this.c.currentTime, VOLUME_TC);
  }

  /** Steady duck for the current game mode (1 = none). */
  setModeDuck(level: number): void {
    this.modeDuck.gain.setTargetAtTime(level, this.c.currentTime, MODE_DUCK_TC);
  }

  /** Lower music + ambience by `amount` (0..1) for `seconds`, then recover. */
  duck(amount: number, seconds: number): void {
    const now = this.c.currentTime;
    this.duckState = mergeDuck(this.duckState, now, amount, seconds);
    const p = this.timedDuck.gain;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(1 - this.duckState.amount, now, DUCK_ATTACK_TC);
    p.setTargetAtTime(1, this.duckState.until, DUCK_RELEASE_TC);
  }

  dispose(): void {
    this.master.disconnect();
  }
}
