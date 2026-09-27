/**
 * Pattern notation.
 *
 * Note patterns: whitespace-separated tokens `[~]pitch[:len][!|?]`; `|` is ignored.
 *   pitch  `A4`, `C#5`, `Bb3`   absolute note
 *          `r`                  chord bass (root, or slash bass)
 *          `c1`…`c5`            chord tone (1-based, wraps upward past the top)
 *          `C`                  every chord tone at once
 *          `.`                  rest
 *          followed by `'` (octave up) or `,` (octave down), repeatable, for r/c/C
 *   len    length in 16th steps (default 1)
 *   `!` accent, `?` ghost;  leading `~` slides from the previous note (portamento)
 *
 * Drum grids: one char per 16th: `X` accent, `x` hit, `o` ghost, `.`/`-` rest; spaces and `|` ignored.
 */
import { noteToMidi } from '../synth/notes';
import type { CompiledPattern, InstId, PatEvent, PatternSrc, Pitch } from './types';

const TOKEN = /^(~?)(\.|r|C|c[1-5]|[A-G][#b]?-?\d)([',]*)(?::(\d+))?([!?]?)$/;
const VEL: Record<string, number> = { '': 0.8, '!': 1, '?': 0.5 };
const HIT: Record<string, number> = { X: 1, x: 0.8, o: 0.45 };
const EMPTY: readonly PatEvent[] = Object.freeze([]);

function octaves(marks: string): number {
  let o = 0;
  for (const ch of marks) o += ch === "'" ? 1 : -1;
  return o;
}

function parsePitch(p: string, o: number): Pitch {
  if (p === 'r') return { k: 'root', o };
  if (p === 'C') return { k: 'chord', o };
  if (p[0] === 'c') return { k: 'tone', i: Number(p.slice(1)) - 1, o };
  return { k: 'abs', m: noteToMidi(p) };
}

export function parseNotes(src: string): { steps: number; events: PatEvent[] } {
  const events: PatEvent[] = [];
  let step = 0;
  for (const tok of src.split(/[\s|]+/).filter(Boolean)) {
    const m = TOKEN.exec(tok);
    if (!m) throw new Error(`bad note token '${tok}'`);
    const len = m[4] ? Number(m[4]) : 1;
    if (m[2] !== '.') {
      const pitch = parsePitch(m[2], octaves(m[3]));
      events.push({ step, len, vel: VEL[m[5]], pitch, slide: m[1] === '~', inst: null });
    }
    step += len;
  }
  return { steps: step, events };
}

export function parseGrid(grid: Partial<Record<InstId, string>>): { steps: number; events: PatEvent[] } {
  const events: PatEvent[] = [];
  let steps = 0;
  for (const [inst, row] of Object.entries(grid) as [InstId, string][]) {
    const cells = row.replace(/[\s|]/g, '');
    for (let i = 0; i < cells.length; i++) {
      const vel = HIT[cells[i]];
      if (vel) events.push({ step: i, len: 1, vel, pitch: { k: 'hit' }, slide: false, inst });
      else if (cells[i] !== '.' && cells[i] !== '-') throw new Error(`bad grid cell '${cells[i]}' for ${inst}`);
    }
    if (steps && cells.length !== steps) throw new Error(`grid rows differ in length (${inst})`);
    steps = cells.length;
  }
  return { steps, events };
}

export function compilePattern(src: PatternSrc): CompiledPattern {
  const { steps, events } = typeof src === 'string' ? parseNotes(src) : parseGrid(src);
  const at: PatEvent[][] = [];
  for (let i = 0; i < steps; i++) at.push([]);
  for (const e of events) at[e.step].push(e);
  return { steps, at: at.map((list) => (list.length ? list : EMPTY)) };
}
