/** Scales and chord symbols. Pure. */
import { pitchClass } from '../synth/notes';

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
} as const satisfies Record<string, readonly number[]>;

/** MIDI note of scale degree `deg` (0-based, may be negative or exceed one octave). */
export function scaleDegree(root: number, scale: readonly number[], deg: number): number {
  const n = scale.length;
  const oct = Math.floor(deg / n);
  return root + oct * 12 + scale[deg - oct * n];
}

/** Snap a MIDI note to the nearest tone of the scale rooted at `root` (ties resolve downward). */
export function snapToScale(midi: number, root: number, scale: readonly number[]): number {
  for (let d = 0; d < 12; d++) {
    for (const cand of [midi - d, midi + d]) {
      if (scale.includes((((cand - root) % 12) + 12) % 12)) return cand;
    }
  }
  return midi;
}

const QUALITIES: Record<string, readonly number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7],
  '6': [0, 4, 7, 9],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
};

export interface Chord {
  /** Chord tones, ascending, root voiced in C3..B3 (MIDI 48–59). */
  readonly tones: readonly number[];
  /** Bass note (slash chords), also in 48–59. */
  readonly bass: number;
}

const CHORD_RE = /^([A-G][#b]?)([a-z0-9]*)(?:\/([A-G][#b]?))?$/;

/** Parse 'Am', 'Fmaj7', 'G/B', 'E5'. Returns null for unknown symbols. */
export function parseChord(symbol: string): Chord | null {
  const m = CHORD_RE.exec(symbol);
  const intervals = m ? QUALITIES[m[2]] : undefined;
  if (!m || !intervals) return null;
  const root = 48 + pitchClass(m[1]);
  const bass = m[3] ? 48 + pitchClass(m[3]) : root;
  if (Number.isNaN(root) || Number.isNaN(bass)) return null;
  return { tones: intervals.map((i) => root + i), bass };
}
