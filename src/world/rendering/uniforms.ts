import { Color, Matrix4, Vector3 } from 'three';
import type { IUniform, Texture } from 'three';

/** Live point lights the LightRig publishes each frame (rain and splashes glow near them). */
export const LIGHT_SLOTS = 8;

/**
 * Uniform objects shared by reference between every world material, so one
 * write per frame reaches all programs.
 */
export interface WorldUniforms {
  /** Scaled game time: rain, boats, anything that should slow in bullet time. */
  readonly uTime: IUniform<number>;
  /** Real time: neon, screens and sky keep running while paused or slowed. */
  readonly uRealTime: IUniform<number>;
  /** 0 dry .. 1 soaked. */
  readonly uWet: IUniform<number>;
  /** 0 none .. 1 downpour. */
  readonly uRain: IUniform<number>;
  /** Planar reflection of the street plane, written by Reflection each frame. */
  readonly uReflMap: IUniform<Texture | null>;
  /** World position -> projective uv in uReflMap. */
  readonly uReflMatrix: IUniform<Matrix4>;
  /** Half the drawing buffer's height in pixels: point sprites size themselves by it. */
  readonly uViewHalfHeight: IUniform<number>;
  /** World positions and colour × candela of the LIGHT_SLOTS live point lights (0 when unused). */
  readonly uLightPos: IUniform<Vector3[]>;
  readonly uLightCol: IUniform<Color[]>;
}

/**
 * Light from the live street lights reaching a point: inverse square, softened
 * near the source. For effects that scatter light (rain, splashes).
 */
export const STREET_LIGHT_GLSL = /* glsl */ `
uniform vec3 uLightPos[${LIGHT_SLOTS}];
uniform vec3 uLightCol[${LIGHT_SLOTS}];
vec3 streetLight(vec3 p) {
  vec3 lit = vec3(0.0);
  for (int i = 0; i < ${LIGHT_SLOTS}; i++) {
    vec3 d = uLightPos[i] - p;
    lit += uLightCol[i] / (dot(d, d) + 6.0);
  }
  return lit;
}
`;

export function createUniforms(): WorldUniforms {
  return {
    uTime: { value: 0 },
    uRealTime: { value: 0 },
    uWet: { value: 1 },
    uRain: { value: 1 },
    uReflMap: { value: null },
    uReflMatrix: { value: new Matrix4() },
    uViewHalfHeight: { value: 540 },
    uLightPos: { value: Array.from({ length: LIGHT_SLOTS }, () => new Vector3()) },
    uLightCol: { value: Array.from({ length: LIGHT_SLOTS }, () => new Color(0, 0, 0)) },
  };
}
