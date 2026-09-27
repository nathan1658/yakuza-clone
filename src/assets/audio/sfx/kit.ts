/**
 * Composable one-shot building blocks for SFX recipes. Every helper schedules
 * at time `t` into `k.out` and cleans up after itself (sources are stopped).
 */
import { adsr, glide, perc } from '../synth/env';
import { fm, type FmNote } from '../synth/fm';
import { biquad, chain, formant, FORMANTS, gain, osc } from '../synth/nodes';
import { noise, type NoiseKind } from '../synth/noise';
import { reverb } from '../synth/reverb';
import { between } from '../synth/rng';
import { shaper } from '../synth/shaper';
import type { Kit } from './types';

/** Random value in [lo, hi) from the kit's seeded RNG. */
export function vary(k: Kit, lo: number, hi: number): number {
  return between(k.r, lo, hi);
}

/** A kit whose output passes through `node` first. */
export function via(k: Kit, node: AudioNode): Kit {
  node.connect(k.out);
  return { c: k.c, out: node, r: k.r };
}

/** Dry signal plus a synthetic room of `seconds` mixed in at `wet`. */
export function room(k: Kit, seconds: number, wet: number): Kit {
  const input = gain(k.c, 1);
  input.connect(k.out);
  chain(input, reverb(k.c, seconds), gain(k.c, wet), k.out);
  return { c: k.c, out: input, r: k.r };
}

export function drive(k: Kit, amount: number): Kit {
  return via(k, shaper(k.c, amount));
}

export function filter(k: Kit, type: BiquadFilterType, freq: number, q = 0.707, db = 0): Kit {
  return via(k, biquad(k.c, type, freq, q, db));
}

/** Filter whose cutoff glides `from` → `to` over `dur`: tape stops, opening risers. */
export function sweep(k: Kit, type: BiquadFilterType, t: number, from: number, to: number, dur: number, q = 0.707): Kit {
  const f = biquad(k.c, type, from, q);
  glide(f.frequency, t, from, to, dur);
  return via(k, f);
}

/** Amplitude modulation between 1 - depth and 1 at `rate` Hz: bell ringers, creaks, growl. */
export function tremolo(k: Kit, t: number, dur: number, rate: number, depth: number, type: OscillatorType = 'sine'): Kit {
  const g = gain(k.c, 1 - depth / 2);
  const d = gain(k.c, depth / 2);
  osc(k.c, type, rate, t, dur).connect(d);
  d.connect(g.gain);
  return via(k, g);
}

export interface ToneOpts {
  freq: number;
  /** Glide target; reached after `glide` seconds (default: half the decay). */
  to?: number;
  glide?: number;
  type?: OscillatorType;
  peak: number;
  attack?: number;
  decay: number;
  detune?: number;
}

/** Enveloped oscillator: body thumps (sine sweeping down), blips, beeps. */
export function tone(k: Kit, t: number, o: ToneOpts): void {
  const a = o.attack ?? 0.002;
  const s = osc(k.c, o.type ?? 'sine', o.freq, t, a + o.decay + 0.02, o.detune ?? 0);
  if (o.to) glide(s.frequency, t, o.freq, o.to, o.glide ?? o.decay * 0.5);
  const g = gain(k.c);
  perc(g.gain, t, o.peak, a, o.decay);
  chain(s, g, k.out);
}

export interface HeldOpts {
  freq: number;
  /** Glide target, reached by the end of the hold. */
  to?: number;
  type?: OscillatorType;
  peak: number;
  attack: number;
  hold: number;
  release: number;
  detune?: number;
}

/** Sustained oscillator (beeps, horns, brass): attack, flat hold, release. */
export function held(k: Kit, t: number, o: HeldOpts): void {
  const s = osc(k.c, o.type ?? 'sine', o.freq, t, Math.max(o.attack, o.hold) + o.release + 0.05, o.detune ?? 0);
  if (o.to) glide(s.frequency, t, o.freq, o.to, o.hold);
  const g = gain(k.c);
  adsr(g.gain, t, o.peak, o.attack, 0.01, 1, o.hold, o.release);
  chain(s, g, k.out);
}

export interface NoiseOpts {
  kind?: NoiseKind;
  type?: BiquadFilterType;
  freq: number;
  /** Filter sweep target over the whole burst. */
  to?: number;
  q?: number;
  peak: number;
  attack?: number;
  decay: number;
}

/** Filtered noise with a percussive envelope: slaps, cracks, swooshes (long attack + sweep). */
export function hiss(k: Kit, t: number, o: NoiseOpts): void {
  const a = o.attack ?? 0.001;
  const dur = a + o.decay + 0.02;
  const f = biquad(k.c, o.type ?? 'bandpass', o.freq, o.q ?? 1);
  if (o.to) glide(f.frequency, t, o.freq, o.to, a + o.decay);
  const g = gain(k.c);
  perc(g.gain, t, o.peak, a, o.decay);
  chain(noise(k.c, t, dur, o.kind ?? 'white', k.r()), f, g, k.out);
}

/** `count` short noise ticks scattered over `spread` seconds, denser at the start: debris, tinkles. */
export function scatter(k: Kit, t: number, spread: number, count: number, o: NoiseOpts): void {
  for (let i = 0; i < count; i++) {
    const at = t + spread * Math.pow(k.r(), 1.7);
    const decay = 1 - (at - t) / (spread * 1.3);
    hiss(k, at, { ...o, freq: o.freq * vary(k, 0.7, 1.45), peak: o.peak * decay * vary(k, 0.35, 1) });
  }
}

/** Inharmonic partials, each ringing shorter and softer than the last: bells, clangs, gongs. */
export function ring(k: Kit, t: number, base: number, ratios: readonly number[], peak: number, decay: number): void {
  ratios.forEach((ratio, i) => tone(k, t, {
    freq: base * ratio, peak: peak / (1 + 0.5 * i), decay: decay / (1 + 0.3 * i), detune: vary(k, -4, 4),
  }));
}

export function fmHit(k: Kit, t: number, n: Omit<FmNote, 't'>): void {
  fm(k.c, k.out, { ...n, t });
}

export interface VoiceOpts {
  vowel: keyof typeof FORMANTS;
  /** Glottal pitch; ignored for whispered (noise) voices. */
  f0?: number;
  to?: number;
  peak: number;
  attack: number;
  decay: number;
  q?: number;
}

/** Formant-filtered voice: a sawtooth throat when `f0` is set, breath noise otherwise. */
export function voice(k: Kit, t: number, o: VoiceOpts): void {
  const dur = o.attack + o.decay + 0.05;
  const g = gain(k.c);
  perc(g.gain, t, o.peak, o.attack, o.decay);
  formant(k.c, throat(k, t, dur, o), g, o.vowel, o.q ?? 6);
  g.connect(k.out);
}

function throat(k: Kit, t: number, dur: number, o: VoiceOpts): AudioNode {
  if (!o.f0) return noise(k.c, t, dur, 'pink', k.r());
  const s = osc(k.c, 'sawtooth', o.f0, t, dur, vary(k, -15, 15));
  if (o.to) glide(s.frequency, t, o.f0, o.to, dur);
  return s;
}
