/** Pitch and level conversions. Pure. */

export function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function ftom(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function ratio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(gain);
}

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^([A-G])([#b]?)(-?\d)?$/;

function semis(m: RegExpExecArray): number {
  return PITCH_CLASS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** Pitch class of a note letter with optional accidental ('C#' → 1, 'Bb' → 10), NaN if invalid. */
export function pitchClass(name: string): number {
  const m = NOTE_RE.exec(name);
  return m && m[3] === undefined ? (semis(m) + 12) % 12 : NaN;
}

/** Scientific pitch name to MIDI: 'C4' → 60, 'F#3' → 54, 'Bb2' → 46, 'Cb4' → 59. NaN if invalid. */
export function noteToMidi(name: string): number {
  const m = NOTE_RE.exec(name);
  return m && m[3] !== undefined ? semis(m) + (Number(m[3]) + 1) * 12 : NaN;
}
