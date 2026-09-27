/**
 * Baked per-vertex ambient occlusion. The mesh is rasterised into a coarse
 * voxel grid, the outside is flood-filled from the border so every closed
 * shell counts as solid, then each vertex marches a few rays through its
 * hemisphere. Armpits, the crotch, under the chin, collars and the gaps
 * between fingers come out dark; open surfaces stay near 1. Pure: no three.
 */

const CELL = 0.02;
/** Ray start above the surface and march distances (metres). */
const LIFT = 0.02;
const STEPS = [0.03, 0.06, 0.1, 0.16] as const;
const STEP_WEIGHT = [1, 0.8, 0.55, 0.35] as const;
const RAYS = 14;
const STRENGTH = 1.0;
const FLOOR = 0.4;

/** Cosine-weighted hemisphere directions around +Z (Fibonacci spiral), capped 70° from the pole. */
const DIRS: readonly (readonly [number, number, number])[] = Array.from({ length: RAYS }, (_, i) => {
  const u = (i + 0.5) / RAYS;
  const r = Math.sqrt(u) * Math.sin((70 * Math.PI) / 180);
  const a = i * 2.399963229728653;
  return [r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - r * r)] as const;
});

export function bakeAO(pos: ArrayLike<number>, nrm: ArrayLike<number>, index: ArrayLike<number>): Float32Array {
  const n = pos.length / 3;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, pos[i * 3]); x1 = Math.max(x1, pos[i * 3]);
    y0 = Math.min(y0, pos[i * 3 + 1]); y1 = Math.max(y1, pos[i * 3 + 1]);
    z0 = Math.min(z0, pos[i * 3 + 2]); z1 = Math.max(z1, pos[i * 3 + 2]);
  }
  const pad = 2 * CELL;
  x0 -= pad; y0 -= pad; z0 -= pad;
  const nx = Math.ceil((x1 + pad - x0) / CELL) + 1;
  const ny = Math.ceil((y1 + pad - y0) / CELL) + 1;
  const nz = Math.ceil((z1 + pad - z0) / CELL) + 1;
  const solid = new Uint8Array(nx * ny * nz);
  const cell = (x: number, y: number, z: number): number => {
    const i = Math.floor((x - x0) / CELL);
    const j = Math.floor((y - y0) / CELL);
    const k = Math.floor((z - z0) / CELL);
    return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : i + nx * (j + ny * k);
  };

  // Surface: sample every triangle densely enough that no cell is skipped.
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const e = Math.max(
      Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]),
      Math.hypot(pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]),
      Math.hypot(pos[c] - pos[b], pos[c + 1] - pos[b + 1], pos[c + 2] - pos[b + 2]),
    );
    const m = Math.max(1, Math.ceil(e / (CELL * 0.5)));
    for (let i = 0; i <= m; i++) {
      for (let j = 0; i + j <= m; j++) {
        const u = i / m, v = j / m, w = 1 - u - v;
        const id = cell(
          pos[a] * w + pos[b] * u + pos[c] * v,
          pos[a + 1] * w + pos[b + 1] * u + pos[c + 1] * v,
          pos[a + 2] * w + pos[b + 2] * u + pos[c + 2] * v,
        );
        if (id >= 0) solid[id] = 1;
      }
    }
  }

  // Outside = reachable from the border through empty cells; everything else is solid.
  const outside = new Uint8Array(solid.length);
  const queue = new Int32Array(solid.length);
  let head = 0, tail = 0;
  const seed = (id: number) => {
    if (!solid[id] && !outside[id]) {
      outside[id] = 1;
      queue[tail++] = id;
    }
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { seed(nx * (j + ny * k)); seed(nx - 1 + nx * (j + ny * k)); }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { seed(i + nx * ny * k); seed(i + nx * (ny - 1 + ny * k)); }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { seed(i + nx * j); seed(i + nx * (j + ny * (nz - 1))); }
  const sx = 1, sy = nx, sz = nx * ny;
  while (head < tail) {
    const id = queue[head++];
    const i = id % nx, j = Math.floor(id / nx) % ny, k = Math.floor(id / sz);
    if (i > 0) seed(id - sx);
    if (i < nx - 1) seed(id + sx);
    if (j > 0) seed(id - sy);
    if (j < ny - 1) seed(id + sy);
    if (k > 0) seed(id - sz);
    if (k < nz - 1) seed(id + sz);
  }

  const out = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
    const zx = nrm[v * 3], zy = nrm[v * 3 + 1], zz = nrm[v * 3 + 2];
    // Branchless orthonormal basis around the normal (Duff et al. 2017).
    const sg = zz >= 0 ? 1 : -1;
    const a = -1 / (sg + zz);
    const b = zx * zy * a;
    const tx = 1 + sg * zx * zx * a, ty = sg * b, tz = -sg * zx;
    const bx = b, by = sg + zy * zy * a, bz = -zy;
    let occ = 0;
    for (const [dx, dy, dz] of DIRS) {
      const rx = tx * dx + bx * dy + zx * dz;
      const ry = ty * dx + by * dy + zy * dz;
      const rz = tz * dx + bz * dy + zz * dz;
      for (let s = 0; s < STEPS.length; s++) {
        const d = STEPS[s];
        const id = cell(px + zx * LIFT + rx * d, py + zy * LIFT + ry * d, pz + zz * LIFT + rz * d);
        if (id >= 0 && !outside[id]) {
          occ += STEP_WEIGHT[s];
          break;
        }
      }
    }
    out[v] = Math.max(FLOOR, 1 - (occ / RAYS) * STRENGTH);
  }
  return out;
}
