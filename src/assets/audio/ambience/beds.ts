import { glide } from '../synth/env';
import { biquad, chain, formant, gain, osc } from '../synth/nodes';
import { noise, type NoiseKind } from '../synth/noise';
import { mulberry32, seedFrom } from '../synth/rng';
import { hiss, tone, vary } from '../sfx/kit';
import type { Kit } from '../sfx/types';
import { seamless, type LayerId } from './levels';

/** A looping stereo bed: `render` fills `seconds + tail`; the tail is folded into the head. */
interface Bed {
  readonly seconds: number;
  readonly tail: number;
  readonly render: (k: Kit, len: number) => void;
}

const PANS = [-0.9, -0.45, 0, 0.45, 0.9];

/** Five fixed stereo positions to scatter events across without a panner per event. */
function spread(k: Kit): Kit[] {
  return PANS.map((pan) => {
    const p = k.c.createStereoPanner();
    p.pan.value = pan;
    p.connect(k.out);
    return { c: k.c, out: p, r: k.r };
  });
}

function pick(k: Kit, kits: Kit[]): Kit {
  return kits[Math.floor(k.r() * kits.length)];
}

/** A continuous filtered noise wash, decorrelated left/right, with slow random level drift. */
function wash(k: Kit, len: number, kind: NoiseKind, type: BiquadFilterType, freq: number, q: number, level: number, drift = 0.3): void {
  const [left, , , , right] = spread(k);
  for (const side of [left, right]) {
    const g = gain(k.c, level);
    for (let t = 0; t < len; t += vary(k, 0.8, 2)) g.gain.linearRampToValueAtTime(level * vary(k, 1 - drift, 1), t);
    chain(noise(k.c, 0, len, kind, k.r()), biquad(k.c, type, freq, q), g, side.out);
  }
}

/** One vehicle crossing the stereo field: road roar + engine drone with a pitch drop. */
function carPass(k: Kit, t: number, dur: number): void {
  const p = k.c.createStereoPanner();
  const dir = k.r() < 0.5 ? -1 : 1;
  p.pan.setValueAtTime(-0.9 * dir, t);
  p.pan.linearRampToValueAtTime(0.9 * dir, t + dur);
  p.connect(k.out);
  const g = gain(k.c);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vary(k, 0.25, 0.45), t + dur * 0.5);
  g.gain.linearRampToValueAtTime(0, t + dur);
  g.connect(p);
  const road = biquad(k.c, 'bandpass', 700, 0.7);
  glide(road.frequency, t, 900, 380, dur);
  chain(noise(k.c, t, dur, 'pink', k.r()), road, g);
  const hz = vary(k, 70, 95);
  const engine = osc(k.c, 'sawtooth', hz, t, dur);
  glide(engine.frequency, t + dur * 0.4, hz, hz * 0.85, dur * 0.2);
  chain(engine, biquad(k.c, 'lowpass', 280), gain(k.c, 0.25), g);
}

/** Low crowd murmur: breath noise through slowly alternating vowel formants. */
function murmur(k: Kit, len: number, level: number): void {
  const sides = spread(k);
  for (const vowel of ['a', 'o', 'e'] as const) {
    const g = gain(k.c, 0);
    for (let t = 0; t < len; t += vary(k, 0.3, 0.9)) g.gain.linearRampToValueAtTime(level * vary(k, 0.2, 1), t);
    formant(k.c, noise(k.c, 0, len, 'pink', k.r()), g, vowel, 4);
    g.connect(pick(k, sides).out);
  }
}

/** One wave: a swell of filtered noise that opens up, then washes back. */
function wave(k: Kit, sides: Kit[], t: number, rise: number, fall: number): void {
  const lp = biquad(k.c, 'lowpass', 350, 0.5);
  lp.frequency.setValueAtTime(350, t);
  lp.frequency.linearRampToValueAtTime(vary(k, 900, 1400), t + rise);
  lp.frequency.linearRampToValueAtTime(400, t + rise + fall);
  const g = gain(k.c);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vary(k, 0.35, 0.55), t + rise);
  g.gain.linearRampToValueAtTime(0, t + rise + fall);
  chain(noise(k.c, t, rise + fall + 0.05, 'pink', k.r()), lp, g, pick(k, sides).out);
}

