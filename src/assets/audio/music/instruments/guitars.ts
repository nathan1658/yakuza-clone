import { adsr } from '../../synth/env';
import { biquad, chain, gain, osc } from '../../synth/nodes';
import { pluckBuffer } from '../../synth/karplus';
import { mtof } from '../../synth/notes';
import { shaper } from '../../synth/shaper';
import type { Instrument } from '../types';
import { outlet } from './util';

const RING = 2.2;

/** Karplus–Strong nylon/steel pluck; velocity opens the tone filter. Rings past the gate. */
export const guitar: Instrument = (o, n) => {
  const { c } = o;
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(c, mtof(n.midi), RING, { damping: 0.997, bright: 0.55, seed: n.midi });
  const amp = gain(c);
  const release = n.t + Math.min(RING - 0.3, n.dur + 0.9);
  amp.gain.setValueAtTime(0.4 * n.vel, n.t);
  amp.gain.setTargetAtTime(0, release, 0.08);
  chain(src, biquad(c, 'lowpass', 1800 + 3500 * n.vel), amp, outlet(o, 0.3));
  src.start(n.t);
  src.stop(n.t + RING);
};

const POWER: readonly (readonly [number, number])[] = [[0, 1], [7, 0.75], [12, 0.55]];

/** Distorted power chord (root, fifth, octave) through one shaper, like a real amp. Short notes sound palm-muted. */
export const power: Instrument = (o, n) => {
  const { c } = o;
  const amp = gain(c);
  const end = adsr(amp.gain, n.t, 0.15 * n.vel, 0.003, 0.12, 0.85, n.dur, 0.05);
  const bus = gain(c, 1);
  for (const [iv, g] of POWER) {
    const f = mtof(n.midi + iv);
    chain(osc(c, 'sawtooth', f, n.t, end - n.t, -7), gain(c, 0.3 * g), bus);
    chain(osc(c, 'sawtooth', f, n.t, end - n.t, 7), gain(c, 0.3 * g), bus);
  }
  const cab = 1300 + Math.min(1, n.dur / 0.3) * 1900;
  chain(bus, biquad(c, 'highpass', 110), shaper(c, 8), biquad(c, 'lowpass', cab, 0.9), biquad(c, 'peaking', 1600, 1, -4), amp, outlet(o, 0.12));
};
