/**
 * The frame: scene into a 4x MSAA half-float target,
 * bloom off the neon, then one grade pass that also carries every combat
 * effect, then tone mapping and sRGB, then the planar reflection the next
 * frame's puddles will sample. Levels ease towards their targets on
 * real time; impulses fire and fade by themselves in IMPULSE_SEC.
 */
import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { GameTime, IEngine, IRenderPipeline, RenderEffect } from '../../core/types';
import type { Reflection } from './Reflection';

const IMPULSE_SEC = 0.35;
/** Levels close ~95% of the gap in half a second. */
const LEVEL_RATE = 6;
const MSAA = 4;

const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uHeat: { value: 0 },
    uLow: { value: 0 },
    uBullet: { value: 0 },
    uDamage: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
  fragmentShader: /* glsl */ `
#define TAPS 8
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uHeat;
uniform float uLow;
uniform float uBullet;
uniform float uDamage;
uniform float uFlash;
varying vec2 vUv;

vec3 tap(vec2 uv, vec2 ca) {
  if (uBullet < 0.001) return texture2D(tDiffuse, uv).rgb;
  return vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
}

/** Zoom blur towards the centre (heat, a little in bullet time) with split colour fringes. */
vec3 scene(vec2 uv, vec2 dir) {
  vec2 ca = dir * 0.012 * uBullet;
  float blur = 0.035 * uHeat + 0.02 * uBullet;
  if (blur < 0.0005) return tap(uv, ca);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < TAPS; i++) acc += tap(uv - dir * blur * (float(i) / float(TAPS - 1)), ca);
  return acc / float(TAPS);
}

void main() {
  vec2 dir = vUv - 0.5;
  float r2 = dot(dir, dir);
  float edge = smoothstep(0.08, 0.5, r2);
  vec3 c = scene(vUv, dir);
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));

  // Night grade: teal in the shadows, magenta in the lights, a touch of contrast about mid grey.
  c *= mix(vec3(0.86, 1.0, 1.1), vec3(1.08, 0.93, 1.05), smoothstep(0.02, 0.8, luma));
  c = 0.18 * pow(max(c, 0.0) / 0.18, vec3(1.08));

  float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(grey), clamp(0.45 * uHeat + 0.65 * uLow, 0.0, 0.9));
  // Heat rim stays out at the frame edge so the fighters read clearly in the middle.
  c += vec3(1.0, 0.42, 0.08) * smoothstep(0.16, 0.5, r2) * uHeat * 0.45;
  float beat = pow(0.5 + 0.5 * sin(uTime * (5.0 + 3.0 * uLow)), 3.0);
  c = mix(c, vec3(0.45, 0.0, 0.0), edge * uLow * (0.35 + 0.45 * beat));
  c = mix(c, vec3(0.6, 0.01, 0.01), edge * uDamage * 0.85);
  c += vec3(uFlash * 2.5);

  c *= 1.0 - 0.4 * smoothstep(0.06, 0.55, r2);
  float g = fract(sin(dot(gl_FragCoord.xy + fract(uTime * 7.3) * 431.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  c = max(c * (1.0 + g * 0.07) + g * 0.003, 0.0);
  gl_FragColor = vec4(c, 1.0);
}
`,
};

export class PostProcessing implements IRenderPipeline {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private readonly target = { heat: 0, lowHealth: 0, bulletTime: 0 };
  private readonly level = { heat: 0, lowHealth: 0, bulletTime: 0 };
  private readonly peak = { damage: 0, flash: 0 };
  private readonly age = { damage: IMPULSE_SEC, flash: IMPULSE_SEC };

  constructor(
    private readonly engine: IEngine,
    private readonly reflection: Reflection,
  ) {
    const { renderer, scene, camera } = engine;
    // The scene renders into rt2 (read buffer): it alone needs depth and samples.
    const composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false }));
    composer.renderTarget2.dispose();
    composer.renderTarget2 = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: MSAA });
    composer.readBuffer = composer.renderTarget2;
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.9, 0.55, 0.8);
    this.grade = new ShaderPass(GRADE);
    // Even number of swapping passes (grade, output) so rt2 is the read buffer again every frame.
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(this.bloom);
    composer.addPass(this.grade);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  render(time: GameTime): void {
    this.step(time.realDt);
    const u = this.grade.uniforms;
    u.uTime!.value = time.realElapsed;
    u.uHeat!.value = this.level.heat;
    u.uLow!.value = this.level.lowHealth;
    u.uBullet!.value = this.level.bulletTime;
    u.uDamage!.value = this.pulse('damage');
    u.uFlash!.value = this.pulse('flash');
    this.composer.render(time.realDt);
    // Mirror for the next frame: its map and matrix travel together, so the lookup stays exact,
    // and the main render has already built this frame's shadow map for it to sample.
    const { renderer, scene, camera } = this.engine;
    this.reflection.render(renderer, scene, camera);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.reflection.setSize(width * pixelRatio, height * pixelRatio);
  }

  setEffect(name: RenderEffect, intensity: number): void {
    const v = Math.min(1, Math.max(0, intensity));
    if (name === 'damage' || name === 'flash') {
      this.peak[name] = v;
      this.age[name] = 0;
    } else {
      this.target[name] = v;
    }
  }

  private step(dt: number): void {
    const k = 1 - Math.exp(-dt * LEVEL_RATE);
    this.level.heat += (this.target.heat - this.level.heat) * k;
    this.level.lowHealth += (this.target.lowHealth - this.level.lowHealth) * k;
    this.level.bulletTime += (this.target.bulletTime - this.level.bulletTime) * k;
    this.age.damage += dt;
    this.age.flash += dt;
  }

  private pulse(name: 'damage' | 'flash'): number {
    const left = Math.max(0, 1 - this.age[name] / IMPULSE_SEC);
    return this.peak[name] * left * left;
  }
}
