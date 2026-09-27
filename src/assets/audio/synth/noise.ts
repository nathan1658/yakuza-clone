import { mulberry32 } from './rng';

export type NoiseKind = 'white' | 'pink' | 'brown';

/** Fill `data` with normalised noise of the given colour (peak exactly 1). Pure. */
export function fillNoise(kind: NoiseKind, data: Float32Array, seed = 7): void {
  const r = mulberry32(seed);
  let b0 = 0, b1 = 0, b2 = 0, brown = 0;
  for (let i = 0; i < data.length; i++) {
    const w = r() * 2 - 1;
    if (kind === 'white') data[i] = w;
    else if (kind === 'brown') data[i] = brown = (brown + 0.02 * w) * 0.998;
    else {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      data[i] = b0 + b1 + b2 + w * 0.1848;
    }
  }
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  for (let i = 0; i < data.length; i++) data[i] /= peak || 1;
}

const cache = new WeakMap<BaseAudioContext, Map<NoiseKind, AudioBuffer>>();

/** A 2-second mono noise buffer, generated once per context and colour. */
export function noiseBuffer(c: BaseAudioContext, kind: NoiseKind = 'white'): AudioBuffer {
  let byKind = cache.get(c);
  if (!byKind) cache.set(c, (byKind = new Map()));
  let buf = byKind.get(kind);
  if (!buf) {
    buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    fillNoise(kind, buf.getChannelData(0), kind.length * 131);
    byKind.set(kind, buf);
  }
  return buf;
}

/** Looping noise source started at a random offset so repeated hits never sound identical. */
export function noise(c: BaseAudioContext, t: number, dur: number, kind: NoiseKind = 'white', offset = Math.random()): AudioBufferSourceNode {
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c, kind);
  s.loop = true;
  s.start(t, offset * 1.9);
  s.stop(t + dur);
  return s;
}
