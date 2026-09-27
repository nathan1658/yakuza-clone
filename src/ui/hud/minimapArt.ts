import type { MinimapData, MinimapShape } from '../../core/types';

type ShapeKind = MinimapShape['kind'];

/** Paint order: ground first, buildings last so their outlines stay crisp. */
const ORDER: readonly ShapeKind[] = ['water', 'road', 'sidewalk', 'plaza', 'rail', 'building'];

const FILL: Readonly<Record<ShapeKind, string>> = {
  water: '#0b2433',
  road: '#26222e',
  sidewalk: '#3a3441',
  plaza: '#4a3624',
  rail: '#7a6230',
  building: '#120f17',
};

const EDGE: Readonly<Partial<Record<ShapeKind, string>>> = {
  water: '#1b5f73',
  building: '#8a2c55',
};

const MAX_TEXTURE_PX = 2048;
const MAX_PX_PER_M = 4;

export interface MinimapArt {
  readonly image: HTMLCanvasElement;
  /** Art pixels per world metre. */
  readonly scale: number;
  readonly minX: number;
  readonly minZ: number;
  readonly labels: MinimapData['labels'];
}

/** Pre-render the static street plan once; the radar only blits it per frame. */
export function renderMinimapArt(data: MinimapData): MinimapArt {
  const { minX, minZ, maxX, maxZ } = data.bounds;
  const scale = Math.min(MAX_PX_PER_M, MAX_TEXTURE_PX / Math.max(1, maxX - minX, maxZ - minZ));
  const image = document.createElement('canvas');
  image.width = Math.max(1, Math.ceil((maxX - minX) * scale));
  image.height = Math.max(1, Math.ceil((maxZ - minZ) * scale));
  const g = image.getContext('2d')!;
  g.setTransform(scale, 0, 0, scale, -minX * scale, -minZ * scale);
  g.lineJoin = 'round';
  g.lineWidth = 0.8;
  const sorted = ORDER.flatMap((kind) => data.shapes.filter((s) => s.kind === kind));
  for (const shape of sorted) paint(g, shape);
  return { image, scale, minX, minZ, labels: data.labels };
}

function paint(g: CanvasRenderingContext2D, shape: MinimapShape): void {
  if (shape.points.length < 3) return;
  g.beginPath();
  shape.points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.z) : g.lineTo(p.x, p.z)));
  g.closePath();
  g.fillStyle = FILL[shape.kind];
  g.fill();
  const edge = EDGE[shape.kind];
  if (!edge) return;
  g.strokeStyle = edge;
  g.stroke();
}
