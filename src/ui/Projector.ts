import { Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * World → CSS-pixel projection with a cached viewport size. Call `begin()`
 * once per lateUpdate (after the camera rig moved the camera) so projections
 * use this frame's camera, not last frame's.
 */
export class Projector {
  private readonly v = new Vector3();
  private w = 1;
  private h = 1;

  constructor(private readonly camera: () => PerspectiveCamera) {}

  resize(width: number, height: number): void {
    this.w = Math.max(1, width);
    this.h = Math.max(1, height);
  }

  begin(): void {
    this.camera().updateMatrixWorld();
  }

  /**
   * Project `world` (+ `lift` metres up). Returns false when the point is behind
   * the camera or further than `margin` px outside the viewport.
   */
  project(world: Vector3, lift: number, out: ScreenPoint, margin = 40): boolean {
    const v = this.v.set(world.x, world.y + lift, world.z).project(this.camera());
    if (v.z < -1 || v.z > 1) return false;
    out.x = (v.x + 1) * 0.5 * this.w;
    out.y = (1 - v.y) * 0.5 * this.h;
    return out.x > -margin && out.x < this.w + margin && out.y > -margin && out.y < this.h + margin;
  }
}
