/**
 * Kowloon across the harbour: two ragged rows of towers far beyond the
 * typhoon shelter and the rooftop neon that made the view. Pure data.
 */
import { hashString, mulberry32, pick, range } from './rng';
import type { SignDef, SignMode } from './signs';

export interface Tower {
  readonly x0: number;
  readonly x1: number;
  /** Back and front (harbour-facing) faces. */
  readonly z0: number;
  readonly z1: number;
  readonly height: number;
  readonly seed: number;
  /** Share of windows lit. */
  readonly lit: number;
}

const ROWS = [
  { front: -690, jitter: 30, low: 26, high: 90, tall: 0.1 },
  { front: -760, jitter: 25, low: 50, high: 130, tall: 0.18 },
] as const;
const SPAN = 900;

function buildTowers(): Tower[] {
  const rng = mulberry32(hashString('kowloon'));
  const out: Tower[] = [];
  for (const row of ROWS) {
    for (let x = -SPAN + range(rng, 0, 20); x < SPAN; ) {
      const w = range(rng, 16, 42);
      const front = row.front + range(rng, -row.jitter, row.jitter);
      const height = rng() < row.tall ? range(rng, 120, 190) : range(rng, row.low, row.high);
      out.push({ x0: x, x1: x + w, z0: front - range(rng, 18, 30), z1: front, height, seed: Math.floor(rng() * 1e6), lit: range(rng, 0.12, 0.45) });
      x += w + range(rng, 0, 8);
    }
  }
  return out;
}

export const TOWERS: readonly Tower[] = buildTowers();

const NAMES = ['東方錶行', '金星電器', '萬國', '星光', '大華', '明珠', '樂聲牌', '新世界', '皇冠', '金龍', '好運', '永安'] as const;
const COLORS = [0xff2438, 0x38e8ff, 0x3cff78, 0xffd23c, 0xff3c9a, 0xfff0d8] as const;
const MODES: readonly SignMode[] = ['steady', 'steady', 'blink', 'chaseX'];
/** Rooftop letters (m): big enough to read from across the water. */
const CELL = 9;

function buildSigns(): SignDef[] {
  const rng = mulberry32(hashString('kowloon-neon'));
  const out: SignDef[] = [];
  for (const t of TOWERS) {
    if (t.z1 < ROWS[0].front - ROWS[0].jitter || t.height > 100 || rng() > 0.3) continue;
    const text = pick(rng, NAMES);
    const w = [...text].length * CELL + CELL * 0.4;
    if (w > t.x1 - t.x0 + 6) continue;
    out.push({
      text, kind: 'neon', vertical: false,
      x: (t.x0 + t.x1) / 2, y: t.height + CELL * 0.7, z: t.z1 - 2,
      yaw: 0, w, h: CELL * 1.4, depth: 0.5, twoSided: false, mount: 0,
      color: pick(rng, COLORS), panel: 0x0a0a0c, mode: pick(rng, MODES), font: 'sans', shape: 'board', power: 1, phase: rng() * 10,
    });
  }
  return out;
}

export const SKYLINE_SIGNS: readonly SignDef[] = buildSigns();
