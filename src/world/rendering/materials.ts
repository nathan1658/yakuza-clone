import { DoubleSide, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial } from 'three';
import type { Material, WebGLProgramParametersWithUniforms } from 'three';
import { WATER } from '../data/layout';
import type { BatchStyle } from './Batcher';
import { BOB_VERTEX, FACADE_FRAGMENT, GROUND_FRAGMENT, NOISE_GLSL, REFLECT_GLSL, WATER_FRAGMENT } from './shaders';
import type { WorldUniforms } from './uniforms';

export type MatKey = 'facade' | 'flat' | 'ground' | 'paint' | 'glow' | 'water' | 'boat' | 'boatGlow';

export const BATCH_STYLES: Readonly<Record<MatKey, BatchStyle>> = {
  facade: { cell: 50, castShadow: true, receiveShadow: true, reflect: false },
  flat: { cell: 50, castShadow: true, receiveShadow: true, reflect: false },
  ground: { cell: 100, castShadow: false, receiveShadow: true, reflect: false },
  paint: { cell: 100, castShadow: false, receiveShadow: true, reflect: false },
  glow: { cell: 50, castShadow: false, receiveShadow: false, reflect: true },
  water: { cell: 200, castShadow: false, receiveShadow: false, reflect: false },
  boat: { cell: 200, castShadow: false, receiveShadow: true, reflect: true },
  boatGlow: { cell: 200, castShadow: false, receiveShadow: false, reflect: true },
};

type Shader = WebGLProgramParametersWithUniforms;

/** Inject `code` after the first occurrence of `#include <chunk>`. */
export function after(src: string, chunk: string, code: string): string {
  const tag = `#include <${chunk}>`;
  if (!src.includes(tag)) throw new Error(`world shader hook: missing ${tag}`);
  return src.replace(tag, `${tag}\n${code}`);
}

/** Shared by every material that reads the `data` attribute. */
function passData(shader: Shader, varying: string): void {
  shader.vertexShader = after(
    `attribute vec4 data;\nvarying vec4 ${varying};\nvarying vec3 vWorldPos;\n${shader.vertexShader}`,
    'begin_vertex',
    `${varying} = data;\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
  );
}

/** Time, rain and the planar reflection for surfaces that mirror the street. */
function reflecting(shader: Shader, u: WorldUniforms): void {
  shader.uniforms.uTime = u.uTime;
  shader.uniforms.uRain = u.uRain;
  shader.uniforms.uReflMap = u.uReflMap;
  shader.uniforms.uReflMatrix = u.uReflMatrix;
}

/**
 * Procedural tong lau / office facades: windows, balconies, AC boxes, shop
 * fronts and roller shutters from uv (metres) and data = (style, seed, grit,
 * wall top). Nothing is textured, so it costs no atlas and never tiles.
 */
function facadeMaterial(): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    passData(shader, 'vFacade');
    shader.vertexShader = after(shader.vertexShader, 'begin_vertex', 'vFacadeUv = uv;');
    shader.vertexShader = `varying vec2 vFacadeUv;\n${shader.vertexShader}`;
    shader.fragmentShader = `varying vec4 vFacade;\nvarying vec2 vFacadeUv;\nvarying vec3 vWorldPos;\n${NOISE_GLSL}\n${FACADE_FRAGMENT}\n${shader.fragmentShader}`;
    shader.fragmentShader = after(shader.fragmentShader, 'color_fragment', 'vec3 facadeEmissive = facade(diffuseColor.rgb);');
    shader.fragmentShader = after(shader.fragmentShader, 'emissivemap_fragment', 'totalEmissiveRadiance += facadeEmissive;');
  };
  m.customProgramCacheKey = () => 'world-facade';
  return m;
}

/**
 * Streets and pavements: surface pattern by data.x, darker and glossier when
 * wet, with puddles that go mirror-smooth. uWet is shared with the weather.
 */
function groundMaterial(u: WorldUniforms, paint: boolean): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  if (paint) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -4;
  }
  m.onBeforeCompile = (shader) => {
    reflecting(shader, u);
    shader.uniforms.uWet = u.uWet;
    passData(shader, 'vGround');
    shader.fragmentShader = `uniform float uTime;\nuniform float uRain;\nuniform float uWet;\nvarying vec4 vGround;\nvarying vec3 vWorldPos;\n${NOISE_GLSL}\n${REFLECT_GLSL}\n${GROUND_FRAGMENT}\n${shader.fragmentShader}`;
    shader.fragmentShader = after(shader.fragmentShader, 'color_fragment', 'float puddle = groundSurface(diffuseColor.rgb);');
    shader.fragmentShader = after(shader.fragmentShader, 'roughnessmap_fragment', 'roughnessFactor = groundRoughness(roughnessFactor, puddle);');
    shader.fragmentShader = after(shader.fragmentShader, 'emissivemap_fragment', 'totalEmissiveRadiance += groundReflection(puddle);');
  };
  m.customProgramCacheKey = () => (paint ? 'world-paint' : 'world-ground');
  return m;
}

/**
 * Moored boats ride the swell: data = (pivot x, pivot z, phase, amplitude)
 * rolls, pitches and heaves each hull about its own waterline point.
 */
function bobbing<M extends MeshLambertMaterial | MeshBasicMaterial>(m: M, u: WorldUniforms, key: string): M {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.vertexShader = after(
      `uniform float uTime;\nattribute vec4 data;\n${shader.vertexShader}`,
      'begin_vertex',
      BOB_VERTEX.replace('WATER_Y', WATER.level.toFixed(2)),
    );
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/** Harbour water: swell and rain rings bend the normal so lamps and neon glint on it. */
function waterMaterial(u: WorldUniforms): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    reflecting(shader, u);
    passData(shader, 'vWater');
    shader.fragmentShader = `uniform float uTime;\nuniform float uRain;\nvarying vec4 vWater;\nvarying vec3 vWorldPos;\n${NOISE_GLSL}\n${REFLECT_GLSL}\n${WATER_FRAGMENT}\n${shader.fragmentShader}`;
    shader.fragmentShader = after(shader.fragmentShader, 'normal_fragment_maps', 'normal = waterNormal(normal);');
    shader.fragmentShader = after(shader.fragmentShader, 'emissivemap_fragment', 'totalEmissiveRadiance += waterReflection(normal);');
  };
  m.customProgramCacheKey = () => 'world-water';
  return m;
}

export function createMaterials(u: WorldUniforms): Record<MatKey, Material> {
  return {
    facade: facadeMaterial(),
    flat: new MeshLambertMaterial({ vertexColors: true }),
    ground: groundMaterial(u, false),
    paint: groundMaterial(u, true),
    // Self-lit HDR colours (lamp heads, light boxes, lit windows of vehicles): they bloom.
    glow: new MeshBasicMaterial({ vertexColors: true }),
    water: waterMaterial(u),
    // Canopies and cabins are open-ended shells, so both sides draw.
    boat: bobbing(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }), u, 'world-boat'),
    boatGlow: bobbing(new MeshBasicMaterial({ vertexColors: true }), u, 'world-boat-glow'),
  };
}
