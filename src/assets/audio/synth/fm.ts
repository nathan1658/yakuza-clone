import { perc } from './env';
import { gain, osc } from './nodes';

export interface FmNote {
  t: number;
  freq: number;
  /** Modulator frequency = freq * ratio (non-integer ratios give inharmonic, metallic spectra). */
  ratio: number;
  /** Peak modulation index; decays to index * sustainIndex over `indexDecay`. */
  index: number;
  indexDecay: number;
  sustainIndex?: number;
  peak: number;
  attack?: number;
  decay: number;
}

/** Two-operator FM voice: sine modulator into sine carrier. Returns the carrier output gain. */
export function fm(c: BaseAudioContext, dst: AudioNode, n: FmNote): GainNode {
  const dur = (n.attack ?? 0.002) + n.decay + 0.05;
  const modHz = n.freq * n.ratio;
  const mod = osc(c, 'sine', modHz, n.t, dur);
  const depth = gain(c);
  const idx = depth.gain;
  idx.setValueAtTime(n.index * modHz, n.t);
  idx.exponentialRampToValueAtTime(Math.max(1e-3, n.index * modHz * (n.sustainIndex ?? 0.05)), n.t + n.indexDecay);
  const car = osc(c, 'sine', n.freq, n.t, dur);
  mod.connect(depth).connect(car.frequency);
  const out = gain(c);
  perc(out.gain, n.t, n.peak, n.attack ?? 0.002, n.decay);
  car.connect(out).connect(dst);
  return out;
}
