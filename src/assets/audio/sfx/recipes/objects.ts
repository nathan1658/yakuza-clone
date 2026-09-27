import { drive, fmHit, hiss, ring, room, scatter, tone, vary } from '../kit';
import type { Kit, RecipeBook } from '../types';

/** Bright shatter: a sharp crack, a noisy body, then bandpassed shards raining down. */
function shatter(k: Kit, pitch: number): void {
  hiss(k, 0, { type: 'highpass', freq: 2500 * pitch, peak: 1, decay: 0.05 });
  hiss(k, 0, { freq: 4500 * pitch, q: 1.5, peak: 0.7, decay: 0.25 });
  scatter(k, 0.01, 0.5, 22, { freq: 5200 * pitch, q: 14, peak: 0.55, decay: 0.05 });
  ring(k, 0.004, vary(k, 2900, 3500) * pitch, [1, 1.73, 2.61], 0.12, 0.25);
}

/** Metal furniture: FM clang for the tube, plus a loose rattle. */
function clang(k: Kit, base: number, peak: number, decay: number): void {
  fmHit(k, 0, { freq: base, ratio: 1.41, index: 7, indexDecay: 0.08, sustainIndex: 0.25, peak, decay });
  fmHit(k, 0, { freq: base * 2.76, ratio: 1.13, index: 3, indexDecay: 0.05, peak: peak * 0.35, decay: decay * 0.5 });
}

