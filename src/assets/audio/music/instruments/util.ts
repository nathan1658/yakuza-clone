import { perc } from '../../synth/env';
import { gain } from '../../synth/nodes';
import { mtof } from '../../synth/notes';
import type { Note, Out } from '../types';

/** A voice's output: dry into the track, plus a reverb send of `send`. */
export function outlet(o: Out, send: number): GainNode {
  const g = gain(o.c, 1);
  g.connect(o.dry);
  if (send > 0) g.connect(gain(o.c, send)).connect(o.wet);
  return g;
}

/** Gain node carrying a percussive envelope. */
export function penv(c: BaseAudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = gain(c);
  perc(g.gain, t, peak, attack, decay);
  return g;
}

export function pan(c: BaseAudioContext, value: number): StereoPannerNode {
  const p = c.createStereoPanner();
  p.pan.value = value;
  return p;
}

/** Oscillator start frequency: the previous note when sliding, else the note itself. */
export function startFreq(n: Note, mul = 1): number {
  return mtof(Number.isNaN(n.from) ? n.midi : n.from) * mul;
}

/** Portamento: glide from the previous note to this one over `sec`. */
export function slide(p: AudioParam, n: Note, sec: number, mul = 1): void {
  if (!Number.isNaN(n.from)) p.exponentialRampToValueAtTime(mtof(n.midi) * mul, n.t + sec);
}

/** Sine LFO added onto `p` (e.g. detune in cents), fading in after `delay`. */
export function lfo(c: BaseAudioContext, p: AudioParam | AudioParam[], t: number, end: number, rate: number, depth: number, delay = 0): void {
  const o = c.createOscillator();
  o.frequency.value = rate;
  const g = gain(c);
  g.gain.setValueAtTime(0, t);
  g.gain.setValueAtTime(0, t + delay);
  g.gain.linearRampToValueAtTime(depth, t + delay + 0.3);
  o.connect(g);
  for (const param of Array.isArray(p) ? p : [p]) g.connect(param);
  o.start(t);
  o.stop(end);
}
