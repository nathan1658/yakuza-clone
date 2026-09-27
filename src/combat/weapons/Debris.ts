/**
 * Broken-weapon shards: a fixed pool of small physics boxes that burst out,
 * bounce off the street and vanish after a few seconds. The pool bounds the
 * cost of a big brawl; the oldest shard is recycled when it runs out.
 */
import { BoxGeometry, Mesh, Vector3, type Material, type Scene } from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { CG, interactionGroups, type IPhysicsWorld } from '../../core/types';
import { TAU } from '../../core/math';

const POOL = 24;
const LIFE = 6;
const GROUPS = interactionGroups(CG.DEBRIS, CG.STATIC | CG.PROP | CG.DEBRIS);
const SPEED: readonly [number, number] = [1.5, 4];
const UP: readonly [number, number] = [1.5, 4];
const SPIN = 12;

interface Piece {
  readonly mesh: Mesh;
  body: RigidBody | null;
  life: number;
}

const half = new Vector3();

export class Debris {
  private readonly pieces: Piece[] = [];
  private readonly geo = new BoxGeometry(1, 1, 1);
  private next = 0;

  constructor(private readonly physics: IPhysicsWorld, scene: Scene) {
    for (let i = 0; i < POOL; i++) {
      const mesh = new Mesh(this.geo);
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      this.pieces.push({ mesh, body: null, life: 0 });
    }
  }

  /** `count` shards of about `size` metres flying out of `at`. */
  burst(at: Vector3, count: number, size: number, material: Material, rand: () => number = Math.random): void {
    for (let i = 0; i < count; i++) {
      const p = this.pieces[this.next];
      this.next = (this.next + 1) % POOL;
      this.free(p);
      const m = p.mesh;
      m.material = material;
      m.scale.set(size * (0.5 + rand()), size * (0.3 + 0.4 * rand()), size * (0.5 + rand()));
      m.position.set(at.x + (rand() - 0.5) * 0.2, at.y + rand() * 0.2, at.z + (rand() - 0.5) * 0.2);
      m.rotation.set(rand() * TAU, rand() * TAU, rand() * TAU);
      m.visible = true;
      half.copy(m.scale).multiplyScalar(0.5);
      const body = this.physics.createDynamicBox(m, half, { mass: 0.15, restitution: 0.3, groups: GROUPS });
      const a = rand() * TAU;
      const v = SPEED[0] + (SPEED[1] - SPEED[0]) * rand();
      body.setLinvel({ x: Math.sin(a) * v, y: UP[0] + (UP[1] - UP[0]) * rand(), z: Math.cos(a) * v }, true);
      body.setAngvel({ x: (rand() - 0.5) * SPIN, y: (rand() - 0.5) * SPIN, z: (rand() - 0.5) * SPIN }, true);
      p.body = body;
      p.life = LIFE;
    }
  }

  update(dt: number): void {
    for (const p of this.pieces) {
      if (!p.body) continue;
      p.life -= dt;
      if (p.life <= 0) this.free(p);
    }
  }

  clear(): void {
    for (const p of this.pieces) this.free(p);
  }

  dispose(): void {
    this.clear();
    for (const p of this.pieces) p.mesh.removeFromParent();
    this.geo.dispose();
  }

  private free(p: Piece): void {
    if (p.body) this.physics.removeBody(p.body);
    p.body = null;
    p.mesh.visible = false;
  }
}
