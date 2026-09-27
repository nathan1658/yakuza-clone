/**
 * Sign atlas: every distinct board face drawn once into a mask texture.
 * R = letters (tube core, or light-box lettering), G = glow round them,
 * B = border tube or frame, A = board silhouette. Colours live on the mesh,
 * so one mask serves every colourway. Browser only (canvas, document.fonts).
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, UnsignedByteType } from 'three';
import { textCells } from '../data/signs';
import type { SignDef } from '../data/signs';

export interface AtlasRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

export interface SignAtlas {
  readonly texture: DataTexture;
  /** Where `sign`'s face lives; v0 is the top edge of the board. */
  rect(sign: SignDef): AtlasRect;
}

const WIDTH = 2048;
const MAX_HEIGHT = 4096;
const GUTTER = 4;
/** Pixels per metre of board, and the cap on a board's longest side. */
const DENSITY = 96;
const MAX_SIDE = 640;
const FONT_TIMEOUT_MS = 2500;

const FAMILY = {
  sans: '"Noto Sans TC", "PingFang TC", "Heiti TC", sans-serif',
  serif: '"Noto Serif TC", "Songti TC", serif',
} as const;

/** Tubes are thin strokes, light-box letters heavy ones. Serif TC only ships 700 and 900. */
function weight(s: SignDef): number {
  if (s.kind === 'box') return 900;
  return s.font === 'serif' ? 700 : 400;
}

const keyOf = (s: SignDef): string =>
  `${s.shape}|${s.kind}|${s.font}|${s.vertical ? 'v' : 'h'}|${(s.w / s.h).toFixed(2)}|${s.text}`;

/** Fetch the glyphs the signs use; gives up after a timeout and lets the fallback fonts draw. */
export async function loadSignFonts(signs: readonly SignDef[]): Promise<void> {
  const text = [...new Set(signs.map((s) => s.text).join(''))].join('');
  const faces = ['400 64px "Noto Sans TC"', '900 64px "Noto Sans TC"', '700 64px "Noto Serif TC"', '900 64px "Noto Serif TC"'];
  const all = Promise.allSettled(faces.map((f) => document.fonts.load(f, text)));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS))]);
}

interface Entry {
  readonly sign: SignDef;
  w: number;
  h: number;
  x: number;
  y: number;
}

/** Shelf-pack at `scale`; false if it would not fit. */
function pack(entries: Entry[], scale: number): number | null {
  let x = 0;
  let y = 0;
  let row = 0;
  for (const e of entries) {
    const density = Math.min(DENSITY, MAX_SIDE / Math.max(e.sign.w, e.sign.h)) * scale;
    e.w = Math.max(8, Math.ceil(e.sign.w * density));
    e.h = Math.max(8, Math.ceil(e.sign.h * density));
    if (x + e.w + GUTTER > WIDTH) {
      y += row;
      x = 0;
      row = 0;
    }
    e.x = x + GUTTER / 2;
    e.y = y + GUTTER / 2;
    x += e.w + GUTTER;
    row = Math.max(row, e.h + GUTTER);
  }
  const height = y + row;
  return height <= MAX_HEIGHT ? height : null;
}

type Layer = 'letters' | 'glow' | 'border' | 'shape';
const CHANNEL: Readonly<Record<Layer, number>> = { letters: 0, glow: 1, border: 2, shape: 3 };

/** One character per cell, centred; Latin letters get narrow cells as in textCells. */
function drawText(ctx: CanvasRenderingContext2D, s: SignDef, w: number, h: number): void {
  const chars = [...s.text];
  const cell = s.vertical ? Math.min(w / 1.4, h / (chars.length + 0.4)) : Math.min(h / 1.4, w / (textCells(s.text) + 0.4));
  ctx.font = `${weight(s)} ${Math.round(cell * 0.84)}px ${FAMILY[s.font]}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (s.vertical) {
    const top = (h - chars.length * cell) / 2;
    chars.forEach((ch, i) => ctx.fillText(ch, w / 2, top + (i + 0.5) * cell));
    return;
  }
  let at = (w - textCells(s.text) * cell) / 2;
  for (const ch of chars) {
    const adv = textCells(ch) * cell;
    ctx.fillText(ch, at + adv / 2, h / 2, adv * 0.96);
    at += adv;
  }
}

/** The pawnbroker's bat, wings spread over its coin, in a unit square (y down). */
function batPath(ctx: CanvasRenderingContext2D, size: number): void {
  const p = (x: number, y: number): [number, number] => [x * size, y * size];
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const X = (x: number): number => 0.5 + side * x;
    ctx.moveTo(...p(X(0.04), 0.3));
    ctx.quadraticCurveTo(...p(X(0.24), 0.02), ...p(X(0.48), 0.1));
    // Scalloped trailing edge, tip back to the body.
    ctx.quadraticCurveTo(...p(X(0.42), 0.2), ...p(X(0.44), 0.3));
    ctx.quadraticCurveTo(...p(X(0.34), 0.24), ...p(X(0.3), 0.34));
    ctx.quadraticCurveTo(...p(X(0.2), 0.26), ...p(X(0.14), 0.36));
    ctx.quadraticCurveTo(...p(X(0.08), 0.28), ...p(X(0.04), 0.3));
    ctx.closePath();
  }
  // Body and head with ears.
  ctx.moveTo(...p(0.56, 0.24));
  ctx.ellipse(0.5 * size, 0.24 * size, 0.06 * size, 0.1 * size, 0, 0, Math.PI * 2);
  ctx.moveTo(...p(0.45, 0.12));
  ctx.lineTo(...p(0.46, 0.04));
  ctx.lineTo(...p(0.49, 0.1));
  ctx.lineTo(...p(0.51, 0.1));
  ctx.lineTo(...p(0.54, 0.04));
  ctx.lineTo(...p(0.55, 0.12));
  ctx.closePath();
}

const COIN = { x: 0.5, y: 0.6, r: 0.28 } as const;

function drawBat(ctx: CanvasRenderingContext2D, s: SignDef, w: number, h: number, layer: Layer): void {
  const size = Math.min(w, h);
  ctx.translate((w - size) / 2, (h - size) / 2);
  const coin = (r: number): void => {
    ctx.beginPath();
    ctx.arc(COIN.x * size, COIN.y * size, r * size, 0, Math.PI * 2);
  };
  const tube = Math.max(2, size * 0.02);
  if (layer === 'shape') {
    batPath(ctx, size);
    ctx.fill();
    ctx.lineWidth = tube * 3;
    ctx.stroke();
    coin(COIN.r + 0.02);
    ctx.fill();
    return;
  }
  if (layer === 'border' || layer === 'glow') {
    ctx.lineWidth = tube;
    batPath(ctx, size);
    ctx.stroke();
    coin(COIN.r);
    ctx.stroke();
    coin(COIN.r * 0.8);
    ctx.stroke();
  }
  if (layer === 'letters' || layer === 'glow') {
    ctx.font = `${weight(s)} ${Math.round(size * 0.3)}px ${FAMILY[s.font]}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.text, COIN.x * size, COIN.y * size);
  }
}

