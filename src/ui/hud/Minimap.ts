import { ZONE_NAMES } from '../../core/types';
import type { GameContext, QuestMarker, ZoneId } from '../../core/types';
import { el, setText } from '../dom';
import { newRadarPoint, radarHeading, radarMatrix, toRadar } from '../logic/radar';
import type { RadarPoint } from '../logic/radar';
import { renderMinimapArt } from './minimapArt';
import type { MinimapArt } from './minimapArt';

/** World metres from the centre to the rim. */
const RANGE_M = 55;
/** Radar radius as a fraction of the canvas width (the rest is room for 北). */
const RADIUS = 0.43;
const NORTH_FAR = 1e5;

const MARKER_COLOR: Readonly<Record<QuestMarker['kind'], string>> = {
  main: '#ff2a3d',
  substory: '#ffd23f',
  shop: '#ff2e88',
  save: '#22e6ff',
};

/**
 * Camera-up circular radar: the street plan is blitted with a single
 * transformed drawImage, markers and enemies are dots, off-radar story
 * markers become rim arrows.
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly zoneZh: HTMLSpanElement;
  private readonly zoneEn: HTMLSpanElement;
  private readonly p: RadarPoint = newRadarPoint();
  private art: MinimapArt | null = null;
  private zone: ZoneId | null = null;
  /** Device pixels: canvas width, radar radius, pixels per metre. */
  private w = 1;
  private r = 1;
  private k = 1;

  constructor(parent: HTMLElement, private readonly ctx: GameContext) {
    const root = el('div', 'yk-minimap', parent);
    this.canvas = el('canvas', 'yk-minimap-canvas', root);
    this.g = this.canvas.getContext('2d')!;
    const zone = el('div', 'yk-minimap-zone', root);
    this.zoneZh = el('span', 'yk-minimap-zone-zh', zone);
    this.zoneEn = el('span', 'yk-minimap-zone-en', zone);
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(64, Math.round(this.canvas.clientWidth * dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.w;
    this.r = this.w * RADIUS;
    this.k = this.r / RANGE_M;
  }

  /** Called from lateUpdate, after the camera rig has moved. */
  draw(clockSec: number): void {
    const { world, entities, cameraRig } = this.ctx;
    this.art ??= renderMinimapArt(world.getMinimapData());
    this.setZone(world.currentZone);
    const yaw = cameraRig.getYaw();
    const player = entities.player.position;
    const g = this.g;
    const c = this.w / 2;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.w, this.w);
    g.save();
    g.beginPath();
    g.arc(c, c, this.r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(8, 6, 12, 0.88)';
    g.fillRect(0, 0, this.w, this.w);
    this.drawPlan(yaw, player.x, player.z);
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.drawRings(c);
    this.drawLabels(yaw, player.x, player.z, c);
    this.drawEnemies(yaw, player.x, player.z, c);
    g.restore();
    this.drawRim(c);
    this.drawMarkers(yaw, player.x, player.z, c, clockSec);
    this.drawPlayer(c, radarHeading(entities.player.facing, yaw));
    this.drawNorth(yaw, c);
  }

  private setZone(zone: ZoneId): void {
    if (zone === this.zone) return;
    this.zone = zone;
    setText(this.zoneZh, ZONE_NAMES[zone].zh);
    setText(this.zoneEn, ZONE_NAMES[zone].en.toUpperCase());
  }

  private drawPlan(yaw: number, px: number, pz: number): void {
    const art = this.art!;
    const [a, b, cc, d] = radarMatrix(yaw, this.k);
    const g = this.g;
    g.setTransform(a, b, cc, d, this.w / 2, this.w / 2);
    g.translate(art.minX - px, art.minZ - pz);
    g.scale(1 / art.scale, 1 / art.scale);
    g.globalAlpha = 0.95;
    g.drawImage(art.image, 0, 0);
    g.globalAlpha = 1;
  }

  private drawRings(c: number): void {
    const g = this.g;
    g.strokeStyle = 'rgba(232, 181, 74, 0.12)';
    g.lineWidth = Math.max(1, this.w * 0.004);
    for (const f of [0.33, 0.66]) {
      g.beginPath();
      g.arc(c, c, this.r * f, 0, Math.PI * 2);
      g.stroke();
    }
  }

  private drawLabels(yaw: number, px: number, pz: number, c: number): void {
    const size = this.w * 0.05;
    for (const label of this.art!.labels) {
      const p = toRadar(label.x - px, label.z - pz, yaw, this.k, this.r, this.p);
      if (!p.clamped) this.glyph(label.text, c + p.x, c + p.y, size, 'rgba(244, 236, 216, 0.55)', 'sans');
    }
  }

  private drawEnemies(yaw: number, px: number, pz: number, c: number): void {
    const { combat } = this.ctx;
    if (!combat.inCombat) return;
    const g = this.g;
    g.fillStyle = '#ff2a3d';
    for (const e of combat.getActiveEnemies()) {
      if (!e.isAlive()) continue;
      const p = toRadar(e.position.x - px, e.position.z - pz, yaw, this.k, this.r * 0.96, this.p);
      g.beginPath();
      g.arc(c + p.x, c + p.y, this.w * (e.role === 'boss' ? 0.028 : 0.018), 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawRim(c: number): void {
    const g = this.g;
    g.lineWidth = Math.max(1.5, this.w * 0.012);
    g.strokeStyle = '#e8b54a';
    g.beginPath();
    g.arc(c, c, this.r, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = Math.max(1, this.w * 0.004);
    g.strokeStyle = 'rgba(255, 46, 136, 0.55)';
    g.beginPath();
    g.arc(c, c, this.r + this.w * 0.018, 0, Math.PI * 2);
    g.stroke();
  }

  private drawMarkers(yaw: number, px: number, pz: number, c: number, t: number): void {
    const rim = this.r - this.w * 0.035;
    for (const m of this.ctx.narrative.getActiveMarkers()) {
      const p = toRadar(m.position.x - px, m.position.z - pz, yaw, this.k, rim, this.p);
      const story = m.kind === 'main' || m.kind === 'substory';
      if (p.clamped && !story) continue;
      if (p.clamped) this.drawArrow(c, p, MARKER_COLOR[m.kind]);
      else this.drawMarker(c + p.x, c + p.y, m.kind, t);
    }
  }

  private drawMarker(x: number, y: number, kind: QuestMarker['kind'], t: number): void {
    const s = this.w * 0.03;
    if (kind === 'main') this.drawPulse(x, y, s, t);
    if (kind === 'save') {
      this.glyph('☎', x, y, s * 2.2, MARKER_COLOR.save, 'sans');
      return;
    }
    const g = this.g;
    g.beginPath();
    if (kind === 'shop') g.arc(x, y - s * 0.4, s * 0.75, 0, Math.PI * 2);
    else diamond(g, x, y, kind === 'main' ? s * 1.25 : s);
    g.fillStyle = MARKER_COLOR[kind];
    g.fill();
    g.lineWidth = Math.max(1, this.w * 0.008);
    g.strokeStyle = '#07060a';
    g.stroke();
  }

  /** Expanding ring behind the main-story marker. */
  private drawPulse(x: number, y: number, s: number, t: number): void {
    const g = this.g;
    const pulse = (t * 1.2) % 1;
    g.globalAlpha = 1 - pulse;
    g.lineWidth = Math.max(1, this.w * 0.008);
    g.strokeStyle = MARKER_COLOR.main;
    g.beginPath();
    g.arc(x, y, s * (1 + pulse * 1.6), 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  }

  private glyph(text: string, x: number, y: number, size: number, color: string, face: 'sans' | 'serif'): void {
    const g = this.g;
    g.font = face === 'serif'
      ? `900 ${Math.round(size)}px 'Noto Serif TC', serif`
      : `700 ${Math.round(size)}px 'Noto Sans TC', sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, x, y);
  }

  private drawArrow(c: number, p: RadarPoint, color: string): void {
    const g = this.g;
    const s = this.w * 0.035;
    g.setTransform(1, 0, 0, 1, c + p.x, c + p.y);
    g.rotate(p.angle);
    g.beginPath();
    g.moveTo(0, -s);
    g.lineTo(s * 0.8, s * 0.55);
    g.lineTo(-s * 0.8, s * 0.55);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.strokeStyle = '#07060a';
    g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawPlayer(c: number, heading: number): void {
    const g = this.g;
    const s = this.w * 0.045;
    g.setTransform(1, 0, 0, 1, c, c);
    g.rotate(heading);
    g.beginPath();
    g.moveTo(0, -s);
    g.lineTo(s * 0.7, s * 0.75);
    g.lineTo(0, s * 0.35);
    g.lineTo(-s * 0.7, s * 0.75);
    g.closePath();
    g.fillStyle = '#f4ecd8';
    g.fill();
    g.lineWidth = Math.max(1, this.w * 0.008);
    g.strokeStyle = '#c3122f';
    g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawNorth(yaw: number, c: number): void {
    const p = toRadar(0, -NORTH_FAR, yaw, this.k, this.r, this.p);
    const g = this.g;
    const s = this.w * 0.055;
    g.beginPath();
    g.arc(c + p.x, c + p.y, s, 0, Math.PI * 2);
    g.fillStyle = '#07060a';
    g.fill();
    g.lineWidth = Math.max(1, this.w * 0.008);
    g.strokeStyle = '#e8b54a';
    g.stroke();
    this.glyph('北', c + p.x, c + p.y + s * 0.05, s * 1.25, '#ffd978', 'serif');
  }
}

function diamond(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.moveTo(x, y - s);
  g.lineTo(x + s, y);
  g.lineTo(x, y + s);
  g.lineTo(x - s, y);
  g.closePath();
}
