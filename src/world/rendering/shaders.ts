/**
 * GLSL shared by the world's material hooks. Pure strings; the hooks in
 * materials.ts decide where they are injected.
 */

export const NOISE_GLSL = /* glsl */ `
float worldHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float worldNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = worldHash(i);
  float b = worldHash(i + vec2(1.0, 0.0));
  float c = worldHash(i + vec2(0.0, 1.0));
  float d = worldHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

/**
 * facade(albedo) -> emissive. vFacadeUv is metres (along wall, height);
 * vFacade = (style, seed 0..1000, grit, wall top). Styles: 0 tong lau,
 * 1 concrete slab block, 2 office curtain wall, 3 single-storey shops,
 * 4 side/back wall. Per style: bay width, window width, window height, sill.
 */
export const FACADE_FRAGMENT = /* glsl */ `
const vec4 FACADE_BAYS[5] = vec4[5](
  vec4(3.2, 1.9, 1.5, 0.8),
  vec4(1.6, 1.46, 1.25, 0.95),
  vec4(1.8, 1.74, 2.3, 0.4),
  vec4(3.0, 0.0, 1.0, 1.0),
  vec4(5.5, 0.8, 1.0, 1.1)
);
const float FACADE_LIT[5] = float[5](0.42, 0.33, 0.5, 0.0, 0.16);

float facadeRect(vec2 p, vec2 lo, vec2 hi, vec2 aa) {
  vec2 s = smoothstep(lo - aa, lo + aa, p) - smoothstep(hi - aa, hi + aa, p);
  return s.x * s.y;
}

vec3 facadeTint(float h) {
  return h < 0.5 ? vec3(1.0, 0.6, 0.3) : (h < 0.9 ? vec3(0.7, 0.85, 1.0) : vec3(0.45, 1.0, 0.62));
}

// Ground floor: a row of shops, each either open and lit or behind a roller shutter.
vec3 facadeShops(inout vec3 alb, vec2 p, vec2 aa, float seed, float lod) {
  const float SHOP = 4.6;
  float shop = floor(p.x / SHOP);
  float fu = p.x - shop * SHOP;
  float h = worldHash(vec2(shop + seed, 3.7));
  float opening = facadeRect(vec2(fu, p.y), vec2(0.35, -1.0), vec2(SHOP - 0.35, 3.1), aa);
  float fascia = facadeRect(vec2(fu, p.y), vec2(-1.0, 3.3), vec2(SHOP + 1.0, 4.4), aa);
  vec3 emi = vec3(0.0);
  if (h < 0.62) {
    vec3 inside = h < 0.3 ? vec3(1.0, 0.75, 0.48) : vec3(0.78, 0.92, 1.0);
    // Shelves of goods: blocks of random brightness, ~0.45 m wide and 0.4 m tall.
    float goods = mix(0.4 + 0.6 * worldHash(floor(vec2(fu * 2.2 + shop * 13.0, p.y * 2.5)) + seed), 0.7, lod);
    float tubes = 0.3 + 0.7 * smoothstep(1.8, 3.0, p.y);
    emi = opening * inside * tubes * goods * (0.5 + 0.4 * worldHash(vec2(shop, seed)));
    alb = mix(alb, vec3(0.03), opening);
  } else {
    float ribs = mix(0.82 + 0.18 * sin(p.y * 56.0), 0.9, lod);
    alb = mix(alb, vec3(0.3, 0.31, 0.32) * ribs, opening);
  }
  alb *= 1.0 - 0.5 * fascia;
  return emi;
}

