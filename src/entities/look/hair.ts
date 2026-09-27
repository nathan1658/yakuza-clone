/**
 * Hair: a scalp cap cut to a real hairline (forehead, temples, sideburns,
 * clear of the ears, nape) plus strand clumps that walk the sculpted skull
 * and fall under gravity once past its widest point. Every clump carries its
 * direction in `accent`, which the shader turns into strand streaks.
 */
import type { HairStyle } from '../../core/types';
import type { Look } from './body';
import type { Head } from './head';
import {
  add, blend, cross, dot, KIND, lerp, MeshBuilder, mix, norm, paint, rigid, scale, shade, smooth, sub,
  type Paint, type Ring, type V,
} from './MeshBuilder';

const TAU = Math.PI * 2;

/** Hairline polar angle (from the crown) by |azimuth| from the front. */
const HAIRLINE: readonly (readonly [number, number])[] = [
  [0, 0.92], [0.55, 1.02], [1.05, 1.3], [1.3, 1.56], [1.45, 1.3], [1.8, 1.28], [2.05, 1.45], [2.45, 1.85], [Math.PI, 2.05],
];

function hairline(ph: number): number {
  let a = Math.abs(((ph % TAU) + TAU) % TAU);
  if (a > Math.PI) a = TAU - a;
  for (let i = 1; i < HAIRLINE.length; i++) {
    const [a1, t1] = HAIRLINE[i];
    if (a <= a1) {
      const [a0, t0] = HAIRLINE[i - 1];
      return lerp(t0, t1, smooth(0, 1, (a - a0) / (a1 - a0)));
    }
  }
  return HAIRLINE[HAIRLINE.length - 1][1];
}

/** Small deterministic RNG so a look always grows the same hair. */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13; a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5; a >>>= 0;
    return a / 4294967296;
  };
}

interface Ctx {
  b: MeshBuilder;
  head: Head;
  look: Look;
  pt: Paint;
  r: () => number;
}

/** Scalp cap between `from(φ)` and the hairline, `grow` thick, thinning to nothing at the hairline. */
function cap(c: Ctx, grow: number, fade: number, from: (ph: number) => number = () => 0, span: readonly [number, number] = [0, TAU]): void {
  const { b, head, look } = c;
  const ROWS = 14;
  const open = span[1] - span[0] < TAU - 1e-3;
  const COLS = open ? 30 : 48;
  const pts: V[][] = [];
  const hints: V[][] = [];
  const dirs: V[][] = [];
  for (let i = 0; i <= ROWS; i++) {
    const t = i / ROWS;
    const row: V[] = [];
    const hint: V[] = [];
    const dir: V[] = [];
    for (let k = 0; k < COLS; k++) {
      const ph = span[0] + ((span[1] - span[0]) * k) / (open ? COLS - 1 : COLS);
      const th = lerp(from(ph), hairline(ph), t);
      const g = grow * (1 - 0.9 * smooth(0.7, 1, t)) * (open ? 1 - 0.9 * smooth(0.8, 1, Math.abs(k / (COLS - 1) - 0.5) * 2) : 1);
      row.push(head.surf(th, ph, g));
      hint.push(head.normal(th, ph));
      dir.push(norm(sub(head.surf(th + 0.02, ph), head.surf(th, ph))));
    }
    pts.push(row);
    hints.push(hint);
    dirs.push(dir);
  }
  const edge = (i: number) => blend(c.pt.color, look.skinTone, fade * smooth(0.72, 1, i / ROWS));
  b.grid(pts, hints, rigid('head'), c.pt, undefined, (i, k) => dirs[i][k], open, fade > 0 ? (i) => edge(i) : undefined);
}

interface Strand {
  th: number;
  ph: number;
  /** Combing direction in (θ, φ), arc-length weighted. */
  dth: number;
  dph: number;
  len: number;
  width: number;
  thick: number;
  lift: number;
  /** Polar angle past which the strand leaves the skull and hangs. */
  fall: number;
  /** How far the tip lifts off the scalp (tufts). */
  flick?: number;
  /** Cut ends instead of tapered points. */
  blunt?: boolean;
}

