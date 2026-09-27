/**
 * Character materials. The shader patches are module-level functions, so
 * every character shares one compiled program (three keys programs on
 * customProgramCacheKey) while keeping its own uniforms (hit flash).
 *
 * Per vertex the body carries roughness, metalness, a surface kind, glow,
 * a pattern colour (or hair strand direction) and baked occlusion. The
 * fragment shader turns the kind into procedural detail in bind-pose space,
 * so it sticks to the skin as it moves: pores, knit, weave, denim twill,
 * leather grain, hair strands, a hibiscus print, tattoo linework. Fabric
 * darkens and everything turns glossier in the rain, and a rim of the
 * environment's neon keeps silhouettes readable against the night.
 */
import { BackSide, MeshBasicMaterial, MeshStandardMaterial, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import { KIND } from '../look/MeshBuilder';

/** Outline shell thickness in metres. */
const OUTLINE_WIDTH = 0.018;
/** Image-based light from the city around a character. */
const ENV_INTENSITY = 0.6;

/** Shared by every character material: wetness (0 dry .. 1 soaked), rim strength, the environment map. */
export const characterLighting = {
  wet: { value: 0 },
  rim: { value: 1.2 },
  envMap: null as Texture | null,
};

const DEFINES = Object.entries(KIND).map(([k, v]) => `#define K_${k.toUpperCase()} ${v.toFixed(1)}`).join('\n');

const VERTEX_PARS = /* glsl */ `
attribute vec4 mat;
attribute vec3 accent;
attribute float ao;
varying vec4 vMat;
varying vec3 vAccent;
varying float vAo;
varying vec3 vRest;
varying vec3 vRestN;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform float uWet;
uniform float uRim;
varying vec4 vMat;
varying vec3 vAccent;
varying float vAo;
varying vec3 vRest;
varying vec3 vRestN;
${DEFINES}
float chH = 0.0;
float chDR = 0.0;

float chHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float chNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(chHash(i), chHash(i + vec3(1, 0, 0)), f.x), mix(chHash(i + vec3(0, 1, 0)), chHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(chHash(i + vec3(0, 0, 1)), chHash(i + vec3(1, 0, 1)), f.x), mix(chHash(i + vec3(0, 1, 1)), chHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
/** 1 while a pattern of 'freq' cycles per metre spans a few pixels, fading to 0 well before it would alias (and glitter). */
float chDetail(float freq) {
  return 1.0 - smoothstep(0.12, 0.4, length(fwidth(vRest)) * freq);
}
/** Soft cloth folds: stretched noise, strongest across the limb. */
float chFolds(vec3 p, float amp) {
  return (chNoise(p * vec3(17.0, 5.5, 17.0)) + 0.5 * chNoise(p * vec3(38.0, 12.0, 38.0))) * amp;
}
/** Hibiscus print on a 9 cm lattice: five-petal flowers in the pattern colour with a yellow heart and a dark leaf. */
vec3 chFloral(vec3 alb, vec3 p) {
  vec3 q = p / 0.09;
  vec3 cell = floor(q);
  vec3 d = q - cell - (0.3 + 0.4 * vec3(chHash(cell), chHash(cell + 3.7), chHash(cell + 9.1)));
  vec3 n = normalize(vRestN);
  d -= n * dot(d, n);
  vec3 e1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0)));
  vec3 e2 = cross(n, e1);
  vec2 uv = vec2(dot(d, e1), dot(d, e2));
  float spin = chHash(cell + 1.3) * 6.2832;
  float a = atan(uv.y, uv.x) + spin;
  float r = length(uv);
  float aa = fwidth(r) + 1e-4;
  float petals = 1.0 - smoothstep(-aa, aa, r - 0.34 * (0.58 + 0.42 * pow(abs(cos(2.5 * a)), 0.45)));
  float heart = 1.0 - smoothstep(-aa, aa, r - 0.07);
  vec2 lv = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * (uv - vec2(-0.3, -0.24));
  float leaf = 1.0 - smoothstep(-aa, aa, length(lv / vec2(0.26, 0.1)) - 1.0);
  float fade = chDetail(22.0);
  alb = mix(alb, alb * 0.45 + vec3(0.0, 0.05, 0.02), leaf * (1.0 - petals) * fade);
  alb = mix(alb, vAccent, petals * fade);
  return mix(alb, vec3(0.95, 0.75, 0.2), heart * fade);
}
/** Irezumi-style ink: flowing contour linework over solid dark masses. */
float chTattoo(vec3 p) {
  float n = chNoise(p * 26.0) * 0.7 + chNoise(p * 55.0) * 0.3;
  float w = fwidth(n) + 0.004;
  float lines = smoothstep(0.5 - w - 0.02, 0.5 - 0.02, n) - smoothstep(0.5 + 0.02, 0.5 + w + 0.02, n);
  float mass = smoothstep(0.6, 0.64, chNoise(p * 11.0 + 4.0));
  return clamp(max(lines, mass), 0.0, 1.0) * chDetail(40.0) * 0.9;
}

/** Albedo detail per kind; leaves a bump height in chH (metres) and a roughness offset in chDR. */
void chSurface(inout vec3 alb) {
  float k = vMat.z;
  vec3 p = vRest;
  if (k < 0.5) return;
  if (k < K_SKIN + 0.5 || abs(k - K_TATTOO) < 0.5) {
    alb *= 0.94 + 0.12 * chNoise(p * 40.0);
    chH = (chNoise(p * 650.0) - 0.5) * 0.00004 * chDetail(650.0);
    chDR = (chNoise(p * 90.0) - 0.5) * 0.12;
    if (abs(k - K_TATTOO) < 0.5) alb = mix(alb, vAccent * 0.55, chTattoo(p));
  } else if (abs(k - K_KNIT) < 0.5) {
    float rib = sin((p.x + p.z) * 2400.0);
    chH = rib * 0.00004 * chDetail(380.0) + chFolds(p, 0.0035);
    alb *= 0.95 + 0.1 * chNoise(p * vec3(40.0, 12.0, 40.0));
  } else if (abs(k - K_WOVEN) < 0.5 || abs(k - K_FLORAL) < 0.5) {
    float weave = (sin(p.x * 3000.0 + p.z * 3000.0) + sin(p.y * 3000.0)) * 0.5;
    chH = weave * 0.00003 * chDetail(480.0) + chFolds(p, 0.004);
    alb *= 0.96 + 0.08 * chNoise(p * 30.0);
    if (abs(k - K_FLORAL) < 0.5) alb = chFloral(alb, p);
  } else if (abs(k - K_DENIM) < 0.5) {
    float twill = sin((p.y + (p.x + p.z) * 0.6) * 1630.0);
    float d = chDetail(260.0);
    chH = twill * 0.00007 * d + chFolds(p, 0.004);
    alb *= mix(1.0, 0.86 + 0.24 * chNoise(p * vec3(70.0, 5.0, 70.0)), chDetail(45.0));
    alb *= 0.92 + 0.14 * (0.5 + 0.5 * twill) * d;
    // Worn lighter down the front of the legs and seat.
    float wear = smoothstep(0.2, 1.0, abs(normalize(vRestN).z)) * smoothstep(0.35, 0.75, chNoise(p * vec3(9.0, 3.0, 9.0)));
    alb = mix(alb, alb * 1.45 + 0.015, 0.45 * wear);
  } else if (abs(k - K_LEATHER) < 0.5) {
    float grain = chNoise(p * 480.0);
    chH = -grain * grain * 0.00012 * chDetail(480.0) + chFolds(p, 0.0045);
    chDR = (chNoise(p * 45.0) - 0.5) * 0.16;
    alb *= 0.88 + 0.22 * chNoise(p * 22.0);
  } else if (abs(k - K_HAIR) < 0.5) {
    vec3 t = normalize(vAccent + 1e-4);
    vec3 across = normalize(cross(t, normalize(vRestN)) + 1e-4);
    float s = dot(p, across);
    float along = dot(p, t);
    float fine = chNoise(vec3(s * 2600.0, along * 30.0, 0.0));
    float clump = chNoise(vec3(s * 260.0, along * 8.0, 3.0));
    float d = chDetail(2600.0);
    float dc = chDetail(260.0);
    alb *= mix(1.0, 0.62 + 0.7 * fine, d) * mix(1.0, 0.82 + 0.36 * clump, dc);
    chH = (fine - 0.5) * 0.00008 * d + (clump - 0.5) * 0.0006 * dc;
    chDR = (clump - 0.5) * 0.18 * dc;
  } else if (abs(k - K_WOOL) < 0.5) {
    chH = (chNoise(p * 520.0) - 0.5) * 0.00008 * chDetail(520.0) + chFolds(p, 0.0035);
    alb *= 0.95 + 0.1 * chNoise(p * 60.0);
  } else if (abs(k - K_METAL) < 0.5) {
    chDR = (chNoise(p * 120.0) - 0.5) * 0.12;
  }
}

/** Porous things soak and darken; everything but metal and glass gets glossier when wet. */
float chWetDarken(float k) {
  return (abs(k - K_KNIT) < 0.5 || abs(k - K_WOVEN) < 0.5 || abs(k - K_DENIM) < 0.5 || abs(k - K_WOOL) < 0.5 || abs(k - K_FLORAL) < 0.5) ? 0.3
    : abs(k - K_HAIR) < 0.5 ? 0.2 : 0.0;
}
float chWetGloss(float k) {
  return (abs(k - K_METAL) < 0.5 || abs(k - K_GLASS) < 0.5 || abs(k - K_EYE) < 0.5) ? 0.0 : (k < K_SKIN + 0.5 ? 0.35 : 0.5);
}

/** Mikkelsen's surface-gradient bump with unnormalised screen derivatives, so heights stay in metres. */
vec3 chBump(vec3 surfPos, vec3 surfNorm, float h, float faceDirection) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

function patchBody(shader: WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uWet = characterLighting.wet;
  shader.uniforms.uRim = characterLighting.rim;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = mat; vAccent = accent; vAo = ao; vRest = position; vRestN = normal;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
chSurface(diffuseColor.rgb);
diffuseColor.rgb *= 1.0 - chWetDarken(vMat.z) * uWet;`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(vMat.x + chDR, 0.03, 1.0);
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, chWetGloss(vMat.z) * uWet);`)
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vMat.y;')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = chBump(-vViewPosition, normal, chH, faceDirection);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vMat.w;
{
  // Neon rim: at the silhouette the reflection looks past the body into the lit street behind it.
  vec3 toEye = normalize(vViewPosition);
  float rim = pow(1.0 - saturate(dot(normal, toEye)), 3.0);
  #ifdef USE_ENVMAP
    vec3 around = getIBLRadiance(toEye, normal, 0.55);
  #else
    vec3 around = vec3(0.04, 0.035, 0.05);
  #endif
  float sheen = vMat.y > 0.5 ? 0.3 : 1.0;
  totalEmissiveRadiance += rim * uRim * sheen * around * mix(diffuseColor.rgb, vec3(0.5), 0.5) * vAo;
}`)
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  // Skin scatters light into its own creases: occlusion bites it less than cloth.
  float ao = vMat.z > 0.5 && (vMat.z < K_SKIN + 0.5 || abs(vMat.z - K_TATTOO) < 0.5) ? mix(1.0, vAo, 0.55) : vAo;
  reflectedLight.indirectDiffuse *= ao;
  reflectedLight.indirectSpecular *= ao * ao;
  reflectedLight.directDiffuse *= mix(1.0, ao, 0.3);
  reflectedLight.directSpecular *= mix(1.0, ao, 0.5);
}`);
}

function inflateHull(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 hullNormal;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += hullNormal * ${OUTLINE_WIDTH.toFixed(3)};`);
}

export function createBodyMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  m.envMap = characterLighting.envMap;
  m.envMapIntensity = ENV_INTENSITY;
  m.onBeforeCompile = patchBody;
  m.customProgramCacheKey = () => 'character-body';
  return m;
}

export function createOutlineMaterial(color: number): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color, side: BackSide });
  m.onBeforeCompile = inflateHull;
  return m;
}
