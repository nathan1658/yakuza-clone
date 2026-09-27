import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial } from 'three';
import { WATER } from '../data/layout';
import { mulberry32 } from '../data/rng';
import { STREET_LIGHT_GLSL, type WorldUniforms } from '../rendering/uniforms';

const COUNT = 1400;

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uRain;
uniform float uViewHalfHeight;
attribute float threshold;
varying float vAge;
varying float vFade;
varying vec3 vLit;
${STREET_LIGHT_GLSL}
const float TILE = 26.0;
const float PERIOD = 0.55;
const float LIFE = 0.3;
const float SHORE_Z = ${WATER.shoreZ.toFixed(1)};
float splashHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  // Each point lands once a period, somewhere new each time.
  float cycle = uTime / PERIOD + position.z;
  float n = floor(cycle);
  vAge = fract(cycle) * PERIOD / LIFE;
  vec2 cell = vec2(splashHash(position.xy + n), splashHash(position.yx * 1.31 + n));
  // A tile riding ahead of the camera; points keep their world spot as it slides.
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec2 ahead = fwd.xz / max(length(fwd.xz), 1e-3);
  vec2 origin = cameraPosition.xz + ahead * TILE * 0.3 - TILE * 0.5;
  vec2 xz = origin + mod(cell * TILE - origin, TILE);
  float size = 0.18 + 0.1 * splashHash(cell);
  vec4 mv = viewMatrix * vec4(xz.x, size * 0.3, xz.y, 1.0);
  bool on = vAge < 1.0 && threshold < uRain && xz.y > SHORE_Z;
  gl_Position = on ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = on ? size * projectionMatrix[1][1] * uViewHalfHeight / max(-mv.z, 0.1) : 0.0;
  float d = length(xz - cameraPosition.xz);
  vFade = smoothstep(1.0, 3.0, d) * (1.0 - smoothstep(TILE * 0.45, TILE * 0.6, d));
  vLit = streetLight(vec3(xz.x, 0.1, xz.y));
}
`;

const FRAGMENT = /* glsl */ `
varying float vAge;
varying float vFade;
varying vec3 vLit;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.y = -p.y;
  // The ring where the drop hit, flattened as seen from standing height.
  vec2 q = vec2(p.x, (p.y + 0.55) * 3.0);
  float ring = smoothstep(0.12, 0.0, abs(length(q) - vAge * 0.9)) * (1.0 - vAge);
  // Droplets thrown up and falling back.
  float drops = 0.0;
  for (int i = 0; i < 3; i++) {
    float s = float(i) - 1.0;
    vec2 d = vec2(s * 0.5 * vAge, -0.55 + 2.2 * vAge * (1.0 - vAge) * (1.0 - 0.3 * abs(s)));
    drops += smoothstep(0.1, 0.0, length(p - d));
  }
  float a = (ring * 0.8 + drops * (1.0 - vAge)) * vFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4((vec3(0.7, 0.76, 0.86) * 0.12 + vLit * 0.035) * a, 1.0);
}
`;

/**
 * Rain landing on the street: little crowns that flash up where drops hit,
 * in a tile that rides ahead of the camera. One draw call; placement and
 * timing are hashed on the GPU, each point's threshold against uRain thins
 * them out like the streaks, and scaled time slows them in bullet time.
 */
export function createSplashes(u: WorldUniforms): Points {
  const rng = mulberry32(0x5b1a);
  const pos = new Float32Array(COUNT * 3);
  const threshold = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = rng();
    pos[i * 3 + 1] = rng();
    pos[i * 3 + 2] = rng();
    threshold[i] = rng();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('threshold', new Float32BufferAttribute(threshold, 1));
  const material = new ShaderMaterial({
    uniforms: { uTime: u.uTime, uRain: u.uRain, uViewHalfHeight: u.uViewHalfHeight, uLightPos: u.uLightPos, uLightCol: u.uLightCol },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const splashes = new Points(g, material);
  splashes.name = 'world:splashes';
  splashes.frustumCulled = false;
  splashes.matrixAutoUpdate = false;
  splashes.renderOrder = 10;
  return splashes;
}
