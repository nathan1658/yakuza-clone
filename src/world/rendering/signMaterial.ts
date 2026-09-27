/**
 * Sign faces. The atlas holds masks (R letters, G glow, B border, A shape);
 * the mesh carries the tube/letter colour, the panel colour and
 * data = (mode + 8 * kind, characters, phase, power). Neon cores run well
 * above 1 so bloom picks them up; light boxes sit just under.
 */
import { ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
import type { Texture } from 'three';
import type { WorldUniforms } from './uniforms';

const VERTEX = /* glsl */ `
attribute vec2 local;
attribute vec3 color;
attribute vec3 panel;
attribute vec4 data;
varying vec2 vUv;
varying vec2 vLocal;
varying vec3 vColor;
varying vec3 vPanel;
varying vec4 vData;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vLocal = local;
  vColor = color;
  vPanel = panel;
  vData = data;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uRealTime;
varying vec2 vUv;
varying vec2 vLocal;
varying vec3 vColor;
varying vec3 vPanel;
varying vec4 vData;
#include <fog_pars_fragment>

float signHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

/** Whole-board brightness: a dying tube stutters, a blinker blinks. */
float signPower(float mode, float t, float seed) {
  if (mode == 1.0) {
    float spell = step(0.7, signHash(floor(t * 0.5) + seed));
    float stutter = step(0.4, signHash(floor(t * 17.0) + seed));
    return mix(1.0, 0.08 + 0.92 * stutter, spell);
  }
  if (mode == 2.0) return step(0.3, fract(t * 0.6));
  return 1.0;
}

void main() {
  vec4 m = texture2D(uAtlas, vUv);
  if (m.a < 0.5) discard;
  float mode = mod(vData.x, 8.0);
  float kind = floor(vData.x / 8.0);
  float chars = vData.y;
  float t = uRealTime + vData.z;
  float power = vData.w * signPower(mode, t, vData.z);

  float letters = 1.0;
  float border = 1.0;
  if (mode == 3.0 || mode == 4.0) {
    // Characters light one by one, hold, go dark, flash back on.
    float along = mode == 3.0 ? vLocal.x : 1.0 - vLocal.y;
    float i = floor(clamp(along * (chars + 0.4) - 0.2, 0.0, chars - 0.001));
    float n = mod(floor(t * 2.5), chars + 4.0);
    letters = n < chars ? step(i, n) : (n == chars + 2.0 ? 0.0 : 1.0);
  } else if (mode == 5.0) {
    float a = atan(vLocal.y - 0.5, vLocal.x - 0.5) / 6.2831853;
    border = 0.2 + 0.8 * step(0.5, fract(a * 8.0 - t * 0.9));
  }

  vec3 c;
  if (kind < 0.5) {
    vec3 hot = mix(vColor, vec3(1.0), 0.3);
    float lit = letters * power;
    c = vPanel * 0.05
      + vColor * m.g * 0.9 * lit
      + hot * m.r * 4.0 * lit
      + vColor * m.b * 3.0 * border * power
      + vColor * 0.06 * (m.r + m.b) * (1.0 - power);
  } else {
    vec3 lit = mix(vPanel, vColor, m.r) * (0.25 + 0.85 * power * letters);
    c = mix(lit, vec3(0.02), m.b);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // After encoding, like three's fog_fragment: fogColor arrives in output space.
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    // Neon cuts through the haze further than the walls it hangs on.
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.7);
  #endif
}
`;

export function createSignMaterial(u: WorldUniforms, atlas: Texture): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), uAtlas: { value: atlas }, uRealTime: u.uRealTime },
    fog: true,
  });
}
