/**
 * Shop signs. Every street front gets a light box over its shops; tall
 * tong lau hang neon boards out over the pavement, office blocks wear one big
 * board up the facade. A handful of landmark signs are placed by hand first,
 * and the seeded ones never overlap them. Pure data: the atlas, meshes and
 * sign lights are all built from this table.
 */
import { LOTS } from './buildings';
import type { Lot } from './buildings';
import { SOGO } from './layout';
import type { Side } from './layout';
import { hashString, mulberry32, pick, range } from './rng';
import type { Rng } from './rng';

export type SignKind = 'neon' | 'box';
export type SignMode = 'steady' | 'flicker' | 'blink' | 'chaseX' | 'chaseY' | 'rotate';
export type SignShape = 'board' | 'bat';
export type SignFont = 'sans' | 'serif';

export interface SignDef {
  readonly text: string;
  readonly kind: SignKind;
  /** Characters run top to bottom. */
  readonly vertical: boolean;
  /** Board centre. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Yaw of the front face's normal; text reads along local +X. */
  readonly yaw: number;
  readonly w: number;
  readonly h: number;
  /** Board thickness. Two-sided boards stick out of a wall and read from both ways. */
  readonly depth: number;
  readonly twoSided: boolean;
  /** Local X of the wall a projecting board hangs from (brackets span the gap); 0 when flat on a wall. */
  readonly mount: number;
  /** Tube colour (neon) or letter colour (light box). */
  readonly color: number;
  readonly panel: number;
  readonly mode: SignMode;
  readonly font: SignFont;
  readonly shape: SignShape;
  /** 1 = fully lit, small = dead tubes nobody fixed. */
  readonly power: number;
  /** Seconds, so neighbours never blink in step. */
  readonly phase: number;
}

/** Nothing projects lower than this over a pavement (m). */
export const SIGN_CLEARANCE = 4.8;
const BRACKET = 0.35;
const PROJECT_DEPTH = 0.22;
const WALL_DEPTH = 0.14;
const FASCIA_Y = 3.85;
const FASCIA_CELL = 0.72;

const NAMES: readonly string[] = [
  '同興大押', '利昌當舖', '金城麻雀耍樂', '大三元麻雀', '富豪桑拿浴室', '皇宮桑拿', '萬利金行', '大興金行',
  '金龍酒樓', '鴻運酒樓', '好運海鮮酒家', '美華冰室', '新興冰室', '健生藥房', '仁心藥房', '華都時鐘酒店',
  '銀河夜總會', '夜巴黎夜總會', '星光卡拉OK', '金曲卡拉OK', '環球找換店', '通用找換', '祥記燒臘', '強記燒臘飯店',
  '德興士多', '發記士多', '利興電器', '新時代電器', '林師傅跌打', '李氏跌打醫館', '大發財務', '遊戲機中心',
  '桌球', '粥麵', '牛腩麵家', '涼茶', '鐘錶', '眼鏡', '洋服', '髮型屋', '地產', '旅行社', '按摩', '影音',
];

/** Office blocks: one big board each. */
const BIG_NAMES: readonly string[] = [
  '銀河夜總會', '夜巴黎', '星光卡拉OK', '金龍大酒樓', '環球貿易', '東方銀行', '大華珠寶', '新世紀影音', '皇冠酒店', '富豪夜總會',
];

const NEON: readonly number[] = [0xff2438, 0xff3c9a, 0xe040ff, 0x38e8ff, 0x3cff78, 0xffd23c, 0xff7a24, 0x4c78ff, 0xfff0d8];
const NEON_PANEL: readonly number[] = [0x141214, 0x1c0c0e, 0x0c1216, 0x16140c];
const BOX: readonly (readonly [panel: number, text: number])[] = [
  [0xf2ede0, 0xc81820],
  [0xf0c02a, 0xb01010],
  [0xb81414, 0xffe9a0],
  [0x1f6a3a, 0xf6f0e0],
  [0x1c3c8c, 0xffffff],
  [0xf2ede0, 0x183c9c],
  [0x121212, 0xf0c02a],
];

