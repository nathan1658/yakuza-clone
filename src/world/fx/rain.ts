import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Mesh, ShaderMaterial, Uint16BufferAttribute } from 'three';
import { mulberry32 } from '../data/rng';
import { STREET_LIGHT_GLSL, type WorldUniforms } from '../rendering/uniforms';

const STREAKS = 12000;

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uRain;
attribute vec3 corner;
varying float vAlpha;
varying float vSide;
varying vec3 vLit;
${STREET_LIGHT_GLSL}
const vec3 BOX = vec3(36.0, 22.0, 36.0);
void main() {
  float speed = 11.0 + 5.0 * position.y;
  vec3 vel = vec3(1.1, -speed, 0.7);
  vec3 origin = cameraPosition - BOX * vec3(0.5, 0.3, 0.5);
  vec3 head = origin + mod(position * BOX + vel * uTime - origin, BOX);
  vec3 dir = normalize(vel);
  vec3 p = head - dir * (0.05 * speed * corner.y);
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  // This order winds every quad counter-clockwise towards the camera (front-facing).
  vec3 side = normalize(cross(toCam, dir));
  // At least ~1 px wide at any distance, so far streaks don't shimmer.
  p += side * corner.x * max(0.008, dist * 0.0011);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv * step(corner.z, uRain);
  vAlpha = (1.0 - corner.y) * smoothstep(0.4, 2.0, dist) * (1.0 - smoothstep(12.0, 20.0, dist));
  vSide = corner.x;
  vLit = streetLight(head);
}
`;

const FRAGMENT = /* glsl */ `
varying float vAlpha;
varying float vSide;
varying vec3 vLit;
void main() {
  float a = vAlpha * (1.0 - abs(vSide)) * 0.55;
  // Faint everywhere, glowing in the colour of any lamp or neon it falls past.
  gl_FragColor = vec4((vec3(0.62, 0.68, 0.8) * 0.4 + vLit * 0.05) * a, 1.0);
}
`;

/**
 * Rain streaks: one draw call, positions wrapped around the camera on the
 * GPU. Each streak's threshold (corner.z) against uRain decides whether it
 * falls, so drizzle is just fewer drops. Scaled time, so bullet time slows it.
 */
export function createRain(u: WorldUniforms): Mesh {
  const rng = mulberry32(0x7a1f);
  const pos = new Float32Array(STREAKS * 12);
  const corner = new Float32Array(STREAKS * 12);
  const idx = new Uint16Array(STREAKS * 6);
  for (let i = 0; i < STREAKS; i++) {
    const x = rng();
    const y = rng();
    const z = rng();
    const threshold = rng();
    for (let k = 0; k < 4; k++) {
      const v = (i * 4 + k) * 3;
      pos[v] = x;
      pos[v + 1] = y;
      pos[v + 2] = z;
      corner[v] = k === 0 || k === 3 ? -1 : 1;
      corner[v + 1] = k < 2 ? 0 : 1;
      corner[v + 2] = threshold;
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('corner', new Float32BufferAttribute(corner, 3));
  g.setIndex(new Uint16BufferAttribute(idx, 1));
  const material = new ShaderMaterial({
    uniforms: { uTime: u.uTime, uRain: u.uRain, uLightPos: u.uLightPos, uLightCol: u.uLightCol },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const rain = new Mesh(g, material);
  rain.name = 'world:rain';
  rain.frustumCulled = false;
  rain.matrixAutoUpdate = false;
  rain.renderOrder = 10;
  return rain;
}
