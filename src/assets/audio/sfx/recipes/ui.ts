import { mtof } from '../../synth/notes';
import { filter, held, hiss, ring, scatter, tone, vary, voice } from '../kit';
import type { Kit, RecipeBook } from '../types';

/** Short retro square blip through a soft lowpass so it never gets shrill. */
function blip(k: Kit, t: number, midi: number, peak: number, len = 0.04): void {
  held(filter(k, 'lowpass', 4200), t, { freq: mtof(midi), type: 'square', peak, attack: 0.002, hold: len, release: 0.03 });
}

/** DTMF-style dual tone, the way a 90s phone-card booth confirms each digit. */
function dtmf(k: Kit, t: number, lo: number, hi: number, len: number): void {
  held(k, t, { freq: lo, peak: 0.4, attack: 0.004, hold: len, release: 0.01 });
  held(k, t, { freq: hi, peak: 0.4, attack: 0.004, hold: len, release: 0.01 });
}

export const UI = {
  ui_move: {
    dur: 0.1, level: 0.25,
    render(k) { blip(k, 0, 84, 0.6, 0.015); },
  },
  ui_confirm: {
    dur: 0.25, level: 0.28,
    render(k) {
      blip(k, 0, 84, 0.5);
      blip(k, 0.06, 91, 0.5, 0.08);
    },
  },
  ui_cancel: {
    dur: 0.25, level: 0.3,
    render(k) {
      blip(k, 0, 79, 0.5);
      blip(k, 0.06, 72, 0.5, 0.08);
    },
  },
  ui_open: {
    dur: 0.3, level: 0.28,
    render(k) {
      held(filter(k, 'lowpass', 4000), 0, { freq: mtof(72), to: mtof(84), type: 'square', peak: 0.35, attack: 0.005, hold: 0.1, release: 0.05 });
      hiss(k, 0, { freq: 1500, to: 5000, q: 1, peak: 0.25, attack: 0.05, decay: 0.08 });
    },
  },
  ui_close: {
    dur: 0.3, level: 0.3,
    render(k) {
      held(filter(k, 'lowpass', 4000), 0, { freq: mtof(84), to: mtof(72), type: 'square', peak: 0.35, attack: 0.005, hold: 0.1, release: 0.05 });
      hiss(k, 0, { freq: 5000, to: 1500, q: 1, peak: 0.25, attack: 0.02, decay: 0.1 });
    },
  },
  dialogue_blip: {
    dur: 0.08, level: 0.12, variants: 3,
    render(k) { tone(k, 0, { freq: vary(k, 620, 820), type: 'triangle', peak: 1, decay: 0.035 }); },
  },
  money: {
    dur: 1.2, level: 0.45,
    render(k) {
      hiss(k, 0, { freq: 3000, q: 3, peak: 0.6, decay: 0.015 });
      scatter(k, 0.02, 0.12, 5, { freq: 4500, q: 10, peak: 0.35, decay: 0.02 });
      hiss(k, 0.1, { freq: 1200, q: 2, peak: 0.5, decay: 0.05 });
      ring(k, 0.12, 2093, [1, 2.76, 5.4], 0.6, 0.9);
    },
  },
  eat: {
    dur: 0.8, level: 0.45, variants: 2,
    render(k) {
      for (const at of [0, 0.22, 0.44]) {
        scatter(k, at, 0.08, 8, { freq: vary(k, 1800, 2600), q: 3, peak: 0.8, decay: 0.02 });
        tone(k, at, { freq: 140, to: 90, peak: 0.3, decay: 0.05 });
      }
    },
  },
  drink: {
    dur: 1, level: 0.45,
    render(k) {
      hiss(k, 0, { freq: 800, to: 3000, q: 3, peak: 0.6, attack: 0.15, decay: 0.12 });
      for (const at of [0.35, 0.62]) {
        voice(k, at, { vowel: 'o', f0: 150, to: 240, peak: 0.25, attack: 0.01, decay: 0.08, q: 10 });
        tone(k, at, { freq: 180, to: 420, peak: 0.6, decay: 0.08 });
      }
    },
  },
  save: {
    dur: 1, level: 0.4,
    render(k) {
      dtmf(k, 0, 697, 1209, 0.07);
      dtmf(k, 0.12, 770, 1336, 0.07);
      dtmf(k, 0.24, 852, 1477, 0.07);
      held(k, 0.42, { freq: 1000, peak: 0.5, attack: 0.005, hold: 0.35, release: 0.03 });
    },
  },
} satisfies RecipeBook;
