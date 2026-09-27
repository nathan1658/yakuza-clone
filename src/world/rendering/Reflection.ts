/**
 * Planar reflection of the street plane y = 0 at half resolution: a real
 * camera at the mirrored eye position, seeing only layer 1 (neon, lamps,
 * sky, skyline, boats), clipped obliquely at the plane. Puddles, wet asphalt
 * and the harbour sample it projectively through uReflMatrix; the mip chain
 * gives wet (not flooded) surfaces their blurred streaks.
 */
import { HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Matrix4, PerspectiveCamera, Vector3, Vector4, WebGLRenderTarget } from 'three';
import type { Scene, WebGLRenderer } from 'three';
import type { WorldUniforms } from './uniforms';

const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export class Reflection {
  private readonly target = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: true,
  });
  private readonly eye = new PerspectiveCamera();
  private readonly look = new Vector3();
  private readonly plane = new Vector4();
  private readonly q = new Vector4();
  private readonly normal = new Vector3();

  constructor(private readonly u: WorldUniforms) {
    u.uReflMap.value = this.target.texture;
    this.eye.layers.set(1);
  }

  setSize(width: number, height: number): void {
    this.target.setSize(Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2)));
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): void {
    const eye = this.eye;
    const m = camera.matrixWorld.elements;
    // Mirror the eye, its view direction and its up vector in y = 0.
    eye.position.set(m[12]!, -m[13]!, m[14]!);
    eye.up.set(m[4]!, -m[5]!, m[6]!);
    this.look.set(-m[8]!, m[9]!, -m[10]!).add(eye.position);
    eye.lookAt(this.look);
    eye.updateMatrixWorld();
    eye.projectionMatrix.copy(camera.projectionMatrix);
    this.u.uReflMatrix.value.copy(BIAS).multiply(eye.projectionMatrix).multiply(eye.matrixWorldInverse);
    this.clipBelowPlane();

    const shadows = renderer.shadowMap.autoUpdate;
    const previous = renderer.getRenderTarget();
    // The shadow map filters casters by the rendering camera's layers: never rebuild it from here.
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, eye);
    renderer.setRenderTarget(previous);
    renderer.shadowMap.autoUpdate = shadows;
  }

  dispose(): void {
    this.target.dispose();
  }

  /** Oblique near plane at y = 0 (Lengyel), so nothing below the street leaks in. */
  private clipBelowPlane(): void {
    const view = this.eye.matrixWorldInverse;
    const p = this.eye.projectionMatrix.elements;
    const n = this.normal.set(0, 1, 0).transformDirection(view);
    // Plane through the world origin: its view-space constant is -n . origin_view.
    const o = view.elements;
    const d = -(n.x * o[12]! + n.y * o[13]! + n.z * o[14]!);
    const c = this.plane.set(n.x, n.y, n.z, d);
    const q = this.q.set((Math.sign(c.x) + p[8]!) / p[0]!, (Math.sign(c.y) + p[9]!) / p[5]!, -1, (1 + p[10]!) / p[14]!);
    c.multiplyScalar(2 / c.dot(q));
    p[2] = c.x;
    p[6] = c.y;
    p[10] = c.z + 1;
    p[14] = c.w;
  }
}
