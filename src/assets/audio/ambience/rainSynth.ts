/**
 * Rain and drips rendered sample by sample in plain JS. A shower is thousands
 * of droplets a second: cheap here, far too many Web Audio nodes. Pure and
 * deterministic: every random choice comes from the given Rng.
 */
import { TAU } from '../../../core/math';
import { between, type Rng } from '../synth/rng';

/** [left, right] sample buffers. */
export type Stereo = readonly [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];

/** One sound event on the ground around the listener. */
export interface Drop {
  /** Onset, seconds. */
  at: number;
  amp: number;
  /** Envelope time constant, seconds. */
  decay: number;
  /** Resonance of a click or starting pitch of a bubble, Hz. */
  freq: number;
  q: number;
  /** Air and occlusion low-pass, Hz: far drops are dull. */
  lp: number;
  /** Lateral position, -1 (left ear) .. 1 (right ear). */
  pan: number;
}

/** Interaural delay of a source at the side, seconds. */
const ITD = 0.00065;
/** Equal-power pan of a source at the side (1 would be one ear only). */
const WIDTH = 0.8;
/** Longest single event, seconds. */
const MAX_EVENT = 0.4;
/** Events stop once their envelope falls below this, ~50 dB under the loudest drop. */
const FLOOR = 3e-4;
/** Excitation noise table length (a power of two); events read it from random offsets. */
const NOISE = 4096;

/** Render state shared by the layers; `d` and the scratch buffers are reused so nothing allocates per droplet. */
interface Scene {
  readonly out: Stereo;
  readonly r: Rng;
  readonly rate: number;
  readonly seconds: number;
  /** Mono scratch for one event, before it is placed in the stereo field. */
  readonly buf: Float32Array;
  /** Mono scratch as long as the output, for continuous layers. */
  readonly long: Float32Array;
  readonly noise: Float32Array;
  readonly d: Drop;
}

function scene(r: Rng, rate: number, seconds: number): Scene {
  const n = Math.ceil(seconds * rate);
  return {
    out: [new Float32Array(n), new Float32Array(n)], r, rate, seconds,
    buf: new Float32Array(Math.ceil(MAX_EVENT * rate)), long: new Float32Array(n),
    noise: Float32Array.from({ length: NOISE }, () => r() * 2 - 1),
    d: { at: 0, amp: 0, decay: 0, freq: 0, q: 1, lp: 0, pan: 0 },
  };
}

function logBetween(r: Rng, lo: number, hi: number): number {
  return lo * Math.pow(hi / lo, r());
}

/** Fill `buf` with white noise in [-1, 1) from an inline xorshift seeded by `r`: per sample it is far cheaper than calling the Rng. */
function white(buf: Float32Array, r: Rng): void {
  let x = (r() * 0x7fffffff) | 1;
  for (let i = 0; i < buf.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    buf[i] = x / 2147483648;
  }
}

/** One-pole smoothing coefficient for cutoff `f`: y += k * (x - y). */
function pole(f: number, rate: number): number {
  return 1 - Math.exp((-TAU * f) / rate);
}

/** RBJ band-pass (0 dB peak) over the first `n` samples of `buf`, in place. Returns the output peak. */
function bandpass(buf: Float32Array, n: number, freq: number, q: number, rate: number): number {
  const w = (TAU * freq) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const b0 = alpha / (1 + alpha), a1 = (-2 * Math.cos(w)) / (1 + alpha), a2 = (1 - alpha) / (1 + alpha);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const x = buf[i];
    const y = b0 * (x - x2) - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    buf[i] = y;
    peak = Math.max(peak, Math.abs(y));
  }
  return peak;
}

/** Minnaert bubble damping time for pitch `f` (van den Doel 2005: d = 0.043 f + 0.0014 f^1.5). */
function bubbleDecay(f: number): number {
  return 1 / (0.043 * f + 0.0014 * Math.pow(f, 1.5));
}

/**
 * Put `d` somewhere on the ground `near`..`far` metres away, uniform by area (so
 * most drops are far): 1/distance loudness, duller with distance, any bearing.
 */
function place(r: Rng, d: Drop, near: number, far: number): void {
  const dist = Math.sqrt(near * near + r() * (far * far - near * near));
  d.amp *= near / dist;
  d.lp = 18000 / Math.sqrt(dist);
  d.pan = Math.sin(TAU * r());
}

/**
 * A droplet striking something: an impact pulse of noise that swells and fades
 * over `decay` (t·e^-t, no instant-onset spike), rung through a band-pass and
 * held under `cap`. Returns its length.
 */
function click(s: Scene, cap = Infinity): number {
  const { buf, d, noise } = s;
  const m = d.decay * s.rate;
  const n = Math.min(buf.length, Math.ceil(m * (Math.log(d.amp / FLOOR) + 4) + ((4 * d.q) / (Math.PI * d.freq)) * s.rate));
  const k = Math.exp(-1 / m);
  let fall = d.amp * Math.E, p = Math.floor(s.r() * NOISE);
  for (let j = 0; j < n; j++) {
    buf[j] = (j / m) * fall * noise[p++ & (NOISE - 1)];
    fall *= k;
  }
  const peak = bandpass(buf, n, d.freq, d.q, s.rate);
  if (peak > cap) for (let j = 0; j < n; j++) buf[j] *= cap / peak;
  return n;
}