/** Width in cells: CJK characters are square, Latin letters narrow. */
export function textCells(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.charCodeAt(0) < 0x2e80 ? (ch === ' ' ? 0.35 : 0.62) : 1;
  return n;
}

/** Board size for `text` at `cell` metres per character, with a margin all round. */
function boardSize(text: string, vertical: boolean, cell: number): [w: number, h: number] {
  const pad = cell * 0.2;
  const long = (vertical ? [...text].length : textCells(text)) * cell + 2 * pad;
  const short = cell + 2 * pad;
  return vertical ? [short, long] : [long, short];
}

/** Outward normal and tangent of a lot's street face, plus the face line's fixed coordinate. */
interface Face {
  readonly nx: number;
  readonly nz: number;
  readonly tx: number;
  readonly tz: number;
  /** Tangent coordinate range along the face. */
  readonly a: number;
  readonly b: number;
  /** Point on the face at tangent coordinate s. */
  at(s: number): [x: number, z: number];
}

function faceOf(lot: Lot, side: Side): Face {
  const r = lot.rect;
  switch (side) {
    case 'N':
      return { nx: 0, nz: -1, tx: 1, tz: 0, a: r.x0, b: r.x1, at: (s) => [s, r.z0] };
    case 'S':
      return { nx: 0, nz: 1, tx: 1, tz: 0, a: r.x0, b: r.x1, at: (s) => [s, r.z1] };
    case 'E':
      return { nx: 1, nz: 0, tx: 0, tz: 1, a: r.z0, b: r.z1, at: (s) => [r.x1, s] };
    case 'W':
      return { nx: -1, nz: 0, tx: 0, tz: 1, a: r.z0, b: r.z1, at: (s) => [r.x0, s] };
  }
}

const yawOf = (dx: number, dz: number): number => Math.atan2(dx, dz);

interface Look {
  readonly kind: SignKind;
  readonly color: number;
  readonly panel: number;
  readonly font: SignFont;
}

function look(rng: Rng, neonChance: number): Look {
  if (rng() < neonChance) return { kind: 'neon', color: pick(rng, NEON), panel: pick(rng, NEON_PANEL), font: 'sans' };
  const [panel, color] = pick(rng, BOX);
  return { kind: 'box', color, panel, font: 'serif' };
}

function modeOf(rng: Rng, kind: SignKind, vertical: boolean, grit: number): SignMode {
  const r = rng();
  if (r < 0.08 + 0.25 * grit) return 'flicker';
  if (kind === 'box') return 'steady';
  if (r < 0.5) return 'steady';
  if (r < 0.62) return 'blink';
  return vertical ? 'chaseY' : 'chaseX';
}

/** Rough footprint of a board for overlap tests: centre, half extents in x/y/z. */
function overlaps(a: SignDef, b: SignDef): boolean {
  const ext = (s: SignDef): [number, number] => {
    const c = Math.abs(Math.cos(s.yaw));
    const n = Math.abs(Math.sin(s.yaw));
    // Width runs along local X = (cos yaw, -sin yaw); depth along the normal.
    return [(s.w / 2) * c + (s.depth / 2) * n, (s.w / 2) * n + (s.depth / 2) * c];
  };
  const [ax, az] = ext(a);
  const [bx, bz] = ext(b);
  const gap = 0.4;
  return (
    Math.abs(a.x - b.x) < ax + bx + gap &&
    Math.abs(a.z - b.z) < az + bz + gap &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap
  );
}

function place(out: SignDef[], sign: SignDef): boolean {
  if (out.some((s) => overlaps(s, sign))) return false;
  out.push(sign);
  return true;
}

/** A name that fits `maxCells` along the text direction, or null. */
function fittingName(rng: Rng, names: readonly string[], vertical: boolean, maxCells: number): string | null {
  for (let tries = 0; tries < 6; tries++) {
    const name = pick(rng, names);
    const cells = vertical ? [...name].length : textCells(name);
    if (cells <= maxCells) return name;
  }
  return null;
}

