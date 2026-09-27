import { glide } from '../../synth/env';
import { biquad, chain, gain, osc } from '../../synth/nodes';
import { noise } from '../../synth/noise';
import type { Instrument, Out } from '../types';
import { outlet, penv } from './util';

export const kick: Instrument = (o, n) => {
  const { c } = o;
  const out = outlet(o, 0.04);
  const body = osc(c, 'sine', 165, n.t, 0.5);
  glide(body.frequency, n.t, 165, 47, 0.11);
  chain(body, penv(c, n.t, 0.9 * n.vel, 0.002, 0.42), out);
  chain(noise(c, n.t, 0.02), biquad(c, 'highpass', 2500), penv(c, n.t, 0.22 * n.vel, 0.0005, 0.012), out);
};

export const snare: Instrument = (o, n) => {
  const { c } = o;
  const out = outlet(o, 0.22);
  const body = osc(c, 'triangle', 215, n.t, 0.2);
  glide(body.frequency, n.t, 215, 168, 0.05);
  chain(body, penv(c, n.t, 0.5 * n.vel, 0.001, 0.1), out);
  const hp = biquad(c, 'highpass', 1300);
  chain(noise(c, n.t, 0.3), hp, biquad(c, 'peaking', 4800, 1, 5), penv(c, n.t, 0.5 * n.vel, 0.001, 0.19), out);
};

function hat(o: Out, t: number, vel: number, decay: number): void {
  const { c } = o;
  const out = outlet(o, 0.08);
  chain(noise(c, t, decay + 0.02), biquad(c, 'highpass', 7200), biquad(c, 'bandpass', 10500, 0.7), penv(c, t, 0.34 * vel, 0.001, decay), out);
  const metal = biquad(c, 'highpass', 8000);
  osc(c, 'square', 3570, t, decay).connect(metal);
  osc(c, 'square', 5410, t, decay).connect(metal);
  chain(metal, penv(c, t, 0.03 * vel, 0.001, decay * 0.6), out);
}

export const closedHat: Instrument = (o, n) => hat(o, n.t, n.vel, 0.045);
export const openHat: Instrument = (o, n) => hat(o, n.t, n.vel * 0.8, 0.3);

export const clap: Instrument = (o, n) => {
  const { c } = o;
  const g = gain(c);
  const p = g.gain;
  for (let k = 0; k < 3; k++) {
    p.setValueAtTime(0.55 * n.vel, n.t + k * 0.011);
    p.exponentialRampToValueAtTime(0.06 * n.vel, n.t + k * 0.011 + 0.009);
  }
  p.setValueAtTime(0.55 * n.vel, n.t + 0.033);
  p.exponentialRampToValueAtTime(1e-4, n.t + 0.2);
  p.setValueAtTime(0, n.t + 0.2);
  chain(noise(c, n.t, 0.22), biquad(c, 'bandpass', 1150, 1.2), g, outlet(o, 0.35));
};

function tom(o: Out, t: number, vel: number, hz: number): void {
  const { c } = o;
  const out = outlet(o, 0.2);
  const body = osc(c, 'sine', hz * 1.5, t, 0.4);
  glide(body.frequency, t, hz * 1.5, hz, 0.08);
  chain(body, penv(c, t, 0.6 * vel, 0.002, 0.32), out);
  chain(noise(c, t, 0.06), biquad(c, 'lowpass', 1200), penv(c, t, 0.14 * vel, 0.001, 0.05), out);
}

export const tomHi: Instrument = (o, n) => tom(o, n.t, n.vel, 150);
export const tomLo: Instrument = (o, n) => tom(o, n.t, n.vel, 92);

export const rim: Instrument = (o, n) => {
  const { c } = o;
  const bp = biquad(c, 'bandpass', 1650, 3);
  osc(c, 'triangle', 1750, n.t, 0.05).connect(bp);
  osc(c, 'square', 820, n.t, 0.05).connect(bp);
  chain(bp, penv(c, n.t, 0.45 * n.vel, 0.0005, 0.035), outlet(o, 0.2));
};

export const crash: Instrument = (o, n) => {
  const { c } = o;
  const out = outlet(o, 0.35);
  chain(noise(c, n.t, 2), biquad(c, 'highpass', 3300), penv(c, n.t, 0.32 * n.vel, 0.002, 1.8), out);
  chain(noise(c, n.t, 1), biquad(c, 'bandpass', 6400, 2), penv(c, n.t, 0.16 * n.vel, 0.001, 0.9), out);
};
