/**
 * Tops as data. A garment is a layer swept over the torso profile (tucked
 * or hanging over the trousers), its sleeves swept over the arm profile, and
 * a neck finish. Open tops add an outer shell with a V opening over an inner
 * garment (topAccent is its colour), with lapels, collar and tie as needed.
 */
import type { TopStyle } from '../../core/types';
import {
  arm, armY, clip, grow, ringAt, surfaceAt, TAU, TORSO_BUMPS, torsoRings, torsoSkin, type Look,
} from './body';
import { waistY } from './bottoms';
import {
  add, blend, KIND, lerp, MeshBuilder, norm, paint, shade, smooth, type Paint, type Ring, type V,
} from './MeshBuilder';

type Cloth = 'knit' | 'woven' | 'floral' | 'leather' | 'wool';
type Neck = 'crew' | 'collar' | 'camp' | 'scoop' | 'none';

const CLOTH: Readonly<Record<Cloth, readonly [kind: number, rough: number]>> = {
  knit: [KIND.knit, 0.92], woven: [KIND.woven, 0.78], floral: [KIND.floral, 0.62], leather: [KIND.leather, 0.34], wool: [KIND.wool, 0.74],
};

interface Garment {
  cloth: Cloth;
  /** Sleeve coverage, 0 bare .. 1 to the wrist. */
  arm: number;
  neck: Neck;
  /** Front opening of a buttoned garment at the collar (radians). */
  vee?: number;
  tucked?: boolean;
  /** Tank / singlet: where the body ends and how wide the straps are. */
  scoop?: number;
  straps?: number;
  buttons?: boolean;
  pocket?: boolean;
}

interface Shell {
  /** Opening (radians) at the waist and at the collar. */
  gap: number;
  top: number;
  hem: number;
  inner: Garment;
  innerDefault?: number;
  /** Sleeves belong to the inner garment (a vest over a tee). */
  innerSleeves?: boolean;
  lapels?: boolean;
  tie?: boolean;
  buttons?: boolean;
}

interface TopSpec extends Garment {
  shell?: Shell;
}

/** Where every neckline sits (reference metres) and how close it lies against the neck there. */
const NECK_TOP = 1.506;
const NECK_EASE = 0.008;
/** A crew neck scoops down in front: open this wide (radians) at the top, closing at CREW_LOW. */
const CREW_OPEN = 2.4;
const CREW_LOW = 1.472;

const TEE: Garment = { cloth: 'knit', arm: 0.3, neck: 'crew' };
const DRESS_SHIRT: Garment = { cloth: 'woven', arm: 1, neck: 'collar', vee: 0.3, tucked: true, buttons: true };

const TOPS: Readonly<Record<Exclude<TopStyle, 'apron'>, TopSpec>> = {
  tshirt: TEE,
  shirt: { cloth: 'woven', arm: 1, neck: 'collar', vee: 0.34, tucked: true, buttons: true, pocket: true, shell: { gap: 0.72, top: 0.86, hem: 0.87, inner: TEE } },
  hawaiian: { cloth: 'floral', arm: 0.32, neck: 'camp', vee: 0.78, buttons: true },
  tank: { cloth: 'knit', arm: 0, neck: 'scoop', scoop: 1.37, straps: 0.024 },
  singlet: { cloth: 'knit', arm: 0, neck: 'scoop', scoop: 1.335, straps: 0.011 },
  vest: { cloth: 'woven', arm: 0, neck: 'none', shell: { gap: 1.2, top: 1.45, hem: 0.9, inner: TEE, innerDefault: 0xe8e8e8, innerSleeves: true } },
  jacket: { cloth: 'woven', arm: 1, neck: 'none', shell: { gap: 0.8, top: 1.15, hem: 0.86, inner: TEE, innerDefault: 0xe8e8e8, lapels: true } },
  leather: { cloth: 'leather', arm: 0.78, neck: 'none', shell: { gap: 0.8, top: 1.22, hem: 0.87, inner: { ...DRESS_SHIRT, tucked: false }, innerDefault: 0xa01818, lapels: true } },
  suit: { cloth: 'wool', arm: 1, neck: 'none', shell: { gap: 0.3, top: 1.28, hem: 0.84, inner: DRESS_SHIRT, innerDefault: 0xe0e0e0, lapels: true, tie: true, buttons: true } },
};

const clothPaint = (cloth: Cloth, color: number, accent?: number): Paint => {
  const [kind, rough] = CLOTH[cloth];
  return paint(color, kind, rough, 0, accent === undefined ? {} : { accent });
};

