/**
 * Tops as data. A top decides the Dress (torso colour, neckline, sleeves)
 * and adds detail parts. Open tops are an outer shell with a front gap over
 * an inner colour (topAccent); an apron is a panel over an `under` top.
 */
import type { TopStyle } from '../../core/types';
import type { WidthFactors } from '../rig/skeleton';
import { FULL_NECKLINE, torsoSections, type Dress, type Look, type Section } from './body';
import { MeshBuilder, shade } from './MeshBuilder';

interface TopColors {
  base: number;
  inner?: number;
}

type Detail = (b: MeshBuilder, c: TopColors, look: Look) => void;

interface TopSpec {
  arm: number;
  neckline?: number;
  /** Front gap (radians) of an outer layer, used when there is an inner colour. */
  open?: number;
  innerDefault?: number;
  /** Sleeves belong to the inner layer (a vest over a tee). */
  innerSleeves?: boolean;
  details: readonly Detail[];
}

/** Front (+z) surface depth of the torso at height y above `bone`'s joint, x off-centre. */
function surfaceZ(w: WidthFactors, bone: Section['bone'], y: number, x = 0): number {
  const s = torsoSections(w).find((q) => q.bone === bone && y >= q.y0 && y <= q.y1) ?? torsoSections(w)[2];
  const t = (y - s.y0) / (s.y1 - s.y0);
  const r = s.r0 + (s.r1 - s.r0) * t;
  return r * s.depth * Math.sqrt(Math.max(0, 1 - (x / r) ** 2));
}

const crewNeck: Detail = (b, c) => {
  b.ring('chest', b.at('chest', 0, 0.222, 0.004), 0.066, 0.008, shade(c.base, 0.85), { rot: [Math.PI / 2, 0, 0] });
};

const collar: Detail = (b, c) => {
  const w = b.p.w;
  for (const x of [1, -1]) {
    const z = surfaceZ(w, 'chest', 0.21, 0.045);
    b.box('chest', b.at('chest', 0.045 * x, 0.215, z + 0.006), [0.06, 0.035, 0.01], c.base, { rot: [-0.5, 0, 0.6 * x] });
  }
  b.box('chest', b.at('chest', 0, 0.24, -0.055), [0.1, 0.035, 0.012], c.base, { rot: [0.3, 0, 0] });
};

const placket: Detail = (b, c, look) => {
  if (look.topAccent !== undefined) return;
  b.box('chest', b.at('chest', 0, 0.06, surfaceZ(b.p.w, 'chest', 0.06) + 0.004), [0.018, 0.2, 0.006], shade(c.base, 0.8));
};

const FLOWERS: readonly (readonly [Section['bone'], number, number, number])[] = [
  ['chest', 0.07, 0.1, 1], ['chest', -0.09, 0.02, 1], ['spine', 0.03, 0.08, 1], ['spine', -0.08, 0.16, 1],
  ['spine', 0.09, -0.01, 1], ['chest', 0.02, 0.08, -1], ['chest', -0.1, -0.01, -1], ['spine', 0.08, 0.1, -1],
  ['spine', -0.04, 0.02, -1],
];

const flowers: Detail = (b, c) => {
  const w = b.p.w;
  const color = c.inner ?? 0xf2d23c;
  for (const [bone, x, y, dir] of FLOWERS) {
    const z = surfaceZ(w, bone, y, x * w.torso) * dir;
    b.ball(bone, b.at(bone, x * w.torso, y, z), [0.03, 0.03, 0.012], color, { segs: 6, rot: [0, Math.atan2(x, z * 1.5), 0] });
  }
};

const straps = (width: number): Detail => (b, c) => {
  const w = b.p.w;
  for (const x of [0.085 * w.shoulder, -0.085 * w.shoulder]) {
    const z = surfaceZ(w, 'chest', 0.12, x) + 0.004;
    const top = b.at('chest', x, 0.235, 0);
    b.tube('chest', b.at('chest', x, 0.11, z), top, width, width, c.base, { sides: 6, depth: 0.3 });
    b.tube('chest', top, b.at('chest', x, 0.11, -z), width, width, c.base, { sides: 6, depth: 0.3 });
  }
};

const lapels: Detail = (b, c) => {
  const w = b.p.w;
  for (const x of [1, -1]) {
    const z = surfaceZ(w, 'chest', 0.1, 0.05) + 0.016;
    b.box('chest', b.at('chest', 0.05 * x, 0.1, z), [0.035, 0.17, 0.01], shade(c.base, 0.75), { rot: [-0.12, 0, -0.25 * x] });
  }
};

