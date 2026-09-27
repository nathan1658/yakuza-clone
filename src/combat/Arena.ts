/**
 * The fight ring: static boxes on the ARENA collision group. Only character
 * sweeps collide with it, so the camera, props, thrown weapons and debris
 * pass straight through.
 */
import { Vector3 } from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import { CG, interactionGroups, type IPhysicsWorld } from '../core/types';
import { arenaRingSegments } from './arenaGeometry';

const RING_GROUPS = interactionGroups(CG.ARENA, CG.CHARACTER);

export class Arena {
  private readonly colliders: Collider[] = [];
  readonly center = new Vector3();
  radius = 0;

  constructor(private readonly physics: IPhysicsWorld) {}

  get active(): boolean {
    return this.colliders.length > 0;
  }

  build(center: Vector3, radius: number): void {
    this.remove();
    this.center.copy(center);
    this.radius = radius;
    const c = new Vector3();
    const half = new Vector3();
    for (const s of arenaRingSegments(center.x, center.z, radius)) {
      c.set(s.x, center.y + s.halfY, s.z);
      half.set(s.halfX, s.halfY, s.halfZ);
      const collider = this.physics.createStaticBox(c, half, s.rotY);
      collider.setCollisionGroups(RING_GROUPS);
      this.colliders.push(collider);
    }
  }

  remove(): void {
    for (const c of this.colliders) this.physics.world.removeCollider(c, false);
    this.colliders.length = 0;
  }
}
