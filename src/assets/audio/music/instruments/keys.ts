import { adsr } from '../../synth/env';
import { fm } from '../../synth/fm';
import { biquad, chain, gain, osc } from '../../synth/nodes';
import { noise } from '../../synth/noise';
import { mtof } from '../../synth/notes';
import type { Instrument } from '../types';
import { outlet, penv, slide, startFreq } from './util';

/** Synth bass: saw + triangle sub-octave through a resonant low-pass with a plucky filter envelope. */
export const bass: Instrument = (o, n) => {
  const { c } = o;
  const end = n.t + n.dur + 0.1;
  const lp = biquad(c, 'lowpass', 220, 6);
  lp.frequency.setValueAtTime(260 + 1900 * n.vel, n.t);
  lp.frequency.setTargetAtTime(230, n.t + 0.004, 0.08);
  const saw = osc(c, 'sawtooth', startFreq(n), n.t, end - n.t);
  const sub = osc(c, 'triangle', startFreq(n, 0.5), n.t, end - n.t);
  slide(saw.frequency, n, 0.07);
  slide(sub.frequency, n, 0.07, 0.5);
  saw.connect(lp);
  sub.connect(lp);
  const amp = gain(c);
  adsr(amp.gain, n.t, 0.5 * n.vel, 0.004, 0.25, 0.7, n.dur, 0.08);
  chain(lp, amp, outlet(o, 0));
};

/** Round sine sub bass for the ballad and harbour tracks. */
export const sub: Instrument = (o, n) => {
  const { c } = o;
  const end = n.t + n.dur + 0.2;
  const lp = biquad(c, 'lowpass', 700);
  const s = osc(c, 'sine', startFreq(n), n.t, end - n.t);
  const tri = osc(c, 'triangle', startFreq(n), n.t, end - n.t);
  slide(s.frequency, n, 0.08);
  slide(tri.frequency, n, 0.08);
  s.connect(lp);
  chain(tri, gain(c, 0.35), lp);
  const amp = gain(c);
  adsr(amp.gain, n.t, 0.42 * n.vel, 0.012, 0.4, 0.8, n.dur, 0.15);
  chain(lp, amp, outlet(o, 0));
};

/** FM electric piano: soft ratio-1 body plus a short high tine. */
export const ep: Instrument = (o, n) => {
  const out = outlet(o, 0.25);
  const f = mtof(n.midi);
  const decay = Math.min(3.2, n.dur + 1.1);
  fm(o.c, out, { t: n.t, freq: f, ratio: 1, index: 1.3 + 1.2 * n.vel, indexDecay: 0.5, sustainIndex: 0.15, peak: 0.2 * n.vel, attack: 0.003, decay });
  fm(o.c, out, { t: n.t, freq: f, ratio: 14.03, index: 0.9, indexDecay: 0.05, peak: 0.035 * n.vel, decay: 0.22 });
};

/** Acoustic-ish piano: two FM layers with slightly stretched octave and a hammer tick. */
export const piano: Instrument = (o, n) => {
  const { c } = o;
  const out = outlet(o, 0.35);
  const f = mtof(n.midi);
  const decay = Math.max(1.4, Math.min(4.5, 4.5 - (n.midi - 48) * 0.07));
  fm(c, out, { t: n.t, freq: f, ratio: 1, index: 0.4 + 1.1 * n.vel, indexDecay: 0.35, sustainIndex: 0.2, peak: 0.2 * n.vel, decay });
  fm(c, out, { t: n.t, freq: f * 1.0012, ratio: 2.001, index: 0.35, indexDecay: 0.2, peak: 0.07 * n.vel, decay: decay * 0.6 });
  chain(noise(c, n.t, 0.03), biquad(c, 'bandpass', Math.min(8000, f * 5), 1.2), penv(c, n.t, 0.05 * n.vel, 0.0005, 0.02), out);
};

/** Celesta-like bell: inharmonic FM shimmer over a pure sine. */
export const bell: Instrument = (o, n) => {
  const { c } = o;
  const out = outlet(o, 0.5);
  const f = mtof(n.midi);
  fm(c, out, { t: n.t, freq: f, ratio: 3.5, index: 2.2, indexDecay: 0.7, peak: 0.1 * n.vel, decay: 2 });
  chain(osc(c, 'sine', f, n.t, 1.8), penv(c, n.t, 0.08 * n.vel, 0.002, 1.6), out);
};