const tie: Detail = (b) => {
  const z = surfaceZ(b.p.w, 'chest', 0.06) + 0.01;
  b.box('chest', b.at('chest', 0, 0.2, z + 0.004), [0.03, 0.03, 0.02], 0x4a0c0c);
  b.box('chest', b.at('chest', 0, 0.06, z), [0.036, 0.25, 0.008], 0x5a1010);
};

const TOP_SPECS: Record<Exclude<TopStyle, 'apron'>, TopSpec> = {
  tshirt: { arm: 0.3, details: [crewNeck] },
  shirt: { arm: 1, open: 0.8, details: [collar, placket] },
  hawaiian: { arm: 0.32, details: [collar, flowers] },
  tank: { arm: 0, neckline: 0.12, details: [straps(0.022)] },
  singlet: { arm: 0, neckline: 0.1, details: [straps(0.01)] },
  vest: { arm: 0.3, open: 1.3, innerDefault: 0xe8e8e8, innerSleeves: true, details: [crewNeck] },
  jacket: { arm: 1, open: 0.9, innerDefault: 0xe8e8e8, details: [lapels] },
  leather: { arm: 0.78, open: 0.9, innerDefault: 0xa01818, details: [lapels] },
  suit: { arm: 1, open: 0.55, innerDefault: 0xe0e0e0, details: [lapels, tie] },
};

interface ResolvedTop {
  spec: TopSpec;
  colors: TopColors;
  open: boolean;
}

function resolve(look: Look): ResolvedTop {
  const apron = look.top === 'apron';
  const key = apron ? look.under ?? 'tshirt' : look.top;
  const spec = TOP_SPECS[key === 'apron' ? 'tshirt' : key];
  const base = apron ? look.topAccent ?? 0xf0f0f0 : look.topColor;
  const inner = apron ? undefined : look.topAccent ?? spec.innerDefault;
  return { spec, colors: { base, inner }, open: spec.open !== undefined && inner !== undefined };
}

export function topDress(look: Look): Pick<Dress, 'torso' | 'neckline' | 'arm' | 'sleeve'> {
  const { spec, colors, open } = resolve(look);
  const inner = colors.inner ?? colors.base;
  return {
    torso: open ? inner : colors.base,
    neckline: spec.neckline ?? FULL_NECKLINE,
    arm: spec.arm,
    sleeve: open && spec.innerSleeves ? inner : colors.base,
  };
}

export function buildTop(b: MeshBuilder, look: Look): void {
  const { spec, colors, open } = resolve(look);
  if (open) shell(b, colors.base, spec.open!);
  for (const d of spec.details) d(b, colors, look);
  if (look.top === 'apron') apron(b, look.topColor);
}

/** Outer layer from the hips up, open at the front by `gap` radians. */
function shell(b: MeshBuilder, color: number, gap: number): void {
  const theta = [gap / 2, Math.PI * 2 - gap] as const;
  for (const s of torsoSections(b.p.w)) {
    const y0 = s.bone === 'hips' ? -0.03 : s.y0;
    const t0 = (y0 - s.y0) / (s.y1 - s.y0);
    const r0 = s.r0 + (s.r1 - s.r0) * t0;
    b.tube(s.bone, b.at(s.bone, 0, y0), b.at(s.bone, 0, s.y1), r0 + 0.014, s.r1 + 0.014, color, { depth: s.depth, theta, open: true });
  }
}

function apron(b: MeshBuilder, color: number): void {
  const w = b.p.w;
  const zc = surfaceZ(w, 'chest', 0.05) + 0.008;
  const zh = surfaceZ(w, 'hips', 0) + 0.02;
  b.box('chest', b.at('chest', 0, 0.06, zc), [0.2 * w.torso, 0.2, 0.01], color);
  b.box('hips', b.at('hips', 0, -0.17, zh), [0.3 * w.hip, 0.42, 0.012], color);
  straps(0.009)(b, { base: shade(color, 0.9) }, {} as Look);
  const back = -surfaceZ(w, 'hips', 0.04) - 0.01;
  for (const x of [0.03, -0.03]) b.box('hips', b.at('hips', x, 0.0, back), [0.018, 0.12, 0.01], shade(color, 0.9), { rot: [0, 0, x * 8] });
}
