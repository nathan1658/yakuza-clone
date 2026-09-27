/** Pure voice-management policy for the SFX pool. */

export const MAX_VOICES = 24;
export const REF_DISTANCE = 3;
export const MAX_DISTANCE = 60;
export const ROLLOFF = 1.2;
export const PITCH_SPREAD = 0.05;

export interface VoiceInfo {
  /** Estimated audibility: level × volume × distance attenuation. */
  readonly loudness: number;
  readonly start: number;
  readonly end: number;
}

/** Gain of the Web Audio 'inverse' distance model with our panner settings. */
export function distanceGain(d: number): number {
  return REF_DISTANCE / (REF_DISTANCE + ROLLOFF * (Math.max(d, REF_DISTANCE) - REF_DISTANCE));
}

/**
 * Index of the voice to steal: the one contributing least from now on
 * (loudness × fraction still to play). Ties go to the oldest.
 */
export function pickVictim(voices: readonly VoiceInfo[], now: number): number {
  let best = -1;
  let bestScore = Infinity;
  voices.forEach((v, i) => {
    const left = Math.max(0, v.end - now) / Math.max(1e-3, v.end - v.start);
    const score = v.loudness * left;
    if (score < bestScore || (score === bestScore && v.start < voices[best].start)) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/** Random variant index that never repeats `last` (−1 = none yet) when there is a choice. */
export function pickVariant(count: number, last: number, rnd: number): number {
  if (count <= 1 || last < 0) return Math.floor(rnd * count);
  const i = Math.floor(rnd * (count - 1));
  return i >= last ? i + 1 : i;
}

/** Playback rate for a requested pitch with ±5% humanising spread. */
export function spreadRate(pitch: number, rnd: number): number {
  return pitch * (1 + (rnd * 2 - 1) * PITCH_SPREAD);
}
