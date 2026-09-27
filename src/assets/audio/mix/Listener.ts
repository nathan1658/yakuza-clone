import { Vector3, type Camera } from 'three';

/**
 * Places the Web Audio listener on the camera each frame (no allocations).
 * `pos` doubles as the ear position for SFX distance culling and ambience.
 */
export class Listener {
  readonly pos = new Vector3();
  private readonly fwd = new Vector3();
  private readonly up = new Vector3();

  place(l: AudioListener, camera: Camera): void {
    camera.getWorldPosition(this.pos);
    camera.getWorldDirection(this.fwd);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const { pos: p, fwd: f, up: u } = this;
    if (!l.positionX) {
      // Firefox has no AudioParams on the listener; the deprecated setters still work there.
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
      return;
    }
    l.positionX.value = p.x;
    l.positionY.value = p.y;
    l.positionZ.value = p.z;
    l.forwardX.value = f.x;
    l.forwardY.value = f.y;
    l.forwardZ.value = f.z;
    l.upX.value = u.x;
    l.upY.value = u.y;
    l.upZ.value = u.z;
  }
}