/** Walk a strand over the scalp, then let it hang; sweep a flat tapered clump along it. */
function strand(c: Ctx, s: Strand, color: number): void {
  const { head } = c;
  const step = 0.022;
  const pts: V[] = [];
  const fronts: V[] = [];
  let th = s.th;
  let ph = s.ph;
  let travelled = 0;
  let dth = s.dth;
  let dph = s.dph;
  while (travelled < s.len && th < s.fall) {
    const u = travelled / s.len;
    const lift = s.lift + (s.flick ?? 0) * u * u;
    pts.push(head.surf(th, ph, lift + s.thick * 0.5));
    fronts.push(head.normal(th, ph));
    const sin = Math.max(0.15, Math.abs(Math.sin(th)));
    const speed = Math.hypot(dth * 0.11, dph * 0.08 * sin) || 1;
    th += (step * dth) / speed;
    ph += (step * dph) / speed;
    travelled += step;
    // Gravity bends a downward-combed strand further down the further it runs.
    if (dth > 0) {
      dth = lerp(dth, 1.4, 0.08);
      dph *= 0.97;
    }
  }
  if (pts.length < 1) return;
  let p = pts[pts.length - 1];
  let d = pts.length > 1 ? norm(sub(p, pts[pts.length - 2])) : head.normal(th, ph);
  const centre = head.c;
  while (travelled < s.len) {
    d = norm(mix(d, [0, -1, 0], 0.3));
    p = add(p, scale(d, step));
    // Keep clear of the skull and the neck/shoulders below it.
    const out: V = [p[0] - centre[0], 0, p[2] - centre[2]];
    const r = Math.hypot(out[0], out[2]);
    const need = p[1] > centre[1] - 0.06 ? 0.085 : 0.075 + 0.06 * smooth(centre[1] - 0.12, centre[1] - 0.24, p[1]);
    if (r < need && r > 1e-4) p = [centre[0] + (out[0] / r) * need, p[1], centre[2] + (out[2] / r) * need];
    pts.push(p);
    fronts.push(r > 1e-4 ? norm(out) : [0, 0, -1]);
    travelled += step;
  }
  if (pts.length < 2) return;
  const n = pts.length;
  const rings: Ring[] = pts.map((c0, i) => {
    const u = i / (n - 1);
    const taper = u < 0.12 ? 0.75 + 2 * u : s.blunt ? 1 - 0.45 * smooth(0.7, 1, u) : 1 - 0.92 * smooth(0.55, 1, u);
    const t = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    // Lie flat: thickness along the scalp normal, width across the strand.
    const f = norm(sub(fronts[i], scale(t, dot(fronts[i], t))));
    return { c: c0, rx: s.width * 0.5 * taper, rz: s.thick * 0.5 * taper, n: 2.4, f };
  });
  c.b.sweep(rings, { sides: 5, sub: 2, capEnd: true, side: cross(rings[0].f ?? [0, 0, 1], [0, 1, 0]), accent: (_p, t) => t }, rigid('head'), { ...c.pt, color });
}

const jitter = (c: Ctx, k: number) => (c.r() - 0.5) * 2 * k;
const tone = (c: Ctx) => shade(c.look.hairColor, 0.9 + c.r() * 0.18);

/** Roots on rows of the scalp, `rows` from θ0 to θ1, skipping anything below the hairline. */
function roots(c: Ctx, rows: number, th0: number, th1: number, per: (row: number) => number, visit: (th: number, ph: number) => void): void {
  for (let row = 0; row < rows; row++) {
    const th = lerp(th0, th1, rows === 1 ? 0 : row / (rows - 1));
    const count = per(row);
    for (let k = 0; k < count; k++) {
      const ph = ((k + 0.5 + jitter(c, 0.3)) / count) * TAU + row * 0.37;
      const t = th + jitter(c, 0.04);
      if (t < hairline(ph) - 0.06) visit(t, ph);
    }
  }
}

type HairBuilder = (c: Ctx) => void;

/** 陳浩南: centre-parted, curtained over the temples, falling to the jaw at the sides and the nape behind. */
const long: HairBuilder = (c) => {
  cap(c, 0.008, 0.25);
  roots(c, 5, 0.1, 1.08, (row) => 8 + row * 3, (th, ph) => {
    const side = Math.sin(ph) >= 0 ? 1 : -1;
    const front = Math.max(0, Math.cos(ph));
    strand(c, {
      th, ph, dth: 1, dph: side * (0.4 + 1.6 * front), len: 0.17 + 0.12 * (1 - front) + jitter(c, 0.025),
      width: 0.03, thick: 0.0075, lift: 0.004, fall: front > 0.5 ? 1.52 : 1.62 + 0.4 * (1 - Math.abs(Math.sin(ph))),
    }, tone(c));
  });
};

const short: HairBuilder = (c) => {
  cap(c, 0.009, 0.45);
  roots(c, 4, 0.12, 1.12, (row) => 8 + row * 4, (th, ph) => {
    const front = Math.max(0, Math.cos(ph));
    strand(c, {
      th, ph, dth: 1, dph: jitter(c, 0.4) + Math.sin(ph) * 0.3 * front, len: 0.04 + c.r() * 0.025 - 0.012 * front,
      width: 0.025, thick: 0.008, lift: 0.004, fall: 9, flick: 0.006, blunt: true,
    }, tone(c));
  });
};

