/**
 * Kowloon towers: one mesh on a small shader. Walls draw a window grid lit
 * per seed, roofs stay dark, and the tall ones blink red warning lights.
 * The haze is thinned so the far shore still reads through the fog.
 */
import { Mesh, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
import { TOWERS } from '../data/skyline';
import { MeshBuilder } from '../rendering/MeshBuilder';
import type { WorldUniforms } from '../rendering/uniforms';

const WALL = 0;
const WARNING = 1;
const ROOF = 2;

const VERTEX = /* glsl */ `
attribute vec4 data;
varying vec2 vUv;
varying vec4 vData;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vData = data;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
uniform float uRealTime;
varying vec2 vUv;
varying vec4 vData;
#include <fog_pars_fragment>

float skyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec3 c = vec3(0.004, 0.004, 0.008);
  if (vData.z == 1.0) {
    c = vec3(1.0, 0.08, 0.04) * 6.0 * step(0.5, fract(uRealTime * 0.45 + vData.x));
  } else if (vData.z == 0.0) {
    vec2 g = vUv / vec2(4.0, 3.4);
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.75);
    float lit = step(1.0 - vData.y, skyHash(cell + vData.x));
    vec3 tint = mix(vec3(1.0, 0.72, 0.4), vec3(0.75, 0.85, 1.0), step(0.7, skyHash(cell.yx + vData.x)));
    vec2 aa = fwidth(g);
    float far = smoothstep(0.3, 0.9, max(aa.x, aa.y));
    c += mix(tint * lit * win, vec3(0.94, 0.75, 0.5) * vData.y * 0.3, far) * 0.9;
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // After encoding, like three's fog_fragment: fogColor arrives in output space.
  #ifdef USE_FOG
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.8);
  #endif
}
`;

export function createSkyline(u: WorldUniforms): Mesh {
  const m = new MeshBuilder();
  for (const t of TOWERS) {
    const seed = (t.seed % 1000) / 7.13;
    m.data(seed, t.lit, WALL);
    m.wall(t.x0, t.z1, t.x1, t.z1, 0, t.height);
    m.wall(t.x0, t.z0, t.x0, t.z1, 0, t.height);
    m.wall(t.x1, t.z1, t.x1, t.z0, 0, t.height);
    m.data(seed, 0, ROOF).floor(t.x0, t.x1, t.z0, t.z1, t.height);
    if (t.height < 110) continue;
    m.data(seed, 0, WARNING);
    for (const x of [t.x0 + 1, t.x1 - 1]) m.quad(x - 0.8, t.height, t.z1 + 0.1, x + 0.8, t.height, t.z1 + 0.1, x + 0.8, t.height + 1.6, t.z1 + 0.1, x - 0.8, t.height + 1.6, t.z1 + 0.1);
  }
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), uRealTime: u.uRealTime },
    fog: true,
  });
  const mesh = new Mesh(m.build(), material);
  mesh.name = 'world:skyline';
  mesh.matrixAutoUpdate = false;
  mesh.layers.enable(1);
  return mesh;
}