export const OBJECTS = {
  chair_hit: {
    dur: 0.9, level: 0.85, variants: 3,
    render(k) {
      const d = drive(k, 2);
      tone(d, 0, { freq: vary(k, 130, 160), to: 55, glide: 0.07, peak: 0.9, decay: 0.16 });
      clang(k, vary(k, 330, 420), 0.7, 0.6);
      scatter(k, 0.04, 0.3, 9, { freq: 3200, q: 6, peak: 0.3, decay: 0.03 });
    },
  },
  chair_break: {
    dur: 1.3, level: 0.9,
    render(k) {
      const r = room(k, 0.9, 0.12);
      tone(drive(r, 2.5), 0, { freq: 140, to: 50, glide: 0.08, peak: 1, decay: 0.2 });
      clang(r, vary(k, 300, 360), 0.6, 0.5);
      clang(r, vary(k, 480, 560), 0.4, 0.4);
      for (const at of [0.12, 0.26, 0.45]) {
        fmHit(r, at + vary(k, 0, 0.04), { freq: vary(k, 600, 1100), ratio: 1.53, index: 5, indexDecay: 0.04, peak: 0.3, decay: 0.2 });
      }
      scatter(r, 0.05, 0.9, 16, { freq: 2800, q: 5, peak: 0.35, decay: 0.035 });
    },
  },
  cone_hit: {
    dur: 0.5, level: 0.6, variants: 2,
    render(k) {
      const f = vary(k, 260, 320);
      tone(k, 0, { freq: f, to: f * 0.8, type: 'triangle', peak: 1, decay: 0.16 });
      tone(k, 0, { freq: f * 1.52, type: 'triangle', peak: 0.4, decay: 0.09 });
      hiss(k, 0, { freq: 900, q: 4, peak: 0.45, decay: 0.05 });
      tone(k, 0.14, { freq: f * 0.9, type: 'triangle', peak: 0.25, decay: 0.08 });
    },
  },
  bottle_smash: {
    dur: 0.9, level: 0.8, variants: 2,
    render(k) {
      tone(k, 0, { freq: vary(k, 900, 1100), to: 400, peak: 0.4, decay: 0.03 });
      shatter(k, 1);
    },
  },
  glass_break: {
    dur: 1.2, level: 0.8, variants: 2,
    render(k) {
      hiss(k, 0, { type: 'lowpass', freq: 1500, peak: 0.5, decay: 0.08 });
      shatter(k, 0.85);
      scatter(k, 0.25, 0.7, 12, { freq: 6000, q: 18, peak: 0.25, decay: 0.06 });
    },
  },
  wood_break: {
    dur: 0.9, level: 0.85, variants: 2,
    render(k) {
      const d = drive(k, 3);
      tone(d, 0, { freq: vary(k, 180, 220), to: 70, glide: 0.05, peak: 0.8, decay: 0.12 });
      hiss(d, 0, { freq: 850, q: 2.5, peak: 0.9, decay: 0.1 });
      for (let i = 0; i < 7; i++) {
        hiss(d, 0.015 + i * vary(k, 0.012, 0.03), { freq: vary(k, 500, 1400), q: 5, peak: 0.5 - i * 0.05, decay: 0.03 });
      }
      scatter(k, 0.05, 0.5, 10, { freq: 1600, q: 4, peak: 0.3, decay: 0.03 });
    },
  },
  metal_clang: {
    dur: 1.6, level: 0.8, variants: 3,
    render(k) {
      const f = vary(k, 380, 520);
      fmHit(k, 0, { freq: f, ratio: 1.414, index: 9, indexDecay: 0.1, sustainIndex: 0.2, peak: 0.8, decay: 1.3 });
      fmHit(k, 0, { freq: f * 2.31, ratio: 1.73, index: 4, indexDecay: 0.06, peak: 0.35, decay: 0.7 });
      hiss(k, 0, { type: 'highpass', freq: 3000, peak: 0.5, decay: 0.03 });
    },
  },
  pickup: {
    dur: 0.3, level: 0.4,
    render(k) {
      hiss(k, 0, { freq: 1400, to: 2600, q: 1, peak: 0.6, attack: 0.02, decay: 0.08, kind: 'pink' });
      tone(k, 0.03, { freq: 320, to: 260, type: 'triangle', peak: 0.6, decay: 0.06 });
      tone(k, 0.03, { freq: 1200, peak: 0.15, decay: 0.08 });
    },
  },
  drop: {
    dur: 0.5, level: 0.5, variants: 2,
    render(k) {
      tone(k, 0, { freq: vary(k, 170, 210), to: 90, type: 'triangle', peak: 1, decay: 0.1 });
      hiss(k, 0, { freq: 1200, q: 2, peak: 0.5, decay: 0.04 });
      tone(k, 0.11, { freq: 160, to: 100, type: 'triangle', peak: 0.3, decay: 0.06 });
      scatter(k, 0.12, 0.15, 3, { freq: 2200, q: 3, peak: 0.2, decay: 0.02 });
    },
  },
  table_flip: {
    dur: 1.5, level: 0.9,
    render(k) {
      const r = room(k, 1.1, 0.15);
      hiss(r, 0, { freq: 300, to: 900, q: 1.2, peak: 0.6, attack: 0.18, decay: 0.12, kind: 'pink' });
      tone(r, 0.02, { freq: 120, to: 160, type: 'triangle', peak: 0.3, attack: 0.1, decay: 0.12 });
      const crash = drive(r, 3);
      tone(crash, 0.3, { freq: 110, to: 42, glide: 0.1, peak: 1, decay: 0.35 });
      hiss(crash, 0.3, { freq: 700, q: 1.8, peak: 0.8, decay: 0.15 });
      scatter(r, 0.32, 0.6, 14, { freq: 1500, q: 4, peak: 0.45, decay: 0.04 });
      scatter(r, 0.34, 0.5, 8, { freq: 5000, q: 12, peak: 0.3, decay: 0.05 });
    },
  },
  footstep: {
    dur: 0.2, level: 0.3, variants: 6,
    render(k) {
      tone(k, 0, { freq: vary(k, 85, 110), to: 55, peak: 1, decay: 0.05 });
      hiss(k, 0, { freq: vary(k, 900, 1500), q: 1.3, peak: 0.5, decay: 0.03, kind: 'pink' });
      hiss(k, 0.035, { type: 'highpass', freq: 3000, peak: 0.25, attack: 0.01, decay: 0.04 });
    },
  },
  footstep_wet: {
    dur: 0.35, level: 0.32, variants: 4,
    render(k) {
      tone(k, 0, { freq: vary(k, 80, 100), to: 55, peak: 0.8, decay: 0.05 });
      hiss(k, 0, { freq: vary(k, 1500, 2200), q: 1.5, peak: 0.6, decay: 0.06 });
      scatter(k, 0.01, 0.16, 7, { freq: 3200, q: 8, peak: 0.55, decay: 0.03 });
      hiss(k, 0.02, { freq: 700, to: 2400, q: 5, peak: 0.35, attack: 0.01, decay: 0.07 });
    },
  },
} satisfies RecipeBook;
