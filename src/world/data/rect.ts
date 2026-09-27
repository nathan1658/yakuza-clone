/** Axis-aligned rectangle on the XZ plane (metres). x0 ≤ x1, z0 ≤ z1. */
export interface Rect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

export function rect(x0: number, x1: number, z0: number, z1: number): Rect {
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
}

export function inRect(r: Rect, x: number, z: number, pad = 0): boolean {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
}

export const width = (r: Rect): number => r.x1 - r.x0;
export const depth = (r: Rect): number => r.z1 - r.z0;
export const centerX = (r: Rect): number => (r.x0 + r.x1) / 2;
export const centerZ = (r: Rect): number => (r.z0 + r.z1) / 2;

/** Closed polygon (4 corners, not repeated) for the minimap. */
export function rectPolygon(r: Rect): Array<{ x: number; z: number }> {
  return [
    { x: r.x0, z: r.z0 },
    { x: r.x1, z: r.z0 },
    { x: r.x1, z: r.z1 },
    { x: r.x0, z: r.z1 },
  ];
}

/** Split a rect into pieces no longer than `max` along either axis (for per-cell batching). */
export function splitRect(r: Rect, max: number): Rect[] {
  const nx = Math.max(1, Math.ceil(width(r) / max));
  const nz = Math.max(1, Math.ceil(depth(r) / max));
  const out: Rect[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x0 = r.x0 + (width(r) * i) / nx;
      const z0 = r.z0 + (depth(r) * j) / nz;
      out.push(rect(x0, x0 + width(r) / nx, z0, z0 + depth(r) / nz));
    }
  }
  return out;
}