interface Resolved {
  /** The garment on the torso (the inner one under an open shell). */
  body: Garment;
  bodyPaint: Paint;
  shell?: Shell;
  shellPaint?: Paint;
  shellSpec?: TopSpec;
}

function resolve(look: Look): Resolved {
  if (look.top === 'apron') {
    const under = look.under && look.under !== 'apron' ? TOPS[look.under] : TEE;
    return { body: under, bodyPaint: clothPaint(under.cloth, look.topAccent ?? 0xf0f0f0) };
  }
  const spec = TOPS[look.top];
  const inner = spec.shell ? look.topAccent ?? spec.shell.innerDefault : undefined;
  if (spec.shell && inner !== undefined) {
    return {
      body: spec.shell.inner, bodyPaint: clothPaint(spec.shell.inner.cloth, inner),
      shell: spec.shell, shellPaint: clothPaint(spec.cloth, look.topColor), shellSpec: spec,
    };
  }
  return { body: spec, bodyPaint: clothPaint(spec.cloth, look.topColor, spec.cloth === 'floral' ? look.topAccent ?? 0xf2d23c : undefined) };
}

/** Whether the torso garment is tucked in, so the belt shows. */
export function topTucked(look: Look): boolean {
  return look.top !== 'apron' && Boolean(resolve(look).body.tucked);
}

/** How much of each arm the top covers (for the skin underneath). */
export function topArmCover(look: Look): number {
  const r = resolve(look);
  if (!r.shell) return r.body.arm;
  return r.shell.innerSleeves ? r.body.arm : Math.max(r.shellSpec!.arm, r.body.arm);
}

export function buildTop(b: MeshBuilder, look: Look): void {
  const r = resolve(look);
  const w = b.p.w;
  const base = torsoRings(look, w);
  const skin = torsoSkin(b);
  const g = r.body.tucked ? 0.007 : 0.015;
  layer(b, look, base, r.body, r.bodyPaint, g);
  const shellSleeves = r.shell && !r.shell.innerSleeves;
  if (!shellSleeves) sleeves(b, look, r.body.arm, r.bodyPaint, r.body.arm < 0.5 ? 0.012 : 0.01);
  if (r.shell && r.shellPaint && r.shellSpec) {
    const s = r.shell;
    const sg = g + 0.012;
    const gapAt = (y: number) => lerp(s.gap, s.top, smooth(1.12, 1.44, y));
    // With a collar the shell runs up the trapezius to meet it; a vest stops at the base of the neck.
    const top = s.lapels || r.shellSpec.neck === 'collar' ? NECK_TOP : 1.47;
    const rings = grow(clip(base, s.hem, top), sg, 0.25, (ring) => {
      // Up the trapezius the ease closes in to lie against the neck under the collar.
      const ease = lerp(sg, NECK_EASE + 0.005, smooth(1.44, NECK_TOP, ring.c[1]));
      return { rx: ring.rx + ease, rz: ring.rz + ease, gap: gapAt(ring.c[1]), thick: r.shellSpec!.cloth === 'leather' ? 0.008 : 0.006 };
    });
    b.sweep(rings, { sides: 24, sub: 2, bumps: TORSO_BUMPS, shape: 'band' }, skin, r.shellPaint);
    if (shellSleeves) sleeves(b, look, r.shellSpec.arm, r.shellPaint, 0.022);
    if (s.lapels) lapels(b, base, gapAt, sg, r.shellPaint, r.shellSpec.cloth === 'leather' ? 0.05 : 0.042);
    else if (r.shellSpec.neck === 'collar') lapels(b, base, gapAt, sg, r.shellPaint, 0.026);
    if (s.tie) tie(b, base, g);
    if (s.buttons) {
      for (const y of [1.07, 1.15]) disc(b, surfaceAt(base, TORSO_BUMPS, y, gapAt(y) / 2 + 0.09, sg + 0.002), 0.0085, paint(0x141414, KIND.plain, 0.4));
    }
  }
  if (look.top === 'apron') apron(b, base, look.topColor);
}

