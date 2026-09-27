import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three';
import { FIXED_DT } from './types';
import type { GameSystem, GameTime, IEngine, IInputManager, IPhysicsWorld, IRenderPipeline } from './types';
import { FixedStepAccumulator, TimeScaleSchedule } from './FrameTiming';

const MAX_FIXED_STEPS = 5;
const MAX_REAL_DT = 0.1;
const MAX_PIXEL_RATIO = 1.5;
const BASE_FOV = 55;

type Phase = 'fixedUpdate' | 'update' | 'lateUpdate';

export class GameEngine implements IEngine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  paused = false;

  private readonly clock: GameTime = { dt: 0, realDt: 0, elapsed: 0, realElapsed: 0, frame: 0 };
  private readonly systems: GameSystem[] = [];
  private readonly timeScaleSchedule = new TimeScaleSchedule();
  private readonly fixed = new FixedStepAccumulator(FIXED_DT, MAX_FIXED_STEPS);
  private readonly reportedErrors = new Set<string>();
  private readonly resizeObserver: ResizeObserver;
  private pipeline: IRenderPipeline | null = null;
  private lastFrameMs = -1;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  constructor(
    private readonly container: HTMLElement,
    private readonly input: IInputManager,
    private readonly physics: IPhysicsWorld,
  ) {
    this.renderer = createRenderer();
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);

    this.camera = new PerspectiveCamera(BASE_FOV, 1, 0.1, 900);
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  get time(): Readonly<GameTime> {
    return this.clock;
  }

  get timeScale(): number {
    return this.timeScaleSchedule.value;
  }

  get renderPipeline(): IRenderPipeline | null {
    return this.pipeline;
  }

  setTimeScale(scale: number, realDuration?: number): void {
    this.timeScaleSchedule.set(scale, realDuration);
  }

  addSystem(system: GameSystem): void {
    this.systems.push(system);
  }

  setRenderPipeline(pipeline: IRenderPipeline): void {
    this.pipeline = pipeline;
    pipeline.setSize(this.width, this.height, this.pixelRatio);
  }

  start(): void {
    this.lastFrameMs = -1;
    this.renderer.setAnimationLoop(this.frame);
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  private readonly frame = (nowMs: number): void => {
    this.renderer.info.reset();
    this.tick(this.measureRealDt(nowMs));
    this.runFixedSteps();
    this.physics.syncLinked();
    this.runPhase('update');
    this.runPhase('lateUpdate');
    this.render();
    this.input.endFrame();
  };

  private measureRealDt(nowMs: number): number {
    const dt = this.lastFrameMs < 0 ? 0 : (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;
    return Math.min(MAX_REAL_DT, Math.max(0, dt));
  }

  /** Advance clocks and latch input for this frame. */
  private tick(realDt: number): void {
    const scale = this.timeScaleSchedule.advance(realDt);
    const t = this.clock;
    t.realDt = realDt;
    t.dt = this.paused ? 0 : realDt * scale;
    t.elapsed += t.dt;
    t.realElapsed += realDt;
    t.frame++;
    this.input.beginFrame(realDt);
  }

  private runFixedSteps(): void {
    const steps = this.fixed.take(this.clock.dt);
    for (let i = 0; i < steps; i++) {
      this.runPhase('fixedUpdate');
      this.stepPhysics();
    }
  }

  private stepPhysics(): void {
    try {
      this.physics.step(FIXED_DT);
    } catch (err) {
      this.reportError('physics', 'step', err);
    }
  }

  /** Call `phase` on every system; a throwing system is logged (once) and skipped. */
  private runPhase(phase: Phase): void {
    const systems = this.systems;
    const arg = phase === 'fixedUpdate' ? FIXED_DT : this.clock;
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      try {
        (s[phase] as ((a: unknown) => void) | undefined)?.call(s, arg);
      } catch (err) {
        this.reportError(s.name, phase, err);
      }
    }
  }

  private render(): void {
    const pipeline = this.pipeline;
    if (!pipeline) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    try {
      pipeline.render(this.clock);
    } catch (err) {
      this.reportError('renderPipeline', 'render', err);
      // Keep a picture on screen even if post-processing is broken.
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
  }

  private reportError(owner: string, phase: string, err: unknown): void {
    const key = `${owner}:${phase}`;
    if (this.reportedErrors.has(key)) return;
    this.reportedErrors.add(key);
    console.error(`[GameEngine] ${key} threw (further errors from it are suppressed)`, err);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.width = w;
    this.height = h;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline?.setSize(w, h, this.pixelRatio);
  }
}

function createRenderer(): WebGLRenderer {
  const renderer = new WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  // three r186 removed PCFSoftShadowMap; PCFShadowMap is now the soft, filtered variant.
  renderer.shadowMap.type = PCFShadowMap;
  renderer.info.autoReset = false;
  return renderer;
}
