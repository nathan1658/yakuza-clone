/**
 * The big screen on N13 over the junction (VIDEO_SCREEN): a 512×288 canvas
 * redrawn 12 times a second with a loop of spots, the last of them the
 * weather board, which hoists the amber rainstorm signal when it pours.
 * Browser only.
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { VIDEO_SCREEN } from '../data/layout';
import type { Batcher } from '../rendering/Batcher';
import type { LightSource } from '../rendering/LightRig';
import type { MatKey } from '../rendering/materials';

const W = 512;
const H = 288;
const FPS = 12;
/** Seconds each spot runs, and of the wipe that cuts it in. */
const SPOT = 7;
const WIPE = 0.3;
/** The panel runs hot: its brights clear the bloom threshold. */
const GAIN = 1.4;
const SANS = '"Noto Sans TC", "PingFang TC", "Heiti TC", sans-serif';
const SERIF = '"Noto Serif TC", "Songti TC", serif';
/** 22:47 when the game starts, then a minute per real minute. */
const CLOCK_START = 22 * 60 + 47;
const TEXT =
  '崇光週年慶全場貨品低至七折一連十四天天王巨星紅館演唱會十二月連開九場門票現已發售' +
  '東方銀行置業按揭高達九成氣溫濕度°C間中有驟雨天色良好黃色暴雨警告信號請留意天氣報告';

/** The screen washes the street below it. Its picture changes; the rig's light does not. */
export const SCREEN_LIGHT: LightSource = {
  x: VIDEO_SCREEN.x,
  y: VIDEO_SCREEN.y - VIDEO_SCREEN.h / 2 - 1,
  z: VIDEO_SCREEN.z + 3,
  color: 0xb4c8ff,
  intensity: 45,
};

type Spot = (g: CanvasRenderingContext2D, t: number, rain: number, clock: number) => void;

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = canvas.getContext('2d');
  if (!g) throw new Error('videoScreen: no 2d context');
  return g;
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string): void {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/** Sogo's anniversary sale: gold on red, confetti, the headline zooming in. */
function sale(g: CanvasRenderingContext2D, t: number): void {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#b3121f');
  bg.addColorStop(1, '#5c0610');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = i % 3 ? '#f6d27a' : '#fff3c4';
    g.fillRect((i * 97.3) % W, ((i * 53.7 + t * (30 + (i % 7) * 9)) % (H + 20)) - 10, 3, 6);
  }
  const zoom = 1 + 0.35 * Math.max(0, 1 - t / 0.6) ** 2;
  g.save();
  g.translate(W / 2, 108);
  g.scale(zoom, zoom);
  label(g, '崇光週年慶', 0, 0, `900 80px ${SERIF}`, '#f6d27a');
  g.restore();
  label(g, '全場貨品 低至七折', W / 2, 192, `700 38px ${SANS}`, '#ffffff');
  if (Math.floor(t * 2) % 2 === 1) return;
  g.fillStyle = '#f6d27a';
  g.fillRect(146, 230, 220, 38);
  label(g, '一連十四天', W / 2, 249, `900 26px ${SANS}`, '#8a0f14');
}

/** A Coliseum concert: follow-spots sweeping over the bill. */
function concert(g: CanvasRenderingContext2D, t: number): void {
  g.fillStyle = '#0c0820';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    g.save();
    g.translate(W * (0.25 + 0.25 * i), -20);
    g.rotate(Math.sin(t * 1.3 + i * 2.1) * 0.5);
    const beam = g.createLinearGradient(0, 0, 0, H + 40);
    beam.addColorStop(0, 'rgba(255, 240, 200, 0.5)');
    beam.addColorStop(1, 'rgba(255, 110, 220, 0)');
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(-6, 0);
    g.lineTo(6, 0);
    g.lineTo(90, H + 40);
    g.lineTo(-90, H + 40);
    g.fill();
    g.restore();
  }
  g.globalCompositeOperation = 'source-over';
  label(g, '天王巨星', W / 2, 84, `900 66px ${SANS}`, '#ffe9a8');
  label(g, '紅館演唱會', W / 2, 158, `900 56px ${SANS}`, '#ff6fd0');
  label(g, '十二月 連開九場 門票現已發售', W / 2, 236, `700 26px ${SANS}`, '#ffffff');
}

/** The bank behind half the adverts in town: a flat-price chart drawing itself in. */
function bank(g: CanvasRenderingContext2D, t: number): void {
  g.fillStyle = '#0a2a52';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  g.lineWidth = 1;
  g.beginPath();
  for (let y = 160; y <= 272; y += 28) {
    g.moveTo(40, y);
    g.lineTo(472, y);
  }
  g.stroke();
  g.strokeStyle = '#ffd24a';
  g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i <= Math.min(12, Math.floor(t * 4)); i++) {
    const y = 262 - 100 * (i / 12) ** 1.6 + 8 * Math.sin(i * 1.7);
    if (i === 0) g.moveTo(40, y);
    else g.lineTo(40 + i * 36, y);
  }
  g.stroke();
  label(g, '東方銀行', W / 2, 56, `900 56px ${SERIF}`, '#ffffff');
  label(g, '置業按揭 高達九成', W / 2, 118, `700 36px ${SANS}`, '#ffd24a');
}

