import { glide } from '../../synth/env';
import { biquad, chain, gain, osc } from '../../synth/nodes';
import { noise } from '../../synth/noise';
import type { Instrument } from '../types';
import { outlet, penv } from './util';

/** Taiko: deep pitched skin, felt thump, stick slap; lots of hall. */
export const taiko: Instrument = (o, n) => {
  const { c } = o;
  const out = outlet(o, 0.45);
  const body = osc(c, 'sine', 98, n.t, 1.1);
  glide(body.frequency, n.t, 98, 56, 0.22);
  chain(body, penv(c, n.t, 0.85 * n.vel, 0.003, 0.9), out);
  chain(noise(c, n.t, 0.2, 'brown'), biquad(c, 'lowpass', 500), penv(c, n.t, 0.6 * n.vel, 0.001, 0.09), out);
  chain(noise(c, n.t, 0.05), biquad(c, 'bandpass', 1800), penv(c, n.t, 0.16 * n.vel, 0.0005, 0.02), out);
};

/** Inharmonic tam-tam partials: higher partials bloom later and everything sags in pitch. */
const GONG: readonly (readonly [number, number, number])[] = [
  [1, 0.5, 0.02], [1.47, 0.35, 0.05], [1.93, 0.3, 0.09], [2.53, 0.22, 0.14],
  [3.11, 0.16, 0.2], [4.17, 0.1, 0.28], [5.3, 0.07, 0.35],
];

export const gong: Instrument = (o, n) => {
  const { c } = o;
  const out = outlet(o, 0.5);
  for (const [ratio, amp, bloom] of GONG) {
    const s = osc(c, 'sine', 72 * ratio, n.t, 5);
    glide(s.frequency, n.t, 72 * ratio, 72 * ratio * 0.97, 2.5);
    chain(s, penv(c, n.t, amp * 0.5 * n.vel, bloom, 4.5 - bloom * 4), out);
  }
  chain(noise(c, n.t, 1.6), biquad(c, 'bandpass', 1300, 0.7), penv(c, n.t, 0.18 * n.vel, 0.005, 1.5), out);
};

/** Cantonese-opera small gong (小鑼): the pitch rises after the strike. */
export const luo: Instrument = (o, n) => {
  const { c } = o;
  const out = outlet(o, 0.35);
  const s = osc(c, 'sine', 520, n.t, 1.2);
  glide(s.frequency, n.t, 520, 660, 0.25);
  const h = osc(c, 'sine', 1270, n.t, 1.2);
  glide(h.frequency, n.t, 1270, 1610, 0.25);
  chain(s, penv(c, n.t, 0.3 * n.vel, 0.001, 1.1), out);
  chain(h, penv(c, n.t, 0.12 * n.vel, 0.001, 0.6), out);
  chain(noise(c, n.t, 0.05), biquad(c, 'bandpass', 3000, 1), penv(c, n.t, 0.1 * n.vel, 0.0005, 0.03), out);
};

/** Wood block tick. */
export const block: Instrument = (o, n) => {
  const { c } = o;
  const bp = biquad(c, 'bandpass', 1500, 2);
  osc(c, 'sine', 1320, n.t, 0.1).connect(bp);
  chain(osc(c, 'sine', 2210, n.t, 0.1), gain(c, 0.5), bp);
  chain(bp, penv(c, n.t, 0.5 * n.vel, 0.0005, 0.05), outlet(o, 0.2));
};
