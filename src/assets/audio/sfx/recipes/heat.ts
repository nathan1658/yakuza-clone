import { mtof } from '../../synth/notes';
import { drive, filter, held, hiss, ring, room, sweep, tone, vary } from '../kit';
import type { Kit, RecipeBook } from '../types';

/** A taiko hit: skin pitch drop, body noise, room. */
function taiko(k: Kit, t: number, peak: number): void {
  tone(k, t, { freq: 95, to: 52, glide: 0.12, peak, decay: 0.55 });
  tone(k, t, { freq: 190, to: 110, type: 'triangle', peak: peak * 0.25, decay: 0.12 });
  hiss(k, t, { type: 'lowpass', freq: 500, kind: 'brown', peak: peak * 0.6, decay: 0.2 });
}

export const HEAT = {
  heat_ready: {
    dur: 1.4, level: 0.5,
    render(k) {
      const r = room(k, 1.6, 0.35);
      [69, 72, 74, 76, 79, 81].forEach((m, i) => {
        const t = i * 0.055;
        tone(r, t, { freq: mtof(m), type: 'triangle', peak: 0.35, decay: 0.7, detune: -6 });
        tone(r, t, { freq: mtof(m), type: 'triangle', peak: 0.35, decay: 0.7, detune: 6 });
      });
      hiss(r, 0, { type: 'highpass', freq: 5000, to: 9000, peak: 0.2, attack: 0.3, decay: 0.5 });
    },
  },
  heat_action: {
    dur: 1.8, level: 0.95,
    render(k) {
      const r = room(k, 1.8, 0.25);
      hiss(r, 0, { freq: 250, to: 2200, q: 1.4, peak: 0.7, attack: 0.16, decay: 0.03, kind: 'pink' });
      const hit = drive(r, 3);
      tone(hit, 0.18, { freq: 130, to: 40, glide: 0.1, peak: 1, decay: 0.4 });
      hiss(hit, 0.18, { type: 'highpass', freq: 1800, peak: 0.8, decay: 0.05 });
      taiko(r, 0.18, 0.8);
      taiko(r, 0.42, 0.6);
    },
  },
  slowmo_in: {
    dur: 1.1, level: 0.6,
    render(k) {
      const lp = sweep(k, 'lowpass', 0, 3000, 250, 0.9);
      for (const m of [45, 52, 57]) held(lp, 0, { freq: mtof(m), to: mtof(m) / 4, type: 'sawtooth', peak: 0.25, attack: 0.01, hold: 0.8, release: 0.15 });
      hiss(lp, 0, { freq: 1200, to: 150, q: 1, peak: 0.4, decay: 0.9, kind: 'pink' });
      tone(k, 0, { freq: 90, to: 35, peak: 0.6, decay: 0.8 });
    },
  },
  slowmo_out: {
    dur: 0.9, level: 0.55,
    render(k) {
      hiss(k, 0, { type: 'highpass', freq: 1500, to: 6000, peak: 0.7, attack: 0.55, decay: 0.03 });
      for (const m of [57, 64, 69]) tone(k, 0, { freq: mtof(m) / 2, to: mtof(m), type: 'triangle', peak: 0.3, attack: 0.55, decay: 0.05 });
      tone(k, 0.58, { freq: 110, to: 60, peak: 0.6, decay: 0.2 });
    },
  },
  impact_boom: {
    dur: 2, level: 0.95,
    render(k) {
      const r = room(k, 2.2, 0.3);
      tone(drive(r, 4), 0, { freq: 70, to: 24, glide: 0.5, peak: 1, decay: 1.4 });
      hiss(r, 0, { type: 'lowpass', freq: 400, kind: 'brown', peak: 0.8, decay: 0.7 });
      hiss(r, 0, { type: 'highpass', freq: 2500, peak: 0.5, decay: 0.08 });
    },
  },
  qte_prompt: {
    dur: 0.35, level: 0.42,
    render(k) {
      const lp = filter(k, 'lowpass', 5000);
      held(lp, 0, { freq: mtof(81), type: 'square', peak: 0.4, attack: 0.003, hold: 0.06, release: 0.03 });
      held(lp, 0.08, { freq: mtof(88), type: 'square', peak: 0.4, attack: 0.003, hold: 0.12, release: 0.06 });
      hiss(k, 0, { type: 'highpass', freq: 6000, peak: 0.2, decay: 0.04 });
    },
  },
  qte_success: {
    dur: 1.2, level: 0.6,
    render(k) {
      const r = room(k, 1.2, 0.3);
      tone(drive(r, 2), 0, { freq: 140, to: 50, glide: 0.06, peak: 0.8, decay: 0.2 });
      [76, 81, 88].forEach((m, i) => tone(r, 0.02 + i * 0.05, { freq: mtof(m), type: 'triangle', peak: 0.4, decay: 0.6 }));
      ring(r, 0.02, mtof(93), [1, 2.01, 3.03], 0.12, 0.8);
    },
  },
  qte_fail: {
    dur: 0.7, level: 0.55,
    render(k) {
      const lp = filter(k, 'lowpass', 1800);
      held(lp, 0, { freq: 220, to: 110, type: 'sawtooth', peak: 0.5, attack: 0.005, hold: 0.35, release: 0.12, detune: vary(k, -8, 8) });
      held(lp, 0, { freq: 233, to: 116, type: 'sawtooth', peak: 0.4, attack: 0.005, hold: 0.35, release: 0.12 });
      tone(k, 0, { freq: 90, to: 50, peak: 0.5, decay: 0.2 });
    },
  },
} satisfies RecipeBook;