/** The amber rainstorm signal: an amber tile with a cloud and rain. */
function rainstormSignal(g: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  g.fillStyle = '#f2b705';
  g.beginPath();
  g.roundRect(x, y, size, size, size * 0.14);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (const [cx, cy, r] of [[0.36, 0.42, 0.16], [0.56, 0.36, 0.2], [0.72, 0.46, 0.13]] as const) {
    g.moveTo(x + (cx + r) * size, y + cy * size);
    g.arc(x + cx * size, y + cy * size, r * size, 0, Math.PI * 2);
  }
  g.fill();
  g.strokeStyle = '#1d4fa3';
  g.lineWidth = size * 0.05;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    g.moveTo(x + (0.3 + i * 0.13) * size, y + 0.64 * size);
    g.lineTo(x + (0.25 + i * 0.13) * size, y + 0.86 * size);
  }
  g.stroke();
}

/** Time, temperature and humidity; the rainstorm signal when it pours. */
function weather(g: CanvasRenderingContext2D, t: number, rain: number, clock: number): void {
  g.fillStyle = '#05070a';
  g.fillRect(0, 0, W, H);
  const minutes = CLOCK_START + Math.floor(clock / 60);
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  label(g, `${hh}${t % 1 < 0.5 ? ':' : ' '}${mm}`, 148, 84, `700 84px ${SANS}`, '#f4f1e6');
  label(g, '氣溫 24°C', 376, 62, `700 34px ${SANS}`, '#9fd3ff');
  label(g, `濕度 ${rain > 0.1 ? 96 : 78}%`, 376, 110, `700 34px ${SANS}`, '#9fd3ff');
  if (rain < 0.6) {
    label(g, rain > 0.1 ? '間中有驟雨' : '天色良好', W / 2, 212, `700 40px ${SANS}`, '#ffffff');
    return;
  }
  if (t % 1 < 0.75) rainstormSignal(g, 44, 170, 84);
  label(g, '黃色暴雨警告信號', 318, 196, `900 36px ${SANS}`, '#f2b705');
  label(g, '請留意天氣報告', 318, 244, `700 26px ${SANS}`, '#ffffff');
}

/** A bright bar rolling down as a spot cuts in, the old picture blacked out ahead of it. */
function wipe(g: CanvasRenderingContext2D, k: number): void {
  const y = k * H;
  const bar = g.createLinearGradient(0, y - 40, 0, y);
  bar.addColorStop(0, 'rgba(255, 255, 255, 0)');
  bar.addColorStop(1, 'rgba(255, 255, 255, 0.8)');
  g.fillStyle = bar;
  g.fillRect(0, y - 40, W, 40);
  g.fillStyle = '#000000';
  g.fillRect(0, y, W, H - y);
}

/** The panel's pixel pitch, laid over every frame. */
function pixelGrid(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = context2d(c);
  g.fillStyle = 'rgba(0, 0, 0, 0.3)';
  for (let x = 2; x < W; x += 3) g.fillRect(x, 0, 1, H);
  for (let y = 2; y < H; y += 3) g.fillRect(0, y, W, 1);
  return c;
}

const SPOTS: readonly Spot[] = [sale, concert, bank, weather];

export interface VideoScreen {
  readonly mesh: Mesh;
  update(realElapsed: number, rain: number): void;
}

/** The screen, and in the batch the bezel it hangs in. */
export function createVideoScreen(b: Batcher<MatKey>): VideoScreen {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = context2d(canvas);
  const grid = pixelGrid();
  for (const face of [`900 64px ${SANS}`, `700 64px ${SANS}`, `900 64px ${SERIF}`]) {
    void document.fonts.load(face, TEXT).catch(() => undefined);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture });
  material.color.setScalar(GAIN);
  const { x, y, z, w, h } = VIDEO_SCREEN;
  const mesh = new Mesh(new PlaneGeometry(w, h), material);
  mesh.name = 'world:videoScreen';
  mesh.position.set(x, y, z + 0.08);
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  mesh.layers.enable(1);
  b.at('flat', x, z).color(0x121416).box(x, y, z - 0.02, w / 2 + 0.35, h / 2 + 0.35, 0.08);

  let last = -Infinity;
  return {
    mesh,
    update(t, rain) {
      if (t - last < 1 / FPS) return;
      last = t;
      const loop = t % (SPOTS.length * SPOT);
      const i = Math.floor(loop / SPOT);
      const local = loop - i * SPOT;
      SPOTS[i]!(g, local, rain, t);
      if (local < WIPE) wipe(g, local / WIPE);
      g.drawImage(grid, 0, 0);
      texture.needsUpdate = true;
    },
  };
}