/**
 * Minnaert bubble: a decaying sine whose pitch rises as the bubble nears the
 * surface, f(t) = f0 (1 + rise * t / decay) (van den Doel 2005). Returns its length.
 */
export function bubble(buf: Float32Array, rate: number, d: Drop, rise: number): number {
  const n = Math.min(buf.length, Math.max(0, Math.ceil(d.decay * rate * Math.log(d.amp / FLOOR))));
  const k = Math.exp(-1 / (d.decay * rate));
  const w0 = (TAU * d.freq) / rate;
  const dw = (w0 * rise) / (d.decay * rate);
  let env = d.amp, ph = 0, w = w0;
  for (let j = 0; j < n; j++) {
    buf[j] = env * Math.sin(ph);
    ph += w;
    w += dw;
    env *= k;
  }
  return n;
}

/**
 * Add the first `n` scratch samples at `d.at`, low-passed for distance, to both
 * ears: an equal-power level difference plus an interaural delay, so a shower of
 * clicks decorrelates the channels the way a real diffuse field does. Tonal
 * events pass `itd = 0`: a delay would put a pitch out of phase between the ears.
 */
function mix(s: Scene, n: number, itd = ITD): void {
  const [left, right] = s.out;
  const { buf, d, rate } = s;
  const k = pole(d.lp, rate);
  const th = (WIDTH * d.pan + 1) * (Math.PI / 4);
  const gl = Math.cos(th), gr = Math.sin(th);
  const lag = Math.round(Math.abs(d.pan) * itd * rate);
  const i0 = Math.round(d.at * rate);
  const l0 = i0 + (d.pan > 0 ? lag : 0), r0 = i0 + (d.pan < 0 ? lag : 0);
  const len = Math.min(n, left.length - Math.max(l0, r0));
  let z = 0;
  for (let j = 0; j < len; j++) {
    z += k * (buf[j] - z);
    left[l0 + j] += z * gl;
    right[r0 + j] += z * gr;
  }
}

/**
 * Pavement patter: a dense crackle of tiny clicks. Drop size shapes each one:
 * most drops are small, faint, short and high; the rare big ones land louder,
 * longer (the impact lasts about diameter / speed) and lower. The nearest big
 * drops are held to one ceiling so none stands out on every pass of the loop.
 */
function patter(s: Scene, perSec: number, level: number): void {
  const { d, r } = s;
  for (let i = Math.round(perSec * s.seconds); i > 0; i--) {
    const size = r();
    d.at = r() * s.seconds;
    d.freq = 4500 * Math.pow(800 / 4500, 0.25 * size + 0.75 * r());
    d.q = between(r, 0.8, 2.5);
    d.decay = 0.00015 * Math.pow(4, size);
    // 30 dB of spread, and equal energy whatever the band.
    d.amp = level * Math.pow(10, 1.5 * (size - 1)) * Math.sqrt((d.q * 1000) / d.freq);
    place(r, d, 2, 30);
    mix(s, click(s, 0.08 * level));
  }
}

/** Heavier, duller drops on canvas and plastic awnings: warmth under the crackle. */
function canopy(s: Scene, perSec: number, level: number): void {
  const { d, r } = s;
  for (let i = Math.round(perSec * s.seconds); i > 0; i--) {
    d.at = r() * s.seconds;
    d.freq = logBetween(r, 250, 900);
    d.q = between(r, 2, 5);
    d.decay = logBetween(r, 0.0008, 0.002);
    d.amp = level * Math.pow(10, -r()) * Math.sqrt((d.q * 1000) / d.freq);
    place(r, d, 2, 10);
    mix(s, click(s, 0.08 * level));
  }
}

/**
 * Drops into puddles: a faint impact tick, then the entrained bubble's rising
 * plink. The nearest are held to `level` so no single plink recurs on every loop.
 */
function plinks(s: Scene, perSec: number, level: number): void {
  const { d, r } = s;
  for (let i = Math.round(perSec * s.seconds); i > 0; i--) {
    d.at = r() * s.seconds;
    d.amp = 2.5 * level * Math.pow(10, -0.6 * r());
    place(r, d, 2, 12);
    const amp = Math.min(level, d.amp);
    d.freq = 3000;
    d.q = 1;
    d.decay = 0.0004;
    d.amp = amp * 0.5;
    mix(s, click(s));
    d.at += between(r, 0.002, 0.01);
    d.freq = logBetween(r, 1000, 3000);
    d.decay = bubbleDecay(d.freq);
    d.amp = amp;
    mix(s, bubble(s.buf, s.rate, d, between(r, 0.08, 0.15)), 0);
  }
}

