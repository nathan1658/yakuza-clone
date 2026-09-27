import { drive, filter, held, hiss, ring, room, scatter, tone, tremolo, vary, voice } from '../kit';
import type { Kit, RecipeBook } from '../types';
import type { FORMANTS } from '../../synth/nodes';

type Vowel = keyof typeof FORMANTS;
const VOWELS: readonly Vowel[] = ['a', 'o', 'e', 'u'];

/** A crowd of `n` formant voices, voiced at random pitches with some breathy ones mixed in. */
function crowd(k: Kit, n: number, spread: number, lo: number, hi: number, attack: number, decay: number, peak: number): void {
  for (let i = 0; i < n; i++) {
    const f0 = i % 3 === 2 ? undefined : vary(k, lo, hi);
    const vowel = VOWELS[Math.floor(k.r() * VOWELS.length)];
    voice(k, vary(k, 0, spread), { vowel, f0, to: f0 && f0 * vary(k, 1.05, 1.3), peak, attack: attack * vary(k, 0.7, 1.3), decay: decay * vary(k, 0.7, 1.3) });
  }
}

/** Bell ringer burst of an old payphone: two tones chopped by the hammer. */
function ringBurst(k: Kit, t: number): void {
  const bell = tremolo(filter(k, 'lowpass', 3500), t, 0.42, 22, 1, 'square');
  held(bell, t, { freq: 1350, type: 'triangle', peak: 0.5, attack: 0.005, hold: 0.38, release: 0.04 });
  held(bell, t, { freq: 1720, type: 'triangle', peak: 0.35, attack: 0.005, hold: 0.38, release: 0.04 });
}

export const CITY = {
  payphone_ring: {
    dur: 1.2, level: 0.5,
    render(k) {
      ringBurst(k, 0);
      ringBurst(k, 0.6);
    },
  },
  payphone_pickup: {
    dur: 0.5, level: 0.5,
    render(k) {
      hiss(k, 0, { freq: 2200, q: 3, peak: 0.9, decay: 0.02 });
      tone(k, 0, { freq: 420, to: 300, type: 'triangle', peak: 0.6, decay: 0.05 });
      hiss(k, 0.09, { freq: 3500, q: 5, peak: 0.5, decay: 0.012 });
      hiss(k, 0.12, { type: 'bandpass', freq: 1800, q: 0.7, peak: 0.08, attack: 0.02, decay: 0.3 });
    },
  },
  pager_beep: {
    dur: 1.1, level: 0.28,
    render(k) {
      const lp = filter(k, 'lowpass', 5000);
      for (const burst of [0, 0.55]) {
        for (let i = 0; i < 3; i++) held(lp, burst + i * 0.12, { freq: 2400, type: 'square', peak: 0.4, attack: 0.002, hold: 0.07, release: 0.01 });
      }
    },
  },
  tram_bell: {
    dur: 2, level: 0.6,
    render(k) {
      const r = room(k, 1.4, 0.2);
      for (const at of [0, 0.3]) {
        hiss(r, at, { freq: 3000, q: 4, peak: 0.4, decay: 0.01 });
        ring(r, at, vary(k, 1030, 1070), [1, 2.02, 2.93, 4.16], 0.6, 1.3);
      }
    },
  },
  car_horn: {
    dur: 0.9, level: 0.6, variants: 2,
    render(k) {
      const horn = drive(filter(k, 'bandpass', 1100, 0.8), 2);
      const blasts = k.r() < 0.5 ? [[0, 0.5]] : [[0, 0.14], [0.22, 0.3]];
      for (const [at, hold] of blasts) {
        held(horn, at, { freq: 415, type: 'sawtooth', peak: 0.4, attack: 0.01, hold, release: 0.04 });
        held(horn, at, { freq: 523, type: 'sawtooth', peak: 0.35, attack: 0.01, hold, release: 0.04 });
      }
    },
  },
  crowd_gasp: {
    dur: 1.1, level: 0.5,
    render(k) { crowd(room(k, 1.2, 0.25), 9, 0.12, 170, 300, 0.06, 0.45, 0.35); },
  },
  crowd_cheer: {
    dur: 2.2, level: 0.55,
    render(k) {
      const r = room(k, 1.5, 0.3);
      crowd(r, 14, 0.25, 150, 340, 0.12, 1.3, 0.3);
      scatter(r, 0.05, 1.5, 24, { type: 'highpass', freq: 1600, peak: 0.3, decay: 0.02 });
    },
  },
  boss_roar: {
    dur: 2.2, level: 0.9,
    render(k) {
      const r = room(k, 1.6, 0.25);
      const growl = drive(tremolo(r, 0, 2, 31, 0.6), 4);
      voice(growl, 0, { vowel: 'a', f0: 78, to: 58, peak: 1, attack: 0.15, decay: 1.6, q: 5 });
      voice(growl, 0, { vowel: 'o', f0: 39, to: 30, peak: 0.6, attack: 0.2, decay: 1.5, q: 4 });
      voice(r, 0.02, { vowel: 'a', peak: 0.5, attack: 0.1, decay: 1.4, q: 3 });
      tone(r, 0, { freq: 55, to: 38, peak: 0.4, attack: 0.1, decay: 1.4 });
    },
  },
  rope_creak: {
    dur: 1.3, level: 0.4,
    render(k) {
      const wood = tremolo(filter(k, 'bandpass', vary(k, 650, 900), 5), 0, 1.2, vary(k, 11, 17), 0.9, 'sawtooth');
      held(wood, 0, { freq: vary(k, 70, 90), to: vary(k, 110, 150), type: 'sawtooth', peak: 0.6, attack: 0.25, hold: 0.7, release: 0.25 });
    },
  },
  ship_horn: {
    dur: 4.5, level: 0.7,
    render(k) {
      const r = room(k, 3, 0.35);
      const horn = filter(r, 'lowpass', 650, 1.2);
      held(horn, 0, { freq: 98, type: 'sawtooth', peak: 0.5, attack: 0.3, hold: 2.4, release: 0.9 });
      held(horn, 0, { freq: 123.5, type: 'sawtooth', peak: 0.4, attack: 0.3, hold: 2.4, release: 0.9, detune: 6 });
    },
  },
} satisfies RecipeBook;
