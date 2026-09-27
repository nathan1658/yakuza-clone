import type { MusicId } from '../../../core/types';

export const STEPS_PER_BAR = 16;

export type InstId =
  | 'kick' | 'snare' | 'hat' | 'ohat' | 'clap' | 'tomHi' | 'tomLo' | 'rim' | 'crash'
  | 'bass' | 'sub' | 'ep' | 'piano' | 'bell'
  | 'pad' | 'strings' | 'choir' | 'glass' | 'brass' | 'pulse' | 'vinyl'
  | 'erhu' | 'erhuHot' | 'dizi' | 'sax' | 'lead'
  | 'guitar' | 'power'
  | 'taiko' | 'gong' | 'luo' | 'block';

/** One scheduled note, handed to an instrument. Reused scratch object: never retain it. */
export interface Note {
  t: number;
  midi: number;
  /** Gate length in seconds. */
  dur: number;
  vel: number;
  /** Previous MIDI note of the same part when this note slides (portamento), else NaN. */
  from: number;
}

/** Where an instrument writes: dry signal and reverb send, both inside the track's fader. */
export interface Out {
  readonly c: BaseAudioContext;
  readonly dry: AudioNode;
  readonly wet: AudioNode;
}

export type Instrument = (o: Out, n: Note) => void;

export type Pitch =
  | { readonly k: 'abs'; readonly m: number }
  | { readonly k: 'root'; readonly o: number }
  | { readonly k: 'tone'; readonly i: number; readonly o: number }
  | { readonly k: 'chord'; readonly o: number }
  | { readonly k: 'hit' };

export interface PatEvent {
  readonly step: number;
  /** Length in steps (16ths). */
  readonly len: number;
  readonly vel: number;
  readonly pitch: Pitch;
  readonly slide: boolean;
  /** Drum-grid events carry their own instrument; note events use the layer's. */
  readonly inst: InstId | null;
}

export interface CompiledPattern {
  readonly steps: number;
  /** Events starting at each step. */
  readonly at: readonly (readonly PatEvent[])[];
}

/**
 * Pattern source. A string is a note pattern (see pattern.ts); an object is a
 * drum grid: one string per instrument, one character per 16th step.
 */
export type PatternSrc = string | Partial<Record<InstId, string>>;

export interface Layer {
  /** Instrument for note patterns; omitted for drum grids. */
  readonly inst?: InstId;
  readonly pat: string;
  readonly vol?: number;
  /** Semitone offset (±12 per octave). */
  readonly oct?: number;
  readonly pan?: number;
  /** Only plays when the track level (boss phase) is within [min, max]. */
  readonly min?: number;
  readonly max?: number;
}

export interface Section {
  readonly bars: number;
  /** One entry per bar, cycling. An entry with spaces splits the bar evenly: 'C5 D5'. */
  readonly chords?: readonly string[];
  readonly layers: readonly Layer[];
}

export type TrackId = Exclude<MusicId, 'none'>;

export interface TrackDef {
  readonly id: TrackId;
  readonly bpm: number;
  /** Track output level before the music bus. */
  readonly gain: number;
  /** Delay applied to off-beat 16ths, as a fraction of a step (0–0.5). */
  readonly swing?: number;
  readonly loop: boolean;
  /** Reverb length in seconds. */
  readonly space?: number;
  readonly patterns: Readonly<Record<string, PatternSrc>>;
  readonly sections: Readonly<Record<string, Section>>;
  readonly form: readonly string[];
  /** Index in `form` to jump back to when looping (default 0). */
  readonly loopFrom?: number;
  /** Semitone transposition per level (index = level); boss phase 3 modulates up. */
  readonly levelTranspose?: readonly number[];
}
