import { adsr, perc } from '../../synth/env';
import { biquad, chain, formant, gain, osc } from '../../synth/nodes';
import { noise } from '../../synth/noise';
import { mtof } from '../../synth/notes';
import type { Instrument, Note, Out } from '../types';
import { lfo, outlet, pan } from './util';

/** Detuned oscillators spread across the stereo field into one shared filter. */
function spread(c: BaseAudioContext, type: OscillatorType, f: number, t: number, end: number, cents: number, dst: AudioNode): OscillatorNode[] {
  return [-1, 0, 1].map((k) => {
    const s = osc(c, type, f, t, end - t, k * cents);
    s.connect(pan(c, k * 0.6)).connect(dst);
    return s;
  });
}

/** Lush analogue pad: three detuned saws, slow filter LFO. */
export const pad: Instrument = (o, n) => {
  const { c } = o;
  const amp = gain(c);
  const end = adsr(amp.gain, n.t, 0.075 * n.vel, 0.8, 1, 0.8, n.dur, 1.4);
  const lp = biquad(c, 'lowpass', 950, 1.2);
  lfo(c, lp.frequency, n.t, end, 0.23, 380);
  spread(c, 'sawtooth', mtof(n.midi), n.t, end, 9, lp);
  chain(lp, amp, outlet(o, 0.5));
};

/** String ensemble: detuned saws with delayed vibrato. */
export const strings: Instrument = (o, n) => {
  const { c } = o;
  const amp = gain(c);
  const end = adsr(amp.gain, n.t, 0.075 * n.vel, 0.28, 0.5, 0.85, n.dur, 0.6);
  const lp = biquad(c, 'lowpass', 2600, 0.5);
  const oscs = spread(c, 'sawtooth', mtof(n.midi), n.t, end, 7, lp);
  lfo(c, oscs.map((s) => s.detune), n.t, end, 5.2, 9, 0.25);
  chain(lp, biquad(c, 'highpass', 160), amp, outlet(o, 0.55));
};

/** Choir "aah": saws through vowel formants. */
export const choir: Instrument = (o, n) => {
  const { c } = o;
  const amp = gain(c);
  const end = adsr(amp.gain, n.t, 0.5 * n.vel, 0.5, 0.8, 0.9, n.dur, 0.9);
  const src = gain(c, 1);
  const oscs = spread(c, 'sawtooth', mtof(n.midi), n.t, end, 6, src);
  lfo(c, oscs.map((s) => s.detune), n.t, end, 4.8, 12, 0.3);
  formant(c, src, amp, n.midi < 60 ? 'o' : 'a', 6);
  chain(amp, outlet(o, 0.6));
};

/** Watery pad: resonant low-pass slowly sweeping over soft triangles. */
export const glass: Instrument = (o, n) => {
  const { c } = o;
  const amp = gain(c);
  const end = adsr(amp.gain, n.t, 0.16 * n.vel, 1.2, 1, 0.8, n.dur, 1.5);
  const lp = biquad(c, 'lowpass', 1400, 9);
  lfo(c, lp.frequency, n.t, end, 0.17 + (n.midi % 5) * 0.03, 750);
  spread(c, 'triangle', mtof(n.midi), n.t, end, 6, lp);
  chain(lp, amp, outlet(o, 0.7));
};

/** Low brass swell: saws with an opening filter. */
export const brass: Instrument = (o, n) => {
  const { c } = o;
  const amp = gain(c);
  const end = adsr(amp.gain, n.t, 0.11 * n.vel, 0.2, 0.6, 0.75, n.dur, 0.35);
  const lp = biquad(c, 'lowpass', 250, 1.5);
  lp.frequency.setValueAtTime(250, n.t);
  lp.frequency.linearRampToValueAtTime(300 + 1500 * n.vel, n.t + 0.22);
  lp.frequency.setTargetAtTime(900, n.t + 0.22, 0.3);
  spread(c, 'sawtooth', mtof(n.midi), n.t, end, 5, lp);
  chain(lp, amp, outlet(o, 0.4));
};

/** Tense detuned square pulse; the 0.6% detune beats against itself. */
export const pulse: Instrument = (o, n) => {
  const { c } = o;
  const amp = gain(c);
  const end = adsr(amp.gain, n.t, 0.11 * n.vel, 0.005, 0.15, 0.35, n.dur, 0.1);
  const lp = biquad(c, 'lowpass', 900, 2);
  osc(c, 'square', mtof(n.midi), n.t, end - n.t).connect(lp);
  osc(c, 'square', mtof(n.midi) * 1.006, n.t, end - n.t).connect(lp);
  chain(lp, amp, outlet(o, 0.3));
};

/** Vinyl surface: soft hiss bed plus sparse random crackles for the whole note. */
export const vinyl: Instrument = (o: Out, n: Note) => {
  const { c } = o;
  const out = outlet(o, 0);
  const hiss = gain(c);
  hiss.gain.setValueAtTime(0, n.t);
  hiss.gain.linearRampToValueAtTime(0.02 * n.vel, n.t + 0.05);
  hiss.gain.setValueAtTime(0.02 * n.vel, n.t + n.dur - 0.05);
  hiss.gain.linearRampToValueAtTime(0, n.t + n.dur);
  chain(noise(c, n.t, n.dur, 'pink'), biquad(c, 'bandpass', 3500, 0.4), hiss, out);
  const pops = gain(c);
  const count = 4 + Math.floor(n.dur * 3);
  for (let k = 0; k < count; k++) crackle(pops.gain, n.t + ((k + Math.random()) / count) * n.dur, n.vel);
  chain(noise(c, n.t, n.dur), biquad(c, 'highpass', 1200), pops, out);
};

function crackle(p: AudioParam, at: number, vel: number): void {
  perc(p, at, (0.05 + 0.2 * Math.random()) * vel, 0.0003, 0.0025);
}
