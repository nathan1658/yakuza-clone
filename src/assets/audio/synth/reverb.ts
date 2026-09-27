import { mulberry32 } from './rng';

/**
 * Synthetic room impulse: decorrelated noise per channel with an exponential
 * decay that also darkens over time (air absorption). Pure.
 */
export function fillImpulse(data: Float32Array, sampleRate: number, seconds: number, seed: number): void {
  const r = mulberry32(seed);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    const k = 0.9 - 0.8 * Math.min(1, t / seconds);
    lp += (r() * 2 - 1 - lp) * k;
    data[i] = lp * Math.pow(1 - t / seconds, 2.5) * (i < sampleRate * 0.004 ? i / (sampleRate * 0.004) : 1);
  }
}

const cache = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

/** Stereo impulse of the given length, generated once per context. */
export function impulse(c: BaseAudioContext, seconds: number): AudioBuffer {
  let bySec = cache.get(c);
  if (!bySec) cache.set(c, (bySec = new Map()));
  let buf = bySec.get(seconds);
  if (!buf) {
    buf = c.createBuffer(2, Math.ceil(c.sampleRate * seconds), c.sampleRate);
    for (let ch = 0; ch < 2; ch++) fillImpulse(buf.getChannelData(ch), c.sampleRate, seconds, 11 + ch * 97);
    bySec.set(seconds, buf);
  }
  return buf;
}

export function reverb(c: BaseAudioContext, seconds = 2.2): ConvolverNode {
  const v = c.createConvolver();
  v.buffer = impulse(c, seconds);
  return v;
}