/** The light box over the shops, flush on the wall. */
function fascia(out: SignDef[], lot: Lot, f: Face, rng: Rng): void {
  const len = f.b - f.a;
  const name = fittingName(rng, NAMES, false, Math.floor((len - 1.2) / FASCIA_CELL));
  if (!name) return;
  const [w, h] = boardSize(name, false, FASCIA_CELL);
  if (FASCIA_Y + h / 2 > lot.height - 0.3) return;
  const s = (f.a + f.b) / 2 + range(rng, -1, 1) * Math.max(0, (len - w) / 2 - 0.6);
  const [px, pz] = f.at(s);
  const lk = look(rng, 0.3);
  place(out, {
    text: name,
    ...lk,
    vertical: false,
    x: px + f.nx * (WALL_DEPTH / 2 + 0.02),
    y: FASCIA_Y,
    z: pz + f.nz * (WALL_DEPTH / 2 + 0.02),
    yaw: yawOf(f.nx, f.nz),
    w,
    h,
    depth: WALL_DEPTH,
    twoSided: false,
    mount: 0,
    mode: modeOf(rng, lk.kind, false, lot.grit),
    shape: 'board',
    power: rng() < lot.grit * 0.25 ? 0.05 : 1,
    phase: rng() * 10,
  });
}

/** Boards hung out over the pavement on brackets, readable both ways along the street. */
function projecting(out: SignDef[], lot: Lot, f: Face, rng: Rng): void {
  const len = f.b - f.a;
  const count = Math.min(lot.backdrop ? 1 : 3, Math.floor(len / 4));
  for (let i = 0; i < count; i++) {
    const vertical = rng() < 0.72;
    const cell = vertical ? range(rng, 0.85, 1.25) : range(rng, 0.9, 1.2);
    const bottom = range(rng, SIGN_CLEARANCE + 0.2, 7.5);
    const room = lot.height - 0.6 - bottom;
    const maxCells = vertical ? Math.floor((room - 0.4 * cell) / cell) : Math.floor((4.2 - 0.4 * cell) / cell);
    if (maxCells < 2) continue;
    const name = fittingName(rng, NAMES, vertical, maxCells);
    if (!name) continue;
    const [w, h] = boardSize(name, vertical, cell);
    // The board stands edge-on to the wall: its width runs out along the normal.
    const s = f.a + ((i + 0.5) / count) * len + range(rng, -0.6, 0.6);
    const [px, pz] = f.at(s);
    const out0 = BRACKET + w / 2;
    const yaw = yawOf(f.tx, f.tz);
    const lk = look(rng, 0.62);
    place(out, {
      text: name,
      ...lk,
      vertical,
      x: px + f.nx * out0,
      y: bottom + h / 2,
      z: pz + f.nz * out0,
      yaw,
      w,
      h,
      depth: PROJECT_DEPTH,
      twoSided: true,
      mount: -out0 * (f.nx * Math.cos(yaw) - f.nz * Math.sin(yaw)),
      mode: modeOf(rng, lk.kind, vertical, lot.grit),
      shape: 'board',
      power: rng() < lot.grit * 0.2 ? 0.05 : 1,
      phase: rng() * 10,
    });
  }
}

/** Office blocks: one big board flat on the facade, a few floors up. */
function bigBoard(out: SignDef[], lot: Lot, f: Face, rng: Rng): void {
  const len = f.b - f.a;
  if (lot.height < 20 || len < 10) return;
  const name = pick(rng, BIG_NAMES);
  const cell = Math.min(2.6, (Math.min(len * 0.8, 16) - 0.8) / textCells(name));
  if (cell < 1.2) return;
  const [w, h] = boardSize(name, false, cell);
  const y = range(rng, 12, Math.min(lot.height - h, 28));
  const [px, pz] = f.at((f.a + f.b) / 2);
  const lk = look(rng, 0.75);
  place(out, {
    text: name,
    ...lk,
    vertical: false,
    x: px + f.nx * (WALL_DEPTH / 2 + 0.05),
    y,
    z: pz + f.nz * (WALL_DEPTH / 2 + 0.05),
    yaw: yawOf(f.nx, f.nz),
    w,
    h,
    depth: WALL_DEPTH,
    twoSided: false,
    mount: 0,
    mode: lk.kind === 'neon' ? pick(rng, ['steady', 'steady', 'chaseX', 'blink'] as const) : 'steady',
    shape: 'board',
    power: 1,
    phase: rng() * 10,
  });
}