vec3 facade(inout vec3 alb) {
  vec2 p = vFacadeUv;
  // Varyings are not bit-exact across a triangle; round before hashing or every pixel differs.
  float seed = floor(vFacade.y + 0.5);
  float top = vFacade.w;
  int style = int(vFacade.x + 0.5);
  vec2 aa = max(fwidth(p), vec2(1e-4)) * 0.75;
  float lod = smoothstep(0.25, 0.8, max(aa.x, aa.y));
  // Rain-streaked grime: long vertical smears, worse on gritty blocks.
  float smear = worldNoise(vec2(p.x * 1.3 + seed, p.y * 0.07));
  alb *= 1.0 - vFacade.z * 0.6 * smear * smear;
  if (style < 4 && p.y < 4.5) return facadeShops(alb, p, aa, seed, lod);
  vec4 b = FACADE_BAYS[style];
  if (p.y < 4.5 || p.y > top - 0.9 || b.y <= 0.0) {
    alb *= p.y > top - 0.5 ? 1.25 : 1.0;
    return vec3(0.0);
  }
  float fy = (p.y - 4.5) / 3.0;
  float fl = floor(fy);
  float fv = (fy - fl) * 3.0;
  float bay = floor(p.x / b.x);
  float fu = p.x - bay * b.x;
  float x0 = 0.5 * (b.x - b.y);
  vec2 q = vec2(fu, fv);
  float win = facadeRect(q, vec2(x0, b.w), vec2(x0 + b.y, b.w + b.z), aa);
  float h = worldHash(vec2(bay + seed, fl + seed * 0.37));
  float lit = step(h, FACADE_LIT[style]);
  float curtain = 0.6 + 0.4 * smoothstep(b.w, b.w + b.z, fv);
  vec3 glass = vec3(0.02, 0.025, 0.03);
  if (style == 2) {
    // Offices light whole floors; the spandrels are dark glass too.
    lit = step(worldHash(vec2(fl, seed)), 0.5) * step(0.12, h);
    alb = mix(alb, vec3(0.05, 0.07, 0.09), 0.8);
    glass = vec3(0.03, 0.05, 0.07);
  } else if (style == 0) {
    // Balcony slab under each floor, window grilles, an AC box under some windows.
    alb *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.3, fv));
    curtain *= mix(1.0 - 0.5 * step(0.8, fract(fu * 6.0)), 1.0, lod);
    float ac = facadeRect(q, vec2(x0 + 0.15, 0.1), vec2(x0 + 0.85, 0.65), aa) * step(0.45, worldHash(vec2(bay, fl + 5.0)));
    alb = mix(alb, vec3(0.55, 0.56, 0.54), ac * (1.0 - lod));
  }
  vec3 tint = facadeTint(worldHash(vec2(bay * 1.7, fl + seed)));
  float level = 0.3 + 0.5 * worldHash(vec2(bay + 11.0, fl * 3.1 + seed));
  vec3 emi = win * lit * tint * level * curtain;
  alb = mix(alb, glass, win);
  // Far away the windows are sub-pixel: fade to their average so they don't shimmer.
  float area = (b.y * b.z) / (b.x * 3.0);
  vec3 average = vec3(0.85, 0.72, 0.6) * FACADE_LIT[style] * area * 0.55;
  return mix(emi, average, lod);
}
`;

/**
 * groundSurface(albedo) -> puddle mask; groundRoughness(r, puddle).
 * vGround = (surface, puddle affinity, 0, 0). Surfaces: 0 asphalt, 1 tiles,
 * 2 concrete slabs, 3 timber deck, 4 plaza stone, 5 road paint.
 */
export const GROUND_FRAGMENT = /* glsl */ `
float groundGrid(vec2 p, vec2 size, vec2 aa) {
  vec2 f = abs(fract(p / size + 0.5) - 0.5) * size;
  vec2 l = 1.0 - smoothstep(vec2(0.0), aa * 1.5 + 0.015, f);
  return max(l.x, l.y);
}

float groundSurface(inout vec3 alb) {
  vec2 p = vWorldPos.xz;
  float s = vGround.x;
  vec2 aa = max(fwidth(p), vec2(1e-4));
  float near = 1.0 - smoothstep(0.05, 0.3, max(aa.x, aa.y));
  alb *= 0.8 + 0.2 * worldNoise(p * 3.1) + 0.2 * worldNoise(p * 0.45);
  float joints = 0.0;
  if (s > 0.5 && s < 1.5) joints = 0.35 * groundGrid(p, vec2(0.6), aa);
  else if (s > 1.5 && s < 2.5) joints = 0.25 * groundGrid(p, vec2(3.0), aa);
  else if (s > 2.5 && s < 3.5) joints = 0.55 * groundGrid(p, vec2(1e4, 0.24), aa);
  else if (s > 3.5 && s < 4.5) joints = 0.3 * groundGrid(p, vec2(1.2, 0.6), aa);
  alb *= 1.0 - joints * near;
  // Puddles gather where the noise dips; they only exist once it has rained a while.
  float n = worldNoise(p * 0.21) * 0.7 + worldNoise(p * 0.9) * 0.3;
  float puddle = smoothstep(0.58, 0.64, n) * smoothstep(0.3, 0.8, uWet) * vGround.y;
  alb *= 1.0 - 0.45 * uWet;
  alb *= 1.0 - 0.4 * puddle;
  return puddle;
}

float groundRoughness(float r, float puddle) {
  return mix(mix(r, r * 0.45, uWet), 0.05, puddle);
}

