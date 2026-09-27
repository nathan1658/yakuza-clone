import { mulberry32, seedFrom } from '../synth/rng';
import type { SfxRecipe } from './types';

const FADE_OUT = 0.02;

/**
 * Scale `data` so its peak equals `level`, then fade the last `fadeLen` samples
 * to silence so a cut reverb tail never clicks. Returns the original peak.
 */
export function normalise(data: Float32Array, level: number, fadeLen: number): number {
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const scale = peak > 0 ? level / peak : 0;
  const from = Math.max(0, data.length - fadeLen);
  for (let i = 0; i < data.length; i++) {
    const fade = i < from ? 1 : (data.length - 1 - i) / Math.max(1, fadeLen - 1);
    data[i] *= scale * fade;
  }
  return peak;
}

/** Render every variant of a recipe to mono buffers at `rate`, peak-normalised to its level. */
export async function renderRecipe(id: string, recipe: SfxRecipe, rate: number): Promise<AudioBuffer[]> {
  const out: AudioBuffer[] = [];
  for (let v = 0; v < (recipe.variants ?? 1); v++) {
    const off = new OfflineAudioContext(1, Math.ceil(recipe.dur * rate), rate);
    recipe.render({ c: off, out: off.destination, r: mulberry32(seedFrom(id) + v) });
    const buf = await off.startRendering();
    normalise(buf.getChannelData(0), recipe.level, Math.round(rate * FADE_OUT));
    out.push(buf);
  }
  return out;
}
