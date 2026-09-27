import type { GameModeId, WeatherKind, ZoneId } from '../../../core/types';

export type LayerId = 'rain' | 'drips' | 'city' | 'harbour' | 'neon';
export const LAYERS: readonly LayerId[] = ['rain', 'drips', 'city', 'harbour', 'neon'];
export type LayerLevels = Record<LayerId, number>;

export interface AmbienceInput {
  mode: GameModeId;
  zone: ZoneId;
  weather: WeatherKind;
  /** Listener position on the ground plane. */
  x: number;
  z: number;
}

const RAIN: Record<WeatherKind, number> = { clear: 0, drizzle: 0.35, rain: 1 };
const DRIPS: Record<WeatherKind, number> = { clear: 0.15, drizzle: 0.6, rain: 1 };
/** Percy Street neon strip (ARCHITECTURE §5) and how far its hum carries. */
const PERCY = { x0: -72, x1: -56, z0: -130, z1: 0 };
const NEON_RANGE = 25;
const QUIET_MODES: readonly GameModeId[] = ['combat', 'heatAction', 'gameOver'];
const QUIET = 0.5;

/** Distance from (x, z) to the Percy St rectangle; 0 inside it. */
export function percyDistance(x: number, z: number): number {
  const dx = Math.max(PERCY.x0 - x, 0, x - PERCY.x1);
  const dz = Math.max(PERCY.z0 - z, 0, z - PERCY.z1);
  return Math.hypot(dx, dz);
}

/** Target level (0..1) of every ambience layer, written into `out` to avoid per-frame allocation. */
export function ambienceTargets(s: AmbienceInput, out: LayerLevels): LayerLevels {
  const quiet = QUIET_MODES.includes(s.mode) ? QUIET : 1;
  const harbour = s.zone === 'typhoon';
  out.rain = RAIN[s.weather] * quiet;
  out.drips = DRIPS[s.weather] * quiet;
  out.harbour = (harbour ? 1 : 0) * quiet;
  out.city = (harbour ? 0.25 : 1) * quiet;
  out.neon = Math.max(0, 1 - percyDistance(s.x, s.z) / NEON_RANGE) * quiet;
  return out;
}

/**
 * Make a loop seamless: `data` holds `loopLen` samples plus a tail; the tail is
 * equal-power crossfaded over the head so sample loopLen-1 flows into sample 0.
 */
export function seamless(data: Float32Array<ArrayBuffer>, loopLen: number): Float32Array<ArrayBuffer> {
  const fade = Math.min(data.length - loopLen, loopLen);
  for (let i = 0; i < fade; i++) {
    const x = (i / fade) * (Math.PI / 2);
    data[i] = data[i] * Math.sin(x) + data[loopLen + i] * Math.cos(x);
  }
  return data.subarray(0, loopLen);
}