/** The torso garment: a closed tube, or a band with a slit/V where it buttons. */
function layer(b: MeshBuilder, look: Look, base: readonly Ring[], gmt: Garment, pt: Paint, g: number): void {
  const bottom = gmt.tucked ? waistY(look) - 0.035 : 0.9;
  // Up to the base of the neck, the ease closing in so the neckline lies against it under any collar.
  const top = gmt.scoop ?? NECK_TOP;
  const skin = torsoSkin(b);
  const vee = gmt.vee;
  const ease = (y: number) => lerp(g, NECK_EASE, smooth(1.44, NECK_TOP, y));
  const crew = gmt.neck === 'crew';
  const cloth = (y0: number, y1: number, gap?: (y: number) => number) => grow(clip(base, y0, y1), g, 0.35, (ring) => {
    const e = gmt.scoop ? g : ease(ring.c[1]);
    return { rx: ring.rx + e, rz: ring.rz + e, ...(gap ? { gap: gap(ring.c[1]), thick: 0.004 } : {}) };
  });
  const opts = { sides: 24, sub: 2, bumps: TORSO_BUMPS } as const;
  if (vee !== undefined) {
    // Buttoned: a slit down the placket opening into a V at the collar.
    b.sweep(cloth(bottom, top, (y) => 0.018 + vee * smooth(1.28, 1.48, y)), { ...opts, shape: 'band' }, skin, pt);
  } else if (crew) {
    // A closed body, then the last few centimetres scooping open in front.
    b.sweep(cloth(bottom, CREW_LOW), opts, skin, pt);
    b.sweep(cloth(CREW_LOW, top, (y) => Math.max(0.03, CREW_OPEN * scoop(y))), { ...opts, shape: 'band' }, skin, pt);
  } else {
    b.sweep(cloth(bottom, top), opts, skin, pt);
  }
  if (crew) {
    // The rib traced along the neckline on the garment itself: down at the front, up round the back.
    const n = 48;
    const rib: Ring[] = [];
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI + (TAU * i) / n;
      const y = Math.abs(a) < CREW_OPEN / 2 ? CREW_LOW + (NECK_TOP - CREW_LOW) * ((2 * Math.abs(a)) / CREW_OPEN) ** (1 / 0.7) : NECK_TOP;
      const s = surfaceAt(base, TORSO_BUMPS, y, a, ease(y) + 0.0015);
      rib.push({ c: s.p, rx: 0.006, rz: 0.003, n: 3, f: s.n });
    }
    rib[n] = { ...rib[0] };
    b.sweep(rib, { sides: 6, side: [0, 1, 0] }, skin, { ...pt, color: shade(pt.color, 0.9) });
  }
  if (gmt.neck === 'collar') collar(b, base, vee ?? 0.3, pt);
  // A camp collar lies open, folded back along the V like narrow lapels.
  if (gmt.neck === 'camp') lapels(b, base, (y) => 0.018 + (vee ?? 0.78) * smooth(1.28, 1.48, y), g, pt, 0.03, 1.3);
  if (gmt.straps) straps(b, base, top, g, gmt.straps, pt);
  if (gmt.buttons && vee !== undefined) {
    const bp = paint(blend(pt.color, 0xf4f0e8, 0.6), KIND.plain, 0.35);
    for (let y = 1.37; y > bottom + 0.06; y -= 0.078) {
      disc(b, surfaceAt(base, TORSO_BUMPS, y, (0.018 + vee * smooth(1.28, 1.48, y)) / 2 + 0.028, g + 0.0015), 0.0052, bp);
    }
  }
  if (gmt.pocket) {
    const s = surfaceAt(base, TORSO_BUMPS, 1.3, 0.5, g + 0.0015);
    b.box(s.p, [0.028, 0.032, 0.0016], skin, { ...pt, color: shade(pt.color, 0.95) }, { round: 0.2, rot: [0, Math.atan2(s.n[0], s.n[2]), 0] });
  }
}

/** Sleeves over the arm profile, hemmed at `cover`; short sleeves hang looser. */
function sleeves(b: MeshBuilder, look: Look, cover: number, pt: Paint, g: number): void {
  if (cover <= 0) return;
  for (const side of ['L', 'R'] as const) {
    const a = arm(b, side, look);
    const end = armY(a.top[1], cover);
    const flare = cover < 0.5 ? 0.007 : 0;
    const rings = grow(clip(a.rings, end, Infinity), g, 0.3, (r) => {
      const u = smooth(a.top[1] - 0.05, end, r.c[1]);
      return { rx: r.rx + g + flare * u, rz: r.rz + g + flare * u };
    });
    b.sweep(rings, { sides: 16, sub: 2, bumps: a.bumps, capStart: true, dome: 0.35 }, a.skin, pt);
    if (cover > 0.9) {
      const cuff = ringAt(a.rings, end + 0.02);
      loop(b, end + 0.022, cuff.c[2], cuff.rx + g + 0.003, cuff.rz + g + 0.003, 0, TAU, 0.018, 0.003, cuff.c[0], pt, a.skin);
    }
  }
}