export const BEDS: Readonly<Record<LayerId, Bed>> = {
  rain: {
    seconds: 10, tail: 1,
    render(k, len) {
      wash(k, len, 'white', 'highpass', 1200, 0.5, 0.22);
      wash(k, len, 'pink', 'bandpass', 1600, 0.5, 0.3);
      wash(k, len, 'brown', 'lowpass', 260, 0.7, 0.35, 0.15);
      const sides = spread(k);
      for (let i = 0; i < len * 45; i++) {
        hiss(pick(k, sides), vary(k, 0, len - 0.05), { freq: vary(k, 2500, 7000), q: 3, peak: vary(k, 0.05, 0.25), decay: vary(k, 0.008, 0.03) });
      }
    },
  },
  drips: {
    seconds: 12, tail: 1,
    render(k, len) {
      wash(k, len, 'pink', 'bandpass', 2600, 2, 0.06, 0.6);
      const sides = spread(k);
      for (let i = 0; i < len * 1.4; i++) {
        const side = pick(k, sides);
        const t = vary(k, 0, len - 0.2);
        const f = vary(k, 1300, 2600);
        tone(side, t, { freq: f, to: f * 0.72, glide: 0.015, peak: vary(k, 0.2, 0.5), decay: vary(k, 0.05, 0.12) });
        hiss(side, t, { type: 'highpass', freq: 4000, peak: 0.12, decay: 0.006 });
      }
    },
  },
  city: {
    seconds: 12, tail: 1.5,
    render(k, len) {
      wash(k, len, 'brown', 'lowpass', 160, 0.7, 0.45, 0.2);
      wash(k, len, 'pink', 'bandpass', 500, 0.6, 0.12);
      murmur(k, len, 0.08);
      for (let t = vary(k, 0, 1); t < len - 2.5; t += vary(k, 1.5, 3)) carPass(k, t, Math.min(vary(k, 2.5, 4.5), len - t));
    },
  },
  harbour: {
    seconds: 16, tail: 2,
    render(k, len) {
      wash(k, len, 'pink', 'bandpass', 700, 0.5, 0.08, 0.5);
      wash(k, len, 'brown', 'lowpass', 200, 0.7, 0.3, 0.2);
      const sides = spread(k);
      for (let t = 0; t < len - 3; t += vary(k, 2.5, 4)) wave(k, sides, t, vary(k, 1.2, 2), vary(k, 2, 3));
      for (let i = 0; i < len * 0.9; i++) {
        hiss(pick(k, sides), vary(k, 0, len - 0.5), { freq: vary(k, 450, 900), q: 1.5, peak: vary(k, 0.1, 0.25), attack: 0.06, decay: vary(k, 0.15, 0.3), kind: 'pink' });
      }
    },
  },
  neon: {
    seconds: 4, tail: 0.25,
    render(k, len) {
      // HK mains is 50 Hz: tubes and ballasts buzz at twice that.
      chain(osc(k.c, 'sawtooth', 100, 0, len), biquad(k.c, 'lowpass', 900, 0.8), gain(k.c, 0.35), k.out);
      chain(osc(k.c, 'sine', 50, 0, len), gain(k.c, 0.15), k.out);
      for (let i = 0; i < 3; i++) hiss(k, vary(k, 0.2, len - 0.3), { type: 'highpass', freq: 3000, peak: 0.15, decay: 0.01 });
    },
  },
};

/** Render one ambience bed to a seamless stereo loop buffer at unit peak. */
export async function renderBed(id: LayerId, c: BaseAudioContext): Promise<AudioBuffer> {
  const bed = BEDS[id];
  const rate = c.sampleRate;
  const len = bed.seconds + bed.tail;
  const off = new OfflineAudioContext(2, Math.ceil(len * rate), rate);
  bed.render({ c: off, out: off.destination, r: mulberry32(seedFrom(id)) }, len);
  const raw = await off.startRendering();
  const loopLen = Math.round(bed.seconds * rate);
  const out = c.createBuffer(2, loopLen, rate);
  const chans = [0, 1].map((ch) => seamless(raw.getChannelData(ch), loopLen));
  const peak = Math.max(...chans.map((d) => d.reduce((m, x) => Math.max(m, Math.abs(x)), 0)));
  chans.forEach((d, ch) => {
    for (let i = 0; i < d.length; i++) d[i] /= peak || 1;
    out.copyToChannel(d, ch);
  });
  return out;
}