const HALF_PI = Math.PI / 2;

/** Hand-placed landmarks: they go in first, so seeded signs keep clear of them. */
const LANDMARKS: readonly SignDef[] = [
  // Sogo's crown, facing the junction.
  {
    text: '崇光 SOGO', kind: 'box', vertical: false,
    x: (SOGO.sign.x0 + SOGO.sign.x1) / 2, y: (SOGO.sign.y0 + SOGO.sign.y1) / 2, z: SOGO.sign.z,
    yaw: Math.PI, w: SOGO.sign.x1 - SOGO.sign.x0, h: SOGO.sign.y1 - SOGO.sign.y0, depth: 0.6, twoSided: false, mount: 0,
    color: 0xe0101c, panel: 0xf2efe8, mode: 'steady', font: 'sans', shape: 'board', power: 0.8, phase: 0,
  },
  // The pawnshop bat holding its coin, and the shop's own board beneath it: first thing up Percy Street.
  {
    text: '押', kind: 'neon', vertical: true, x: -70.4, y: 9.9, z: -12, yaw: 0, w: 2.6, h: 2.6, depth: 0.3,
    twoSided: true, mount: -1.6, color: 0xff2430, panel: 0x2a0808, mode: 'rotate', font: 'serif', shape: 'bat', power: 1, phase: 0,
  },
  {
    text: '同興大押', kind: 'neon', vertical: true, x: -70.9, y: 6.7, z: -12, yaw: 0, w: 1.3, h: 3.6, depth: 0.22,
    twoSided: true, mount: -1.1, color: 0xffd23c, panel: 0x1c0c0e, mode: 'chaseY', font: 'serif', shape: 'board', power: 1, phase: 1.3,
  },
  // The cha chaan teng behind the counter at percy_cha_chaan_teng.
  {
    text: '美華冰室', kind: 'neon', vertical: false, x: -71.9, y: 5.6, z: -38.2, yaw: HALF_PI, w: 4.4, h: 1.25,
    depth: WALL_DEPTH, twoSided: false, mount: 0, color: 0x38e8ff, panel: 0x0c1216, mode: 'steady', font: 'sans', shape: 'board', power: 1, phase: 0,
  },
  {
    text: '凍檸茶 奶茶 菠蘿油', kind: 'box', vertical: false, x: -71.9, y: FASCIA_Y, z: -38.2, yaw: HALF_PI, w: 5.6, h: 0.8,
    depth: WALL_DEPTH, twoSided: false, mount: 0, color: 0xc81820, panel: 0xf2ede0, mode: 'steady', font: 'serif', shape: 'board', power: 1, phase: 0,
  },
  // The loan shark over substory_debt.
  {
    text: '大發財務', kind: 'box', vertical: false, x: -118, y: FASCIA_Y, z: 23.93, yaw: Math.PI, w: 3.6, h: 0.95,
    depth: WALL_DEPTH, twoSided: false, mount: 0, color: 0xf0c02a, panel: 0x121212, mode: 'flicker', font: 'serif', shape: 'board', power: 1, phase: 0,
  },
];

function buildSigns(): SignDef[] {
  const out: SignDef[] = [...LANDMARKS];
  for (const lot of LOTS) {
    if (!lot.front) continue;
    const rng = mulberry32(hashString(`sign:${lot.id}`));
    const f = faceOf(lot, lot.front);
    if (lot.style === 'tong' || lot.style === 'low') {
      projecting(out, lot, f, rng);
      fascia(out, lot, f, rng);
    } else {
      bigBoard(out, lot, f, rng);
      if (rng() < 0.6) fascia(out, lot, f, rng);
    }
  }
  return out;
}

export const SIGNS: readonly SignDef[] = buildSigns();