/** A tube swept round an ellipse around the vertical axis (x0, ·, cz) at height y, from angle a0 over `span`. */
function loop(
  b: MeshBuilder, y: number, cz: number, rx: number, rz: number, a0: number, span: number,
  half: number, thick: number, x0: number, pt: Paint, skin = torsoSkin(b),
): void {
  const closed = span >= TAU - 1e-3;
  const n = Math.max(6, Math.ceil((span / TAU) * 36));
  const rings: Ring[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (span * i) / n;
    const radial = norm([Math.sin(a) * rz, 0, Math.cos(a) * rx]);
    rings.push({ c: [x0 + Math.sin(a) * rx, y, cz + Math.cos(a) * rz], rx: half, rz: thick, n: 3, f: radial });
  }
  if (closed) rings[n] = { ...rings[0] };
  b.sweep(rings, { sides: 8, side: [0, 1, 0], capStart: !closed, capEnd: !closed }, skin, pt);
}

/** Shirt collar: a neat stand round the neck on the shirt's neckline, open where the shirt is. */
function collar(b: MeshBuilder, base: readonly Ring[], vee: number, pt: Paint): void {
  const neck = ringAt(base, NECK_TOP);
  const a0 = vee / 2 + 0.1;
  loop(b, NECK_TOP + 0.012, neck.c[2], neck.rx + NECK_EASE + 0.004, neck.rz + NECK_EASE + 0.004, a0, TAU - 2 * a0, 0.016, 0.0025, 0, pt);
}

/** Lapels folded back along the opening, then a collar standing round the back of the neck. */
function lapels(b: MeshBuilder, base: readonly Ring[], gapAt: (y: number) => number, g: number, pt: Paint, wide: number, brk = 1.16): void {
  const skin = torsoSkin(b);
  const lapel = { ...pt, color: shade(pt.color, 0.9) };
  for (const x of [1, -1]) {
    const rings: Ring[] = [];
    for (let y = brk; y <= 1.445; y += 0.02) {
      const width = wide * smooth(brk, 1.36, y) * (1 - 0.5 * smooth(1.4, 1.45, y)) + 0.003;
      const ring = ringAt(base, y);
      const th = x * (gapAt(y) / 2 + width / (ring.rx + g));
      const s = surfaceAt(base, TORSO_BUMPS, y, th, g + 0.004);
      rings.push({ c: s.p, rx: width, rz: 0.0028, n: 3, f: s.n });
    }
    b.sweep(rings, { sides: 8, sub: 2, capStart: true, capEnd: true }, skin, lapel);
  }
  // The collar stands round the back of the neck over the shell's top, meeting the lapels at the sides.
  const neck = ringAt(base, NECK_TOP);
  const a0 = 1.05;
  loop(b, NECK_TOP - 0.006, neck.c[2], neck.rx + NECK_EASE + 0.011, neck.rz + NECK_EASE + 0.011, a0, TAU - 2 * a0, 0.008 + wide * 0.26, 0.0035, 0, lapel);
}

function tie(b: MeshBuilder, base: readonly Ring[], g: number): void {
  const skin = torsoSkin(b);
  const silk = paint(0x5a1010, KIND.woven, 0.42);
  const knot = surfaceAt(base, TORSO_BUMPS, 1.472, 0, g + 0.008);
  b.box(knot.p, [0.012, 0.011, 0.007], skin, silk, { round: 0.5 });
  const rings: Ring[] = [];
  for (const [y, half] of [[1.46, 0.011], [1.4, 0.015], [1.3, 0.02], [1.2, 0.024], [1.13, 0.026], [1.105, 0.016], [1.095, 0.004]] as const) {
    const s = surfaceAt(base, TORSO_BUMPS, y, 0, g + 0.005);
    rings.push({ c: s.p, rx: half, rz: 0.0022, n: 4, f: s.n });
  }
  b.sweep(rings, { sides: 8, sub: 2 }, skin, silk);
}

