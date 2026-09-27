import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { NOISE_GLSL } from '../rendering/shaders';
import type { WorldUniforms } from '../rendering/uniforms';

const RADIUS = 850;

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
}
`;

/** Night over Causeway Bay: a dark indigo dome over a low cloud deck lit orange by the city. */
const FRAGMENT = /* glsl */ `
uniform float uRealTime;
varying vec3 vDir;
${NOISE_GLSL}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * worldNoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(vec3(0.03, 0.012, 0.05), vec3(0.002, 0.003, 0.012), pow(h, 0.4));
  vec2 uv = d.xz / (d.y + 0.08) * 1.6 + vec2(uRealTime * 0.006, uRealTime * 0.0025);
  float deck = smoothstep(0.3, 0.9, fbm(uv)) * smoothstep(-0.02, 0.2, d.y);
  float under = (1.0 - h) * (1.0 - h);
  col += vec3(0.16, 0.06, 0.025) * under * (0.25 + deck);
  col += vec3(0.02, 0.012, 0.03) * deck;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Camera-centred sky dome; drawn first, never writes depth, mirrored in puddles (layer 1). */
export function createSky(u: WorldUniforms): Mesh {
  const material = new ShaderMaterial({
    uniforms: { uRealTime: u.uRealTime },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const sky = new Mesh(new SphereGeometry(RADIUS, 32, 16), material);
  sky.name = 'world:sky';
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  sky.matrixAutoUpdate = false;
  sky.layers.enable(1);
  return sky;
}
