/**
 * Hit sparks, impact flashes and ground shockwaves: three additive instanced
 * pools, recycled round-robin, so a brawl costs three draw calls and never
 * allocates. Colours fade to black, which is invisible under additive blending.
 */
import {
  AdditiveBlending, BufferGeometry, Color, IcosahedronGeometry, InstancedMesh, Matrix4,
  MeshBasicMaterial, OctahedronGeometry, Quaternion, RingGeometry, Vector3,
} from 'three';
import type { Scene } from 'three';

export type ImpactKind = 'light' | 'heavy' | 'blocked' | 'big';

interface PoolSpec {
  count: number;
  geometry: BufferGeometry;
  gravity: number;
  drag: number;
  /** 0 = shrink away over life; >1 = expand to this multiple. */
  grow: number;
}

const IDENTITY = new Quaternion();
const m4 = new Matrix4();
const v3 = new Vector3();
const s3 = new Vector3();
const col = new Color();

class Pool {
  readonly mesh: InstancedMesh;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly rgb: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private cursor = 0;
  private live = 0;

  constructor(private readonly spec: PoolSpec) {
    const n = spec.count;
    const mat = new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    this.mesh = new InstancedMesh(spec.geometry, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.rgb = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    m4.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, m4);
      this.mesh.setColorAt(i, col.setRGB(0, 0, 0));
    }
  }

  spawn(p: Vector3, vx: number, vy: number, vz: number, life: number, size: number, c: Color): void {
    const i = this.cursor;
    this.cursor = (i + 1) % this.spec.count;
    if (this.life[i] <= 0) this.live++;
    const k = i * 3;
    this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.rgb[k] = c.r; this.rgb[k + 1] = c.g; this.rgb[k + 2] = c.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
  }

  update(dt: number): void {
    if (this.live === 0) return;
    for (let i = 0; i < this.spec.count; i++) {
      if (this.life[i] > 0) this.step(i, dt);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private step(i: number, dt: number): void {
    const { gravity, drag, grow } = this.spec;
    const k = i * 3;
    this.life[i] -= dt;
    const t = Math.max(0, this.life[i] / this.maxLife[i]);
    if (t === 0) this.live--;
    const damp = Math.max(0, 1 - drag * dt);
    this.vel[k] *= damp;
    this.vel[k + 1] = this.vel[k + 1] * damp + gravity * dt;
    this.vel[k + 2] *= damp;
    this.pos[k] += this.vel[k] * dt;
    this.pos[k + 1] = Math.max(0.02, this.pos[k + 1] + this.vel[k + 1] * dt);
    this.pos[k + 2] += this.vel[k + 2] * dt;
    const s = grow > 0 ? this.size[i] * (1 + (grow - 1) * (1 - t)) : this.size[i] * t;
    m4.compose(v3.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]), IDENTITY, s3.setScalar(t > 0 ? s : 0));
    this.mesh.setMatrixAt(i, m4);
    this.mesh.setColorAt(i, col.setRGB(this.rgb[k] * t, this.rgb[k + 1] * t, this.rgb[k + 2] * t));
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.dispose();
  }
}

interface KindSpec {
  sparks: number;
  speed: number;
  flash: number;
  ring: number;
  color: Color;
}

const KINDS: Readonly<Record<ImpactKind, KindSpec>> = {
  light: { sparks: 5, speed: 3.5, flash: 0.22, ring: 0, color: new Color(1.0, 0.85, 0.55) },
  heavy: { sparks: 9, speed: 5, flash: 0.36, ring: 0, color: new Color(1.0, 0.55, 0.2) },
  blocked: { sparks: 6, speed: 3, flash: 0.26, ring: 0, color: new Color(0.55, 0.75, 1.0) },
  big: { sparks: 16, speed: 7, flash: 0.6, ring: 0.5, color: new Color(1.0, 0.35, 0.1) },
};

const DUST = new Color(0.35, 0.3, 0.25);

function ringGeometry(): BufferGeometry {
  const g = new RingGeometry(0.8, 1, 32);
  g.rotateX(-Math.PI / 2);
  return g;
}

export class ImpactVfx {
  private readonly sparks = new Pool({ count: 64, geometry: new OctahedronGeometry(0.035), gravity: -9, drag: 2.5, grow: 0 });
  private readonly flashes = new Pool({ count: 16, geometry: new IcosahedronGeometry(1, 1), gravity: 0, drag: 0, grow: 1.8 });
  private readonly rings = new Pool({ count: 12, geometry: ringGeometry(), gravity: 0, drag: 0, grow: 4 });

  attach(scene: Scene): void {
    scene.add(this.sparks.mesh, this.flashes.mesh, this.rings.mesh);
  }

  impact(at: Vector3, kind: ImpactKind, rand: () => number = Math.random): void {
    const k = KINDS[kind];
    for (let i = 0; i < k.sparks; i++) {
      const a = rand() * Math.PI * 2;
      const up = 0.3 + rand() * 0.9;
      const sp = k.speed * (0.5 + rand() * 0.5);
      this.sparks.spawn(at, Math.sin(a) * sp, up * sp, Math.cos(a) * sp, 0.25 + rand() * 0.2, 1 + rand(), k.color);
    }
    this.flashes.spawn(at, 0, 0, 0, 0.12, k.flash, k.color);
    if (k.ring > 0) this.shockwave(at, k.ring, k.color);
  }

  /** A body or a table hitting the floor. */
  dust(at: Vector3): void {
    this.shockwave(at, 0.35, DUST);
  }

  private shockwave(at: Vector3, size: number, c: Color): void {
    v3.set(at.x, 0.05, at.z);
    this.rings.spawn(v3, 0, 0, 0, 0.35, size, c);
  }

  update(dt: number): void {
    this.sparks.update(dt);
    this.flashes.update(dt);
    this.rings.update(dt);
  }

  dispose(): void {
    this.sparks.dispose();
    this.flashes.dispose();
    this.rings.dispose();
  }
}