/** Tank / singlet straps over the shoulders. */
function straps(b: MeshBuilder, base: readonly Ring[], top: number, g: number, width: number, pt: Paint): void {
  const skin = torsoSkin(b);
  // Where the trapezius is 8 cm off centre: the strap crosses the shoulder there.
  let ty = 1.44;
  while (ty < 1.52 && ringAt(base, ty).rx > 0.08) ty += 0.002;
  const sh = ringAt(base, ty);
  for (const x of [1, -1]) {
    const front = surfaceAt(base, TORSO_BUMPS, top - 0.004, x * 0.52, g + 0.002);
    const back = surfaceAt(base, TORSO_BUMPS, top + 0.02, x * (Math.PI - 0.52), g + 0.002);
    const mid: V = [x * 0.075, ty + g + 0.003, sh.c[2]];
    const rings: Ring[] = [
      { c: front.p, rx: width / 2, rz: 0.0022, n: 3, f: front.n },
      { c: [lerp(front.p[0], mid[0], 0.5), lerp(front.p[1], mid[1], 0.7), lerp(front.p[2], mid[2], 0.4)], rx: width / 2, rz: 0.0022, n: 3, f: norm([0, 1, 0.8]) },
      { c: mid, rx: width / 2, rz: 0.0022, n: 3, f: [0, 1, 0] },
      { c: [lerp(back.p[0], mid[0], 0.5), lerp(back.p[1], mid[1], 0.7), lerp(back.p[2], mid[2], 0.4)], rx: width / 2, rz: 0.0022, n: 3, f: norm([0, 1, -0.8]) },
      { c: back.p, rx: width / 2, rz: 0.0022, n: 3, f: back.n },
    ];
    b.sweep(rings, { sides: 8, sub: 3, side: [1, 0, 0] }, skin, pt);
  }
}

/** An apron hangs flat from the bust or belly, whichever sticks out most, down to the knee. */
function apron(b: MeshBuilder, base: readonly Ring[], color: number): void {
  const skin = torsoSkin(b);
  const pt = paint(color, KIND.woven, 0.85);
  const body = clip(base, 0.88, 1.36);
  // The front of each ring with its belly and chest bulges; the panel's plane sits just ahead of the furthest.
  const front = Math.max(...body.map((r) => r.c[2] + r.rz * (1 + Math.max(0, ...(r.h ?? []).slice(0, 3))))) + 0.03;
  const hang = (r: Ring, y: number): Ring => ({
    c: [0, y, r.c[2]], rx: r.rx * (1 + Math.max(0, ...(r.h ?? []).slice(1, 3)) * 0.4) + 0.03, rz: front - r.c[2], n: 2.8, gap: TAU - 1.9, thick: 0.003,
  });
  const hip = ringAt(base, 0.88);
  const rings = [0.62, 0.72, 0.8].map((y) => hang(hip, y)).concat(body.map((r) => hang(r, r.c[1])));
  b.sweep(rings, { sides: 18, sub: 2, shape: 'band', phase: Math.PI }, skin, pt);
  const strap = { ...pt, color: shade(color, 0.92) };
  for (const x of [1, -1]) {
    const corner = surfaceAt(base, TORSO_BUMPS, 1.355, x * 0.9, 0.034);
    const neck: V = [x * 0.068, 1.492, -0.02];
    const back: V = [x * 0.02, 1.5, -0.075];
    b.sweep([
      { c: corner.p, rx: 0.008, rz: 0.002, n: 3, f: corner.n },
      { c: neck, rx: 0.008, rz: 0.002, n: 3, f: norm([x, 1, 0]) },
      { c: back, rx: 0.008, rz: 0.002, n: 3, f: [0, 0.3, -1] },
    ], { sides: 6, sub: 3 }, skin, strap);
    const tieAt = surfaceAt(base, TORSO_BUMPS, 1.06, x * (Math.PI - 0.12), 0.012);
    b.sweep([
      { c: tieAt.p, rx: 0.009, rz: 0.0018, n: 3, f: tieAt.n },
      { c: add(tieAt.p, [x * 0.01, -0.06, -0.006]), rx: 0.008, rz: 0.0018, n: 3, f: tieAt.n },
      { c: add(tieAt.p, [x * 0.016, -0.12, -0.008]), rx: 0.007, rz: 0.0018, n: 3, f: tieAt.n },
    ], { sides: 6, sub: 2 }, skin, strap);
  }
}

/** How far open a crew neck is at height y: 0 below CREW_LOW, 1 at the neckline (the inverse is used for its rib). */
function scoop(y: number): number {
  return Math.max(0, Math.min(1, (y - CREW_LOW) / (NECK_TOP - CREW_LOW))) ** 0.7;
}

/** A button: a flat disc facing `s.n`. */
function disc(b: MeshBuilder, s: { p: V; n: V }, r: number, pt: Paint): void {
  b.ellipsoid(s.p, [r, r, 0.0016], torsoSkin(b), pt, { segs: 10, rot: [0, Math.atan2(s.n[0], s.n[2]), 0] });
}

