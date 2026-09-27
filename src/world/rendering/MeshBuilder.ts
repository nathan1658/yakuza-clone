import { BufferGeometry, Color, Float32BufferAttribute, Uint16BufferAttribute, Uint32BufferAttribute } from 'three';

/**
 * Build-time vertex soup. Every vertex carries position, normal, uv, a linear
 * colour (may exceed 1 for emissive materials) and a vec4 `data` whose meaning
 * belongs to the material. Colour and data are "current state" set with
 * color()/data() so the primitives stay short. Build time only: it allocates.
 */
export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly uvs: number[] = [];
  private readonly col: number[] = [];
  private readonly dat: number[] = [];
  private readonly idx: number[] = [];
  private readonly c = new Color(1, 1, 1);
  private readonly d = [0, 0, 0, 0];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** sRGB hex (converted to linear) times an optional HDR multiplier. */
  color(hex: number, scale = 1): this {
    this.c.setHex(hex).multiplyScalar(scale);
    return this;
  }

  colorRGB(r: number, g: number, b: number): this {
    this.c.setRGB(r, g, b);
    return this;
  }

  data(a: number, b = 0, c = 0, d = 0): this {
    this.d[0] = a;
    this.d[1] = b;
    this.d[2] = c;
    this.d[3] = d;
    return this;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uvs.push(u, v);
    this.col.push(this.c.r, this.c.g, this.c.b);
    this.dat.push(this.d[0], this.d[1], this.d[2], this.d[3]);
    return this.pos.length / 3 - 1;
  }

  /**
   * Quad from four corners in bl, br, tr, tl order (counter-clockwise seen from
   * the front). Emits exactly 4 consecutive vertices, so shaders may rely on
   * vertex index % 4 as the corner.
   */
  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    u0 = 0, v0 = 0, u1 = 1, v1 = 1,
  ): this {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = dx - ax, e2y = dy - ay, e2z = dz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const i = this.vertex(ax, ay, az, nx, ny, nz, u0, v0);
    this.vertex(bx, by, bz, nx, ny, nz, u1, v0);
    this.vertex(cx, cy, cz, nx, ny, nz, u1, v1);
    this.vertex(dx, dy, dz, nx, ny, nz, u0, v1);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return this;
  }

  /**
   * Vertical wall from (x0,z0) to (x1,z1), seen from the side it faces
   * ((x0,z0) on the viewer's left). uv is in metres: u along the wall from
   * `u0`, v is the world height.
   */
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, u0 = 0): this {
    const len = Math.hypot(x1 - x0, z1 - z0);
    return this.quad(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0, u0, y0, u0 + len, y1);
  }

  /** Upward-facing horizontal quad; uv is world x/z in metres. */
  floor(x0: number, x1: number, z0: number, z1: number, y: number): this {
    return this.quad(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0, x0, -z1, x1, -z0);
  }

  /**
   * Box centred at (cx,cy,cz) with half extents, rotated by rotY about +Y
   * (local +Z faces (sin rotY, 0, cos rotY)). `faces` skips the bottom by
   * default because nothing in this city is seen from below.
   */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0, bottom = false): this {
    const s = Math.sin(rotY);
    const c = Math.cos(rotY);
    // Local (lx, lz) → world, matching Object3D.rotation.y.
    const px = (lx: number, lz: number): number => cx + lx * c + lz * s;
    const pz = (lx: number, lz: number): number => cz - lx * s + lz * c;
    const y0 = cy - hy;
    const y1 = cy + hy;
    const corners: Array<[number, number]> = [[-hx, hz], [hx, hz], [hx, -hz], [-hx, -hz]];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k];
      const [bx, bz] = corners[(k + 1) % 4];
      this.wall(px(ax, az), pz(ax, az), px(bx, bz), pz(bx, bz), y0, y1);
    }
    const [a, b, e, f] = corners;
    this.quad(px(a[0], a[1]), y1, pz(a[0], a[1]), px(b[0], b[1]), y1, pz(b[0], b[1]),
      px(e[0], e[1]), y1, pz(e[0], e[1]), px(f[0], f[1]), y1, pz(f[0], f[1]), 0, 0, 2 * hx, 2 * hz);
    if (bottom) {
      this.quad(px(f[0], f[1]), y0, pz(f[0], f[1]), px(e[0], e[1]), y0, pz(e[0], e[1]),
        px(b[0], b[1]), y0, pz(b[0], b[1]), px(a[0], a[1]), y0, pz(a[0], a[1]), 0, 0, 2 * hx, 2 * hz);
    }
    return this;
  }

  /** Axis-aligned box from bounds. */
  aabb(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): this {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2);
  }

  /** Upright cylinder (sides and top cap), smooth normals. */
  cylinder(cx: number, cz: number, y0: number, y1: number, r: number, segments = 8): this {
    const base = this.vertexCount;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const nx = Math.sin(a);
      const nz = Math.cos(a);
      this.vertex(cx + nx * r, y0, cz + nz * r, nx, 0, nz, i / segments, y0);
      this.vertex(cx + nx * r, y1, cz + nz * r, nx, 0, nz, i / segments, y1);
    }
    for (let i = 0; i < segments; i++) {
      const k = base + i * 2;
      this.idx.push(k, k + 2, k + 3, k, k + 3, k + 1);
    }
    const centre = this.vertex(cx, y1, cz, 0, 1, 0, 0.5, 0.5);
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p = this.vertex(cx + Math.sin(a0) * r, y1, cz + Math.cos(a0) * r, 0, 1, 0, 0, 0);
      this.vertex(cx + Math.sin(a1) * r, y1, cz + Math.cos(a1) * r, 0, 1, 0, 1, 0);
      this.idx.push(centre, p, p + 1);
    }
    return this;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('data', new Float32BufferAttribute(this.dat, 4));
    const big = this.vertexCount > 65535;
    g.setIndex(big ? new Uint32BufferAttribute(this.idx, 1) : new Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
