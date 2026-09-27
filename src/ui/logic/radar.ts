/**
 * Minimap maths. The radar is camera-up: the camera's forward direction
 * (sin ψ, cos ψ) in world XZ points to the top of the radar and the camera's
 * right (-cos ψ, sin ψ) points right. Screen y grows downward.
 */

export interface RadarPoint {
  x: number;
  y: number;
  /** The point lay outside the radar and was pulled onto the rim. */
  clamped: boolean;
  /** Direction from centre, radians clockwise from up (for arrows). */
  angle: number;
}

export function newRadarPoint(): RadarPoint {
  return { x: 0, y: 0, clamped: false, angle: 0 };
}

/** 2×2 world→screen matrix [a, b, c, d]: x' = a·dx + c·dz, y' = b·dx + d·dz (canvas setTransform order). */
export function radarMatrix(yaw: number, pxPerM: number): [number, number, number, number] {
  const c = Math.cos(yaw) * pxPerM;
  const s = Math.sin(yaw) * pxPerM;
  return [-c, -s, s, -c];
}

/**
 * World offset from the player (dx, dz) → radar pixels relative to the centre.
 * Points beyond `rimPx` are pulled onto the rim (clamped = true).
 */
export function toRadar(
  dx: number, dz: number, yaw: number, pxPerM: number, rimPx: number, out: RadarPoint,
): RadarPoint {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  let x = (-dx * c + dz * s) * pxPerM;
  let y = -(dx * s + dz * c) * pxPerM;
  const dist = Math.hypot(x, y);
  out.clamped = dist > rimPx;
  if (out.clamped) {
    x *= rimPx / dist;
    y *= rimPx / dist;
  }
  out.x = x;
  out.y = y;
  out.angle = Math.atan2(x, -y);
  return out;
}

/** Screen angle (clockwise from up) of a world yaw on the camera-up radar. */
export function radarHeading(facing: number, cameraYaw: number): number {
  return cameraYaw - facing;
}
