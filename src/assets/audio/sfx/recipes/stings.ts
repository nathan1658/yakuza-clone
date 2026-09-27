import { mtof } from '../../synth/notes';
import { drive, fmHit, held, hiss, ring, room, sweep, tone } from '../kit';
import type { Kit, RecipeBook } from '../types';

/** Detuned sawtooth chord through a cutoff sweep: brass swells and stabs. */
function brass(k: Kit, t: number, notes: readonly number[], from: number, to: number, attack: number, hold: number, release: number, peak: number): void {
  const f = sweep(k, 'lowpass', t, from, to, attack + hold * 0.5, 0.9);
  for (const m of notes) {
    held(f, t, { freq: mtof(m), type: 'sawtooth', peak, attack, hold, release, detune: -7 });
    held(f, t, { freq: mtof(m), type: 'sawtooth', peak, attack, hold, release, detune: 7 });
  }
}

export const STINGS = {
  chapter_sting: {
    dur: 5.5, level: 0.8,
    render(k) {
      const r = room(k, 3.5, 0.4);
      ring(r, 0, 98, [1, 1.47, 2.09, 2.56, 3.14, 4.03], 0.7, 4.5);
      fmHit(r, 0, { freq: 196, ratio: 1.41, index: 4, indexDecay: 1.2, sustainIndex: 0.3, peak: 0.25, decay: 3.5 });
      hiss(r, 0, { type: 'lowpass', freq: 600, kind: 'brown', peak: 0.5, decay: 0.3 });
      brass(r, 0.15, [33, 40, 45, 52], 250, 1600, 1.1, 1.6, 1.2, 0.09);
    },
  },
  quest_complete: {
    dur: 1.8, level: 0.6,
    render(k) {
      const r = room(k, 1.4, 0.3);
      [72, 74, 76, 79, 81, 84].forEach((m, i) => {
        const t = i * 0.075;
        tone(r, t, { freq: mtof(m), type: 'triangle', peak: 0.45, decay: 0.5 });
        tone(r, t, { freq: mtof(m + 12), peak: 0.12, decay: 0.25 });
      });
      ring(r, 0.45, mtof(84), [1, 2, 3.01], 0.25, 1.1);
    },
  },
  enemy_alert: {
    dur: 1.2, level: 0.6,
    render(k) {
      const r = room(k, 1.2, 0.25);
      brass(drive(r, 1.5), 0, [52, 53, 58], 2500, 700, 0.01, 0.12, 0.35, 0.1);
      tone(r, 0, { freq: 110, to: 55, glide: 0.1, peak: 0.6, decay: 0.3 });
      hiss(r, 0, { type: 'highpass', freq: 5000, peak: 0.5, decay: 0.25 });
    },
  },
  gameover_sting: {
    dur: 4.5, level: 0.8,
    render(k) {
      const r = room(k, 3, 0.4);
      tone(drive(r, 2), 0, { freq: 80, to: 36, glide: 0.4, peak: 0.9, decay: 1.6 });
      hiss(r, 0, { type: 'lowpass', freq: 450, kind: 'brown', peak: 0.5, decay: 0.6 });
      brass(r, 0.05, [33, 36, 40], 900, 200, 0.05, 2, 1.5, 0.12);
      ring(r, 0.05, 73.4, [1, 1.47, 2.09], 0.35, 3.5);
    },
  },
} satisfies RecipeBook;
