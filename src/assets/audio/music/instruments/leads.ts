import { adsr } from '../../synth/env';
import { biquad, chain, gain, osc } from '../../synth/nodes';
import { noise } from '../../synth/noise';
import { shaper } from '../../synth/shaper';
import type { Instrument } from '../types';
import { lfo, outlet, penv, slide, startFreq } from './util';

interface Bowed {
  drive: number;
  vibCents: number;
  vibRate: number;
  bright: number;
  peak: number;
}

/**
 * Erhu: a bowed saw through the instrument's nasal body resonances,
 * with delayed vibrato, bow noise and portamento between slurred notes.
 */
function bowed(p: Bowed): Instrument {
  return (o, n) => {
    const { c } = o;
    const amp = gain(c);
    const end = adsr(amp.gain, n.t, p.peak * n.vel, 0.07, 0.3, 0.85, n.dur, 0.18);
    const src = osc(c, 'sawtooth', startFreq(n), n.t, end - n.t);
    slide(src.frequency, n, 0.09);
    lfo(c, src.detune, n.t, end, p.vibRate, p.vibCents, 0.16);
    const body = chain(src, biquad(c, 'highpass', 300), biquad(c, 'peaking', 950, 2, 7), biquad(c, 'peaking', 2500, 3, 5));
    const tone = p.drive > 0 ? chain(body, shaper(c, p.drive), gain(c, 0.6)) : body;
    chain(tone, biquad(c, 'lowpass', p.bright, 0.7), amp);
    chain(noise(c, n.t, end - n.t), biquad(c, 'bandpass', 2200, 1.5), gain(c, 0.08), amp);
    amp.connect(outlet(o, 0.35));
  };
}

export const erhu = bowed({ drive: 0, vibCents: 22, vibRate: 5.6, bright: 4500, peak: 0.2 });
/** Screaming erhu for the boss: overdriven, faster and wider vibrato. */
export const erhuHot = bowed({ drive: 3, vibCents: 32, vibRate: 6.3, bright: 6500, peak: 0.2 });

/** Dizi (bamboo flute): sine + soft triangle, breath noise, a chiff on attack. */
export const dizi: Instrument = (o, n) => {
  const { c } = o;
  const amp = gain(c);
  const end = adsr(amp.gain, n.t, 0.2 * n.vel, 0.04, 0.2, 0.9, n.dur, 0.12);
  const s = osc(c, 'sine', startFreq(n), n.t, end - n.t);
  const tri = osc(c, 'triangle', startFreq(n), n.t, end - n.t);
  slide(s.frequency, n, 0.06);
  slide(tri.frequency, n, 0.06);
  lfo(c, [s.detune, tri.detune], n.t, end, 5, 14, 0.2);
  const out = outlet(o, 0.45);
  s.connect(amp);
  chain(tri, gain(c, 0.3), amp);
  chain(noise(c, n.t, end - n.t, 'pink'), biquad(c, 'bandpass', startFreq(n, 2), 2), gain(c, 0.25), amp);
  chain(amp, biquad(c, 'lowpass', 5000), out);
  chain(noise(c, n.t, 0.05), biquad(c, 'highpass', 2500), penv(c, n.t, 0.06 * n.vel, 0.002, 0.04), out);
};

/** Sax-like lead: bright filter blip on attack, mild growl, breathy. */
export const sax: Instrument = (o, n) => {
  const { c } = o;
  const amp = gain(c);
  const end = adsr(amp.gain, n.t, 0.16 * n.vel, 0.03, 0.25, 0.8, n.dur, 0.12);
  const lp = biquad(c, 'lowpass', 900, 2);
  lp.frequency.setValueAtTime(900, n.t);
  lp.frequency.linearRampToValueAtTime(900 + 2600 * n.vel, n.t + 0.05);
  lp.frequency.setTargetAtTime(1700, n.t + 0.05, 0.12);
  const saw = osc(c, 'sawtooth', startFreq(n), n.t, end - n.t);
  const sq = osc(c, 'square', startFreq(n), n.t, end - n.t, 4);
  slide(saw.frequency, n, 0.05);
  slide(sq.frequency, n, 0.05);
  lfo(c, [saw.detune, sq.detune], n.t, end, 5.2, 18, 0.22);
  saw.connect(lp);
  chain(sq, gain(c, 0.5), lp);
  chain(lp, biquad(c, 'peaking', 1300, 1.5, 4), shaper(c, 1.6), amp);
  chain(noise(c, n.t, end - n.t), biquad(c, 'bandpass', 1700, 1), gain(c, 0.05), amp);
  amp.connect(outlet(o, 0.3));
};

/** Synth lead for combat hooks: square + saw, snappy, with portamento. */
export const lead: Instrument = (o, n) => {
  const { c } = o;
  const amp = gain(c);
  const end = adsr(amp.gain, n.t, 0.13 * n.vel, 0.005, 0.15, 0.75, n.dur, 0.08);
  const lp = biquad(c, 'lowpass', 3200, 3);
  const sq = osc(c, 'square', startFreq(n), n.t, end - n.t);
  const saw = osc(c, 'sawtooth', startFreq(n), n.t, end - n.t, 8);
  slide(sq.frequency, n, 0.05);
  slide(saw.frequency, n, 0.05);
  lfo(c, [sq.detune, saw.detune], n.t, end, 6, 12, 0.25);
  sq.connect(lp);
  saw.connect(lp);
  chain(lp, amp, outlet(o, 0.25));
};
