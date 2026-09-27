import { drive, hiss, room, scatter, tone, vary, voice } from '../kit';
import type { RecipeBook } from '../types';

/** Fists, feet and bodies. Every hit lands at t = 0 so it syncs with the contact frame. */
export const COMBAT = {
  punch_light: {
    dur: 0.35, level: 0.75, variants: 4,
    render(k) {
      const d = drive(k, 2);
      tone(d, 0, { freq: vary(k, 150, 195), to: 58, glide: 0.06, peak: 1, decay: 0.12 });
      tone(d, 0, { freq: 95, to: 50, type: 'triangle', peak: 0.4, decay: 0.08 });
      hiss(k, 0, { freq: vary(k, 1800, 2700), q: 1.2, peak: 0.8, decay: 0.035 });
      hiss(k, 0.002, { type: 'highpass', freq: 3500, peak: 0.3, attack: 0.003, decay: 0.06 });
    },
  },
  punch_heavy: {
    dur: 0.7, level: 0.95, variants: 3,
    render(k) {
      const r = room(k, 0.8, 0.12);
      tone(drive(r, 3), 0, { freq: vary(k, 110, 135), to: 42, glide: 0.1, peak: 1, decay: 0.3 });
      tone(r, 0, { freq: 55, to: 34, peak: 0.6, decay: 0.35 });
      hiss(r, 0, { type: 'highpass', freq: 1500, peak: 0.9, decay: 0.05 });
      hiss(r, 0, { freq: vary(k, 2600, 3400), q: 2, peak: 0.5, decay: 0.02 });
      hiss(r, 0.003, { freq: 1300, q: 0.8, peak: 0.3, attack: 0.004, decay: 0.09, kind: 'pink' });
    },
  },
  kick: {
    dur: 0.55, level: 0.85, variants: 3,
    render(k) {
      tone(drive(k, 2.5), 0, { freq: vary(k, 100, 120), to: 44, glide: 0.08, peak: 1, decay: 0.22 });
      hiss(k, 0, { type: 'lowpass', freq: 650, peak: 0.55, decay: 0.08 });
      hiss(k, 0, { freq: 2200, q: 1.4, peak: 0.35, decay: 0.03 });
      hiss(k, 0.012, { freq: 1800, to: 380, q: 1.3, peak: 0.28, attack: 0.02, decay: 0.2, kind: 'pink' });
    },
  },
  whoosh: {
    dur: 0.35, level: 0.45, variants: 3,
    render(k) {
      hiss(k, 0, { freq: vary(k, 300, 450), to: vary(k, 1900, 2700), q: 1.8, peak: 1, attack: 0.11, decay: 0.14 });
      hiss(k, 0.04, { type: 'highpass', freq: 4500, peak: 0.18, attack: 0.07, decay: 0.08 });
    },
  },
  whoosh_heavy: {
    dur: 0.6, level: 0.6, variants: 2,
    render(k) {
      hiss(k, 0, { freq: vary(k, 170, 220), to: vary(k, 1100, 1400), q: 1.2, peak: 1, attack: 0.18, decay: 0.25, kind: 'pink' });
      tone(k, 0, { freq: 72, to: 48, type: 'triangle', peak: 0.35, attack: 0.15, decay: 0.2 });
      hiss(k, 0.1, { type: 'highpass', freq: 3500, peak: 0.15, attack: 0.08, decay: 0.12 });
    },
  },
  block: {
    dur: 0.3, level: 0.6, variants: 3,
    render(k) {
      tone(k, 0, { freq: vary(k, 210, 250), to: 150, type: 'triangle', peak: 1, decay: 0.07 });
      hiss(k, 0, { type: 'lowpass', freq: 900, peak: 0.6, decay: 0.04 });
      hiss(k, 0, { freq: 700, q: 3, peak: 0.4, decay: 0.05 });
      hiss(k, 0.004, { freq: 1600, q: 0.8, peak: 0.2, attack: 0.003, decay: 0.05, kind: 'pink' });
    },
  },
  dodge: {
    dur: 0.4, level: 0.4, variants: 2,
    render(k) {
      hiss(k, 0, { freq: 900, to: 3000, q: 0.8, peak: 0.8, attack: 0.06, decay: 0.12, kind: 'pink' });
      hiss(k, 0.13, { freq: vary(k, 2200, 2800), q: 0.8, peak: 0.5, attack: 0.005, decay: 0.07 });
      scatter(k, 0.13, 0.06, 5, { type: 'highpass', freq: 4000, peak: 0.25, decay: 0.01 });
    },
  },
  body_fall: {
    dur: 0.9, level: 0.85, variants: 3,
    render(k) {
      const r = room(k, 0.9, 0.1);
      tone(r, 0, { freq: vary(k, 75, 90), to: 38, glide: 0.12, peak: 1, decay: 0.35 });
      hiss(r, 0, { type: 'lowpass', freq: 420, kind: 'brown', peak: 0.9, decay: 0.25 });
      hiss(r, 0, { freq: 1500, q: 0.9, peak: 0.25, decay: 0.12, kind: 'pink' });
      tone(r, 0.11, { freq: 70, to: 40, peak: 0.4, decay: 0.15 });
      scatter(r, 0.02, 0.35, 10, { freq: 2000, q: 1.5, peak: 0.25, decay: 0.03 });
    },
  },
  grab: {
    dur: 0.3, level: 0.45, variants: 2,
    render(k) {
      hiss(k, 0, { freq: 1200, to: 2400, q: 0.9, peak: 1, attack: 0.02, decay: 0.1, kind: 'pink' });
      hiss(k, 0.01, { freq: 1800, q: 1.5, peak: 0.5, decay: 0.02 });
      tone(k, 0.01, { freq: 180, to: 120, peak: 0.3, decay: 0.04 });
    },
  },
  throw: {
    dur: 0.6, level: 0.55, variants: 2,
    render(k) {
      hiss(k, 0, { freq: 250, to: 1400, q: 1.4, peak: 1, attack: 0.2, decay: 0.25, kind: 'pink' });
      voice(k, 0.02, { vowel: 'u', f0: vary(k, 105, 125), to: 90, peak: 0.45, attack: 0.03, decay: 0.16 });
      hiss(k, 0.05, { freq: 2000, q: 0.8, peak: 0.25, attack: 0.02, decay: 0.08 });
    },
  },
  ko: {
    dur: 2.4, level: 0.95,
    render(k) {
      const r = room(k, 2.4, 0.35);
      tone(drive(r, 2), 0, { freq: 90, to: 28, glide: 0.4, peak: 1, decay: 1.2 });
      hiss(r, 0, { type: 'lowpass', freq: 300, kind: 'brown', peak: 0.7, decay: 0.6 });
      hiss(r, 0, { type: 'highpass', freq: 2000, peak: 0.6, decay: 0.04 });
      hiss(r, 0.005, { freq: 900, q: 0.7, peak: 0.3, decay: 0.15, kind: 'pink' });
    },
  },
  stomp: {
    dur: 0.6, level: 0.9, variants: 2,
    render(k) {
      tone(drive(k, 3), 0, { freq: vary(k, 65, 80), to: 35, glide: 0.08, peak: 1, decay: 0.25 });
      hiss(k, 0, { type: 'lowpass', freq: 800, kind: 'brown', peak: 0.8, decay: 0.12 });
      hiss(k, 0, { freq: 1200, q: 2, peak: 0.5, decay: 0.05 });
      scatter(k, 0.01, 0.2, 7, { freq: 2400, q: 1.5, peak: 0.25, decay: 0.02 });
    },
  },
  knife_slash: {
    dur: 0.5, level: 0.55, variants: 2,
    render(k) {
      hiss(k, 0, { freq: 3000, to: vary(k, 6500, 8000), q: 4, peak: 0.8, attack: 0.05, decay: 0.12 });
      hiss(k, 0, { type: 'highpass', freq: 6000, peak: 0.25, attack: 0.04, decay: 0.08 });
      const base = vary(k, 2400, 2800);
      for (const ratio of [1, 1.51, 2.37]) tone(k, 0.045, { freq: base * ratio, peak: 0.12, attack: 0.004, decay: 0.3 / ratio });
    },
  },
} satisfies RecipeBook;
