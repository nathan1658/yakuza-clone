/** Validates and pre-compiles a TrackDef into flat, allocation-free playback data. Pure. */
import { compilePattern } from './pattern';
import { parseChord, type Chord } from './theory';
import { STEPS_PER_BAR, type CompiledPattern, type Layer, type Section, type TrackDef } from './types';

export interface CompiledLayer {
  readonly layer: Layer;
  readonly pat: CompiledPattern;
}

export interface CompiledSection {
  readonly name: string;
  readonly bars: number;
  readonly layers: readonly CompiledLayer[];
  /** Per chord-list entry, the chords that split that bar evenly. */
  readonly chords: readonly (readonly Chord[])[];
}

export interface CompiledTrack {
  readonly def: TrackDef;
  readonly stepDur: number;
  /** Sections in play order. */
  readonly form: readonly CompiledSection[];
}

const SPLITS = new Set([1, 2, 4]);

function compileChords(where: string, list: readonly string[]): Chord[][] {
  return list.map((entry) => {
    const parts = entry.split(/\s+/);
    if (!SPLITS.has(parts.length)) throw new Error(`${where}: bar '${entry}' must hold 1, 2 or 4 chords`);
    return parts.map((sym) => parseChord(sym) ?? fail(`${where}: bad chord '${sym}'`));
  });
}

function fail(msg: string): never {
  throw new Error(msg);
}

function compileLayer(where: string, def: TrackDef, s: Section, layer: Layer): CompiledLayer {
  const src = def.patterns[layer.pat] ?? fail(`${where}: unknown pattern '${layer.pat}'`);
  const pat = compilePattern(src);
  const isGrid = typeof src !== 'string';
  if (isGrid === !!layer.inst) fail(`${where}/${layer.pat}: note patterns need an inst, drum grids must not have one`);
  if (pat.steps === 0 || (s.bars * STEPS_PER_BAR) % pat.steps) fail(`${where}/${layer.pat}: ${pat.steps} steps do not tile ${s.bars} bars`);
  const relative = pat.at.some((evs) => evs.some((e) => e.pitch.k === 'root' || e.pitch.k === 'tone' || e.pitch.k === 'chord'));
  if (relative && !s.chords?.length) fail(`${where}/${layer.pat}: chord-relative notes in a section without chords`);
  return { layer, pat };
}

const cache = new WeakMap<TrackDef, CompiledTrack>();

export function compileTrack(def: TrackDef): CompiledTrack {
  const hit = cache.get(def);
  if (hit) return hit;
  const sections = new Map<string, CompiledSection>();
  for (const [name, s] of Object.entries(def.sections)) {
    const where = `${def.id}/${name}`;
    const layers = s.layers.map((l) => compileLayer(where, def, s, l));
    sections.set(name, { name, bars: s.bars, layers, chords: compileChords(where, s.chords ?? []) });
  }
  const form = def.form.map((name) => sections.get(name) ?? fail(`${def.id}: form names unknown section '${name}'`));
  if (!form.length) fail(`${def.id}: empty form`);
  const out: CompiledTrack = { def, stepDur: 60 / def.bpm / 4, form };
  cache.set(def, out);
  return out;
}

/** Chord sounding at a bar/step of a compiled section. */
export function chordAt(s: CompiledSection, bar: number, step: number): Chord {
  const entry = s.chords[bar % s.chords.length];
  return entry[Math.floor((step * entry.length) / STEPS_PER_BAR)];
}