/** Puddles mirror the neon, jiggled by the rain; merely wet paving smears it into streaks. */
vec3 groundReflection(float puddle) {
  vec2 p = vWorldPos.xz * 5.0;
  vec2 ripple = (vec2(worldNoise(p + uTime * 4.0), worldNoise(p.yx - uTime * 4.0)) - 0.5) * 0.008 * uRain;
  vec3 sharp = reflSample(vWorldPos, ripple, 0.0);
  vec3 smear = (reflSample(vWorldPos, vec2(0.0), 3.0)
    + reflSample(vWorldPos, vec2(0.0, 0.02), 3.5)
    + reflSample(vWorldPos, vec2(0.0, -0.02), 3.5)) * (1.0 / 3.0);
  return mix(smear * 0.5 * uWet * vGround.y, sharp, puddle) * reflFresnel(vWorldPos);
}
`;

/**
 * Lookups into the planar reflection of y = 0. Sampling a surface point's
 * mirror image (x, -y, z) gives the exact reflected direction for a surface
 * at any height, so the harbour (1.3 m down) can share the street's map.
 */
export const REFLECT_GLSL = /* glsl */ `
uniform sampler2D uReflMap;
uniform mat4 uReflMatrix;

vec3 reflSample(vec3 p, vec2 offset, float lod) {
  vec4 c = uReflMatrix * vec4(p.x, -p.y, p.z, 1.0);
  return texture2D(uReflMap, c.xy / c.w + offset, lod).rgb;
}

float reflFresnel(vec3 p) {
  float c = clamp(normalize(cameraPosition - p).y, 0.0, 1.0);
  return 0.02 + 0.98 * pow(1.0 - c, 5.0);
}
`;

/**
 * Moored boats: data = (pivot x, pivot z, phase, amplitude). Small roll and
 * pitch about the hull's waterline point plus a slow heave; amplitude 0 is
 * a hull that does not move. WATER_Y is substituted with the water level.
 */
export const BOB_VERTEX = /* glsl */ `
{
  float bobPhase = data.z;
  float bobAmp = data.w;
  vec3 bobPivot = vec3(data.x, WATER_Y, data.y);
  float roll = bobAmp * 0.045 * sin(uTime * 1.3 + bobPhase);
  float pitch = bobAmp * 0.025 * sin(uTime * 0.83 + bobPhase * 1.7);
  float heave = bobAmp * 0.07 * sin(uTime * 1.07 + bobPhase * 0.6);
  vec3 p = transformed - bobPivot;
  float cr = cos(roll), sr = sin(roll);
  p.xy = vec2(cr * p.x - sr * p.y, sr * p.x + cr * p.y);
  float cp = cos(pitch), sp = sin(pitch);
  p.zy = vec2(cp * p.z - sp * p.y, sp * p.z + cp * p.y);
  transformed = p + bobPivot + vec3(0.0, heave, 0.0);
}
`;

/**
 * Harbour surface normal: a slow two-octave swell, a long diagonal wave and,
 * close to the camera, rain rings. Returned in view space for the lighting.
 */
export const WATER_FRAGMENT = /* glsl */ `
float waterHeight(vec2 p) {
  return 0.5 * worldNoise(p * 0.18 + vec2(uTime * 0.05, uTime * 0.03))
       + 0.25 * worldNoise(p * 0.7 - vec2(uTime * 0.11, -uTime * 0.07))
       + 0.12 * sin(p.x * 0.4 + p.y * 0.25 + uTime * 1.2);
}

vec2 waterRings(vec2 p) {
  vec2 cell = floor(p / 1.2);
  vec2 f = p / 1.2 - cell - 0.5;
  float age = fract(uTime * 0.9 + worldHash(cell));
  vec2 q = f - (vec2(worldHash(cell + 7.1), worldHash(cell + 3.3)) - 0.5) * 0.5;
  float r = length(q);
  float front = age * 0.5;
  float ring = sin((r - front) * 40.0) * smoothstep(0.08, 0.0, abs(r - front)) * (1.0 - age);
  return r > 0.001 ? q / r * ring : vec2(0.0);
}

vec3 waterNormal(vec3 n) {
  vec2 p = vWorldPos.xz;
  float e = 0.15;
  float h = waterHeight(p);
  vec2 g = vec2(waterHeight(p + vec2(e, 0.0)) - h, waterHeight(p + vec2(0.0, e)) - h) / e * 0.6;
  float near = smoothstep(45.0, 12.0, distance(vWorldPos, cameraPosition));
  g += waterRings(p) * 0.35 * uRain * near;
  return normalize((viewMatrix * vec4(normalize(vec3(-g.x, 1.0, -g.y)), 0.0)).xyz);
}

vec3 waterReflection(vec3 viewNormal) {
  vec3 n = normalize((vec4(viewNormal, 0.0) * viewMatrix).xyz);
  return reflSample(vWorldPos, n.xz * 0.06, 0.5) * reflFresnel(vWorldPos);
}
`;