/** Add `long` scaled by `gain` to `ch`, with a slow random level drift in [1 - depth, 1] (knots every 0.8–2 s). */
function drifting(s: Scene, ch: Float32Array, gain: number, depth: number): void {
  const { long, r, rate } = s;
  let g0 = 1 - depth * r();
  for (let i = 0; i < ch.length; ) {
    const len = Math.round(between(r, 0.8, 2) * rate);
    const g1 = 1 - depth * r();
    const end = Math.min(ch.length, i + len);
    for (let j = i; j < end; j++) ch[j] += long[j] * gain * (g0 + ((g1 - g0) * (j - i)) / len);
    i = end;
    g0 = g1;
  }
}

/**
 * Distant rain, the blur of countless far drops: dark noise (flat 150–800 Hz,
 * falling away above) at RMS `level`, independent per ear, slowly drifting.
 */
function body(s: Scene, level: number): void {
  const { long, r, rate } = s;
  const hp = pole(150, rate), lo = pole(800, rate), hi = pole(2500, rate);
  for (const ch of s.out) {
    white(long, r);
    let a = 0, b = 0, c = 0, sum = 0;
    for (let i = 0; i < long.length; i++) {
      const w = long[i];
      a += hp * (w - a);
      b += lo * (w - a - b);
      c += hi * (b - c);
      long[i] = c;
      sum += c * c;
    }
    drifting(s, ch, level / Math.sqrt(sum / long.length || 1), 0.3);
  }
}

/** Gutter runoff off to one side: low noise (200–500 Hz) at RMS `level` with a random gurgling swell, plus low bubbles. */
function runoff(s: Scene, level: number): void {
  const { d, long, r, rate } = s;
  const [left, right] = s.out;
  const hp = pole(200, rate), lp = pole(500, rate), smooth = 1 - Math.exp(-1 / (0.025 * rate));
  let a = 0, b = 0, c = 0, am = 0, target = 0, next = 0, sum = 0;
  white(long, r);
  for (let i = 0; i < long.length; i++) {
    if (i >= next) {
      target = r() * r();
      next = i + Math.round(between(r, 0.03, 0.12) * rate);
    }
    am += smooth * (target - am);
    const w = long[i];
    a += hp * (w - a);
    b += lp * (w - a - b);
    c += lp * (b - c);
    long[i] = c * am;
    sum += long[i] * long[i];
  }
  const pan = between(r, -0.7, -0.3);
  const th = (pan + 1) * (Math.PI / 4);
  const g = level / Math.sqrt(sum / long.length || 1);
  const gl = g * Math.cos(th), gr = g * Math.sin(th);
  for (let i = 0; i < long.length; i++) {
    left[i] += long[i] * gl;
    right[i] += long[i] * gr;
  }
  for (let i = Math.round(5 * s.seconds); i > 0; i--) {
    d.at = r() * s.seconds;
    d.freq = logBetween(r, 200, 600);
    d.decay = bubbleDecay(d.freq);
    d.amp = level * between(r, 0.5, 2);
    d.lp = 3000;
    d.pan = pan + between(r, -0.15, 0.15);
    mix(s, bubble(s.buf, rate, d, between(r, 0.08, 0.2)), 0);
  }
}

/**
 * Rain on a night street: pavement patter, awning taps, puddle plinks, a dark
 * distant wash and gutter runoff. Against the patter's RMS the canopy sits about
 * -6 dB, the plinks and the wash about -14 dB and the runoff about -20 dB.
 */
export function rain(r: Rng, rate: number, seconds: number): Stereo {
  const s = scene(r, rate, seconds);
  patter(s, 1300, 1);
  canopy(s, 35, 0.6);
  plinks(s, 10, 0.034);
  body(s, 0.0013);
  runoff(s, 0.00076);
  return s.out;
}

/**
 * Drips off ledges, awnings and air-conditioners: four sources around the
 * listener, each on its own loose rhythm; three fall into puddles (a tick, then
 * a rising plink), one onto something hard (a dull tok).
 */
export function drips(r: Rng, rate: number, seconds: number): Stereo {
  const s = scene(r, rate, seconds);
  const { d } = s;
  for (let src = 0; src < 4; src++) {
    const every = logBetween(r, 1.5, 6);
    const pitch = logBetween(r, 900, 2200);
    const puddle = src > 0;
    d.amp = 1;
    place(r, d, 1.5, 8);
    // One source per quarter around the listener, so they never bunch up on one side.
    d.pan = Math.sin((TAU * (src + r())) / 4);
    const { amp, lp, pan } = d;
    for (let t = r() * every; t < seconds - MAX_EVENT; t += every * between(r, 0.75, 1.25)) {
      d.at = t;
      d.lp = lp;
      d.pan = pan;
      d.amp = amp * (puddle ? 0.3 : 1) * between(r, 0.7, 1);
      d.freq = puddle ? 2500 : pitch * 0.6;
      d.q = puddle ? 1 : 3;
      d.decay = puddle ? 0.0005 : 0.002;
      mix(s, click(s));
      if (!puddle) continue;
      d.at += between(r, 0.002, 0.008);
      d.freq = pitch * between(r, 0.92, 1.08);
      d.decay = bubbleDecay(d.freq);
      d.amp = amp * between(r, 0.6, 1);
      mix(s, bubble(s.buf, rate, d, between(r, 0.08, 0.15)), 0);
    }
  }
  return s.out;
}
