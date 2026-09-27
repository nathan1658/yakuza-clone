import { Matrix4 } from 'three';
import type { IUniform, Texture } from 'three';

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
}

export function createUniforms(): WorldUniforms {
  return {
    uTime: { value: 0 },
    uRealTime: { value: 0 },
    uWet: { value: 1 },
    uRain: { value: 1 },
    uReflMap: { value: null },
    uReflMatrix: { value: new Matrix4() },
    uViewHalfHeight: { value: 540 },
  };
}