function drawBoard(ctx: CanvasRenderingContext2D, s: SignDef, w: number, h: number, layer: Layer): void {
  const cell = Math.min(w, h) / 1.4;
  if (layer === 'shape') {
    ctx.fillRect(-GUTTER / 2, -GUTTER / 2, w + GUTTER, h + GUTTER);
    return;
  }
  if (layer === 'border' || (layer === 'glow' && s.kind === 'neon')) {
    // A neon border tube inset from the edge; a light box's metal frame at the edge.
    const inset = s.kind === 'neon' ? cell * 0.1 : cell * 0.04;
    ctx.lineWidth = Math.max(2, cell * (s.kind === 'neon' ? 0.035 : 0.08));
    ctx.beginPath();
    ctx.roundRect(inset, inset, w - 2 * inset, h - 2 * inset, s.kind === 'neon' ? cell * 0.12 : 0);
    ctx.stroke();
  }
  if (layer === 'letters' || (layer === 'glow' && s.kind === 'neon')) drawText(ctx, s, w, h);
}

function drawLayer(ctx: CanvasRenderingContext2D, e: Entry, layer: Layer): void {
  const s = e.sign;
  ctx.save();
  ctx.translate(GUTTER / 2, GUTTER / 2);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  if (layer === 'glow') {
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = Math.min(e.w, e.h) * 0.09;
  }
  if (s.shape === 'bat') drawBat(ctx, s, e.w, e.h, layer);
  else drawBoard(ctx, s, e.w, e.h, layer);
  ctx.restore();
}

export function createSignAtlas(signs: readonly SignDef[]): SignAtlas {
  const byKey = new Map<string, Entry>();
  for (const s of signs) {
    const key = keyOf(s);
    const had = byKey.get(key);
    if (!had || s.w * s.h > had.sign.w * had.sign.h) byKey.set(key, { sign: s, w: 0, h: 0, x: 0, y: 0 });
  }
  const tall = (e: Entry): number => e.sign.h * Math.min(DENSITY, MAX_SIDE / Math.max(e.sign.w, e.sign.h));
  const entries = [...byKey.values()].sort((a, b) => tall(b) - tall(a));

  let scale = 1;
  let height = pack(entries, scale);
  while (height === null) {
    scale *= 0.9;
    height = pack(entries, scale);
  }
  height = Math.ceil(height / 4) * 4;

  const data = new Uint8Array(WIDTH * height * 4);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(...entries.map((e) => e.w)) + GUTTER;
  canvas.height = Math.max(...entries.map((e) => e.h)) + GUTTER;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('signAtlas: no 2d context');

  for (const e of entries) {
    const sw = e.w + GUTTER;
    const sh = e.h + GUTTER;
    const ox = e.x - GUTTER / 2;
    const oy = e.y - GUTTER / 2;
    for (const layer of ['letters', 'glow', 'border', 'shape'] as const) {
      ctx.clearRect(0, 0, sw, sh);
      drawLayer(ctx, e, layer);
      const px = ctx.getImageData(0, 0, sw, sh).data;
      const c = CHANNEL[layer];
      for (let y = 0; y < sh; y++) {
        let src = y * sw * 4 + 3;
        let dst = ((oy + y) * WIDTH + ox) * 4 + c;
        for (let x = 0; x < sw; x++, src += 4, dst += 4) data[dst] = Math.max(data[dst], px[src]);
      }
    }
  }

  const texture = new DataTexture(data, WIDTH, height, RGBAFormat, UnsignedByteType);
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return {
    texture,
    rect(sign) {
      const e = byKey.get(keyOf(sign));
      if (!e) throw new Error(`signAtlas: ${sign.text} was not in the atlas`);
      return { u0: e.x / WIDTH, v0: e.y / height, u1: (e.x + e.w) / WIDTH, v1: (e.y + e.h) / height };
    },
  };
}
