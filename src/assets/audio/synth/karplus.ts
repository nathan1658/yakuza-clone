import { mulberry32 } from './rng';

export interface PluckOpts {
  /** Loop gain per period (0.98–0.999): higher rings longer. */
  damping?: number;
  /** 0 (dark, thumb) – 1 (bright, pick). */
  bright?: number;
  seed?: number;
}

/**
 * Karplus–Strong plucked string, tuned exactly with a first-order all-pass
 * fractional delay. Pure: returns `dur` seconds of samples.
 */
export function pluck(sampleRate: number, freq: number, dur: number, o: PluckOpts = {}): Float32Array<ArrayBuffer> {
  const damping = o.damping ?? 0.996;
  const bright = o.bright ?? 0.5;
  const period = sampleRate / freq;
  const n = Math.max(2, Math.floor(period - 0.6));
  const frac = period - 0.5 - n;
  const c = (1 - frac) / (1 + frac);
  const line = new Float32Array(n);
  const r = mulberry32(o.seed ?? 1);
  let lp = 0;
  for (let i = 0; i < n; i++) line[i] = lp += (r() * 2 - 1 - lp) * (0.15 + 0.85 * bright);
  const out = new Float32Array(Math.ceil(sampleRate * dur));
  let last = 0, apX = 0, apY = 0, idx = 0;
  for (let i = 0; i < out.length; i++) {
    const cur = line[idx];
    const avg = damping * 0.5 * (cur + last);
    last = cur;
    apY = c * avg + apX - c * apY;
    apX = avg;
    line[idx] = apY;
    out[i] = cur;
    idx = idx + 1 === n ? 0 : idx + 1;
  }
  return out;
}

const cache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** Cached AudioBuffer of a pluck at `freq` (keyed by rounded frequency and options). */
export function pluckBuffer(c: BaseAudioContext, freq: number, dur: number, o: PluckOpts = {}): AudioBuffer {
  let byKey = cache.get(c);
  if (!byKey) cache.set(c, (byKey = new Map()));
  const key = `${freq.toFixed(2)}|${dur}|${o.damping}|${o.bright}|${o.seed}`;
  let buf = byKey.get(key);
  if (!buf) {
    buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    buf.copyToChannel(pluck(c.sampleRate, freq, dur, o), 0);
    byKey.set(key, buf);
  }
  return buf;
}
