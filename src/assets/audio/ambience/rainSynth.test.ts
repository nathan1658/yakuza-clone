import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../synth/rng';
import { bubble, drips, rain, type Drop, type Stereo } from './rainSynth';

const RATE = 48000;

/** In-place iterative radix-2 FFT; the length must be a power of two. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len / 2, a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = i; k < i + half; k++) {
        const xr = re[k + half] * cr - im[k + half] * ci;
        const xi = re[k + half] * ci + im[k + half] * cr;
        re[k + half] = re[k] - xr;
        im[k + half] = im[k] - xi;
        re[k] += xr;
        im[k] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

const mono = ([l, r]: Stereo): Float64Array => Float64Array.from(l, (x, i) => (x + r[i]) / 2);

/**
 * Spectral shape over Hann-windowed 4096-sample frames: mean per-frame flatness
 * from 30 Hz to 16 kHz (geometric over arithmetic mean power; white noise ≈ 0.56)
 * and the share of power in 0.5–6 kHz and above 6 kHz.
 */
function spectrum(x: Float64Array): { flatness: number; mid: number; high: number } {
  const N = 4096;
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  let flat = 0, frames = 0, mid = 0, high = 0, total = 0;
  for (let s = 0; s + N <= x.length; s += N) {
    const re = Float64Array.from(win, (w, i) => w * x[s + i]);
    const im = new Float64Array(N);
    fft(re, im);
    let logSum = 0, sum = 0, count = 0;
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k] + 1e-20;
      const f = (k * RATE) / N;
      total += p;
      if (f >= 500 && f < 6000) mid += p;
      if (f >= 6000) high += p;
      if (f > 30 && f < 16000) {
        logSum += Math.log(p);
        sum += p;
        count++;
      }
    }
    flat += Math.exp(logSum / count) / (sum / count);
    frames++;
  }
  return { flatness: flat / frames, mid: mid / total, high: high / total };
}

/** Loud 5 ms windows over typical ones (p99 / median RMS): ~1 for a steady wash, well above for audible drops. */
function granularity(x: Float64Array): number {
  const w = RATE / 200;
  const env: number[] = [];
  for (let s = 0; s + w <= x.length; s += w) {
    let e = 0;
    for (let i = s; i < s + w; i++) e += x[i] * x[i];
    env.push(e);
  }
  env.sort((a, b) => a - b);
  return Math.sqrt(env[Math.floor(env.length * 0.99)] / env[Math.floor(env.length / 2)]);
}

describe('rain and drips synthesis', () => {
  it('renders the same samples for the same seed', () => {
    const a = rain(mulberry32(3), RATE, 1);
    const b = rain(mulberry32(3), RATE, 1);
    expect(a[0]).toEqual(b[0]);
    expect(a[1]).toEqual(b[1]);
    expect(rain(mulberry32(4), RATE, 1)[0]).not.toEqual(a[0]);
    expect(drips(mulberry32(3), RATE, 6)[1]).toEqual(drips(mulberry32(3), RATE, 6)[1]);
  });

  it.each([['rain', rain], ['drips', drips]] as const)('%s is finite and audible at 44.1 and 48 kHz', (_, render) => {
    for (const rate of [44100, 48000]) {
      for (const ch of render(mulberry32(1), rate, 13)) {
        expect(ch.length).toBe(Math.ceil(13 * rate));
        expect(ch.every(Number.isFinite)).toBe(true);
        expect(ch.some((x) => x !== 0)).toBe(true);
      }
    }
  });

  it('makes rain a patter of drops, not white noise', () => {
    const out = rain(mulberry32(1), RATE, 13);
    const x = mono(out);
    const noise = mulberry32(1);
    const white = Float64Array.from(x, () => noise() * 2 - 1);
    const ref = spectrum(white);
    const s = spectrum(x);
    // The measure itself: white noise is flat, three quarters of it above 6 kHz, and steady.
    expect(ref.flatness).toBeGreaterThan(0.5);
    expect(ref.high).toBeGreaterThan(0.7);
    expect(granularity(white)).toBeLessThan(1.5);
    // Rain: coloured, no hiss, the energy where drops patter, and individual drops audible.
    expect(s.flatness).toBeLessThan(0.1);
    expect(s.high).toBeLessThan(0.05);
    expect(s.mid).toBeGreaterThan(0.6);
    expect(granularity(x)).toBeGreaterThan(3);
    // renderBed normalises the peak, so the crest factor decides how loud the bed can play.
    let peak = 0, sq = 0;
    for (const ch of out) for (const v of ch) (peak = Math.max(peak, Math.abs(v))), (sq += v * v);
    expect(20 * Math.log10(peak / Math.sqrt(sq / (2 * out[0].length)))).toBeLessThan(26);
  });

  it('bubbles rise in pitch, as a drop into a puddle does', () => {
    const buf = new Float32Array(RATE);
    const d: Drop = { at: 0, amp: 1, decay: 0.02, freq: 1000, q: 1, lp: 0, pan: 0 };
    const n = bubble(buf, RATE, d, 0.3);
    const w = RATE / 50;
    const crossings = (from: number): number => {
      let c = 0;
      for (let i = from + 1; i < from + w; i++) if (buf[i - 1] < 0 !== buf[i] < 0) c++;
      return c;
    };
    expect(n).toBeGreaterThan(2 * w);
    expect(crossings(w)).toBeGreaterThan(crossings(0) * 1.15);
  });
});
