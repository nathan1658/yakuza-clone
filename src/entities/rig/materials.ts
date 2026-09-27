/**
 * Character materials. The shader patches are module-level functions, so
 * every character shares one compiled program (three keys programs on
 * onBeforeCompile.toString()) while keeping its own uniforms.
 */
import { BackSide, MeshBasicMaterial, MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';

/** Outline shell thickness in metres. */
const OUTLINE_WIDTH = 0.018;

function addGlow(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vGlow;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;');
}

function inflateHull(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 hullNormal;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += hullNormal * ${OUTLINE_WIDTH.toFixed(3)};`);
}

export function createBodyMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = addGlow;
  return m;
}

export function createOutlineMaterial(color: number): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color, side: BackSide });
  m.onBeforeCompile = inflateHull;
  return m;
}