/** Gelled straight back from the hairline, over the crown to the nape; the sides swept back too. */
const slick: HairBuilder = (c) => {
  cap(c, 0.007, 0.2);
  for (let k = 0; k < 15; k++) {
    const ph = lerp(-1.15, 1.15, k / 14) + jitter(c, 0.04);
    strand(c, {
      th: hairline(ph) - 0.03, ph, dth: -1, dph: 0, len: 0.26 + jitter(c, 0.02), width: 0.026, thick: 0.006, lift: 0.004, fall: 9,
    }, tone(c));
  }
  for (const side of [1, -1]) {
    for (let k = 0; k < 5; k++) {
      const th = lerp(0.85, 1.25, k / 4);
      strand(c, { th, ph: side * 1.25, dth: -0.15, dph: side, len: 0.1, width: 0.024, thick: 0.006, lift: 0.004, fall: 9 }, tone(c));
    }
  }
};

/** 山雞: stiff bleached spikes, the front ones kicked up over the forehead. */
const spiky: HairBuilder = (c) => {
  cap(c, 0.008, 0.3);
  const { b, head } = c;
  roots(c, 4, 0.12, 1.02, (row) => 7 + row * 4, (th, ph) => {
    const base = head.surf(th, ph, 0.004);
    const n = head.normal(th, ph);
    const back: V = [-Math.sin(ph) * 0.1, 0, -Math.cos(ph) * 0.35];
    const dir = norm(add(add(scale(n, 0.75), [0, 0.55, 0]), add(back, [jitter(c, 0.2), 0, jitter(c, 0.2)])));
    const len = 0.04 + c.r() * 0.03;
    const r = 0.012 + c.r() * 0.004;
    const rings: Ring[] = [
      { c: base, rx: r, rz: r },
      { c: add(base, scale(dir, len * 0.45)), rx: r * 0.62, rz: r * 0.62 },
      { c: add(add(base, scale(dir, len)), [0, -0.004, -0.004]), rx: 0.0012, rz: 0.0012 },
    ];
    b.sweep(rings, { sides: 5, sub: 2, accent: (_p, t) => t }, rigid('head'), { ...c.pt, color: tone(c) });
  });
};

/** A tight perm: a puffed cap covered in curls. */
const perm: HairBuilder = (c) => {
  cap(c, 0.012, 0.2);
  const { b, head } = c;
  roots(c, 6, 0.05, 1.3, (row) => 6 + row * 4, (th, ph) => {
    const r = 0.0125 + c.r() * 0.005;
    b.ellipsoid(head.surf(th, ph, 0.012 + r * 0.5), [r, r, r], rigid('head'), { ...c.pt, color: tone(c) }, { segs: 6 });
  });
};

const bun: HairBuilder = (c) => {
  cap(c, 0.007, 0.2);
  for (let k = 0; k < 14; k++) {
    const ph = (k / 14) * TAU;
    strand(c, { th: hairline(ph) - 0.03, ph, dth: -1, dph: 0, len: 0.12, width: 0.026, thick: 0.006, lift: 0.004, fall: 9 }, tone(c));
  }
  const { b, head } = c;
  const at = head.surf(0.95, Math.PI, 0.03);
  b.ellipsoid(at, [0.04, 0.036, 0.034], rigid('head'), c.pt, { segs: 12 });
  b.torus(at, 0.03, 0.012, rigid('head'), { ...c.pt, color: shade(c.look.hairColor, 0.85) }, { rot: [Math.PI / 2 - 0.5, 0, 0] });
};

/** Old men's horseshoe: short hair round the sides and back only. */
const bald: HairBuilder = (c) => cap(c, 0.004, 0.55, (ph) => (Math.abs(Math.cos(ph)) > 0.5 && Math.cos(ph) < 0 ? 1.15 : 1.28), [1.05, TAU - 1.05]);

const HAIR: Readonly<Record<HairStyle, HairBuilder>> = {
  long, short, slick, bald, spiky, perm, bun,
  crew: (c) => cap(c, 0.004, 0.6),
};

const ROUGH: Partial<Record<HairStyle, number>> = { slick: 0.26, crew: 0.62, perm: 0.55, bald: 0.62 };

export function buildHair(b: MeshBuilder, look: Look, head: Head): void {
  const seed = (look.hairColor ^ (look.skinTone << 3) ^ Math.round(look.height * 1000)) >>> 0;
  const pt = paint(look.hairColor, KIND.hair, ROUGH[look.hair] ?? 0.42);
  HAIR[look.hair]({ b, head, look, pt, r: rng(seed) });
}

