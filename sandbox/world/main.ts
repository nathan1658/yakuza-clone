/**
 * World sandbox: the real engine, physics and World with a stub ctx and a fly camera.
 * Open /sandbox/world.html (optionally ?shot=percy|hennessy|sogo|typhoon|overview|screen|tram|pager|title&weather=clear).
 * Drag to look · WASD move · Q/E down/up · Shift fast
 * 1 percy · 2 hennessy · 3 sogo · 4 typhoon · 5 overview · 6 title orbit
 * C clear · V drizzle · B rain (3 s blend)
 */
import { Vector3 } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { GameEngine } from '../../src/core/GameEngine';
import { InputManager } from '../../src/core/InputManager';
import { PhysicsWorld } from '../../src/core/PhysicsWorld';
import type { GameContext, GameEvents, GameSystem, GameTime, WeatherKind } from '../../src/core/types';
import { World } from '../../src/world/World';

interface Shot {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
}

const SHOTS: Readonly<Record<string, Shot>> = {
  percy: { from: [-64, 2.4, -2], to: [-64, 5, -40] },
  hennessy: { from: [-30, 3.5, 17], to: [10, 5, 11] },
  sogo: { from: [82, 5, 6], to: [86, 14, 50] },
  typhoon: { from: [-40, 4, -168], to: [-10, 1, -215] },
  overview: { from: [0, 120, 60], to: [0, 0, -60] },
  screen: { from: [96, 3, 36], to: [103, 13, -26] },
  tram: { from: [34, 2.2, 3.2], to: [22, 2.5, 10] },
  pager: { from: [-38.8, 1.0, 21.6], to: [-40, 0, 22.6] },
};
const SHOT_KEYS = ['percy', 'hennessy', 'sogo', 'typhoon', 'overview'];
const TITLE = { radius: 34, height: 11, lookHeight: 14, speed: 0.06 } as const;
const WEATHER_KEYS: Readonly<Record<string, WeatherKind>> = { KeyC: 'clear', KeyV: 'drizzle', KeyB: 'rain' };
const SPEED = 12;

/** Free camera; the stub player stands on the ground under it so zones and triggers follow. */
class FlyCam implements GameSystem {
  readonly name = 'flycam';
  orbit = false;
  private yaw = 0;
  private pitch = 0;
  private angle = 0;
  private readonly held = new Set<string>();
  private readonly move = new Vector3();
  private readonly look = new Vector3();

  constructor(
    private readonly ctx: GameContext,
    private readonly player: { position: Vector3 },
  ) {}

  init(): void {
    const canvas = this.ctx.engine.canvas;
    window.addEventListener('keydown', (e) => this.held.add(e.code));
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    canvas.addEventListener('pointermove', (e) => {
      if (!(e.buttons & 1)) return;
      this.yaw -= e.movementX * 0.003;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.003));
    });
  }

  shot(s: Shot): void {
    this.orbit = false;
    const [x, y, z] = s.from;
    const dx = s.to[0] - x;
    const dy = s.to[1] - y;
    const dz = s.to[2] - z;
    this.ctx.engine.camera.position.set(x, y, z);
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  update(time: GameTime): void {
    const camera = this.ctx.engine.camera;
    if (this.orbit) {
      const c = this.ctx.world.getLocation('sogo_crossing').position;
      this.angle += TITLE.speed * time.realDt;
      camera.position.set(c.x + Math.sin(this.angle) * TITLE.radius, c.y + TITLE.height, c.z + Math.cos(this.angle) * TITLE.radius);
      camera.lookAt(this.look.set(c.x, c.y + TITLE.lookHeight, c.z));
    } else {
      const h = this.held;
      const f = (h.has('KeyW') ? 1 : 0) - (h.has('KeyS') ? 1 : 0);
      const r = (h.has('KeyD') ? 1 : 0) - (h.has('KeyA') ? 1 : 0);
      const u = (h.has('KeyE') ? 1 : 0) - (h.has('KeyQ') ? 1 : 0);
      const speed = SPEED * (h.has('ShiftLeft') || h.has('ShiftRight') ? 4 : 1) * time.realDt;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      this.move.set(-sin * f + cos * r, u, -cos * f - sin * r).multiplyScalar(speed);
      camera.position.add(this.move);
      camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
    this.player.position.set(camera.position.x, 0, camera.position.z);
  }
}

/** Frame stats, read after the engine has rendered the frame. */
class Hud implements GameSystem {
  readonly name = 'hud';
  private fps = 60;
  private calls = 0;
  private tris = 0;
  private lastText = 0;
  private readonly sample = (): void => {
    const info = this.ctx.engine.renderer.info.render;
    this.calls = info.calls;
    this.tris = info.triangles;
  };

  constructor(
    private readonly ctx: GameContext,
    private readonly el: HTMLElement,
  ) {}

  init(): void {
    // Reflection, scene and post passes are separate renders: count them all.
    this.ctx.engine.renderer.info.autoReset = false;
  }

  update(time: GameTime): void {
    this.ctx.engine.renderer.info.reset();
    queueMicrotask(this.sample);
    if (time.realDt > 0) this.fps += (1 / time.realDt - this.fps) * 0.05;
    if (time.realElapsed - this.lastText < 0.25) return;
    this.lastText = time.realElapsed;
    const p = this.ctx.engine.camera.position;
    const w = this.ctx.world;
    this.el.textContent = [
      `fps ${this.fps.toFixed(0)}  calls ${this.calls}  tris ${(this.tris / 1000).toFixed(0)}k`,
      `zone ${w.currentZone}  weather ${w.weather}`,
      `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`,
      '1-5 shots · 6 title · C/V/B weather',
    ].join('\n');
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('game-root')!;
  const events = new EventBus<GameEvents>();
  const input = new InputManager(root);
  const physics = await PhysicsWorld.create();
  const engine = new GameEngine(root, input, physics);
  const player = { position: new Vector3(), height: 1.8, radius: 0.35 };
  const flags: Record<string, unknown> = {};

  const ctx = {
    engine,
    events,
    input,
    physics,
    entities: { player, getCharacters: () => [player] },
    combat: { inCombat: false },
    narrative: { getFlag: (id: string) => flags[id] },
    audio: { playSfx: (id: string) => console.info('[sandbox] sfx', id) },
  } as unknown as GameContext;
  const world = new World(ctx);
  Object.assign(ctx, { world });

  const hud = document.getElementById('hud')!;
  world.onBuildProgress = (p, label) => (hud.textContent = `${label} ${(p * 100).toFixed(0)}%`);
  await world.init();

  const cam = new FlyCam(ctx, player);
  const stats = new Hud(ctx, hud);
  for (const s of [cam, stats]) s.init();
  for (const s of [cam, world, stats]) engine.addSystem(s);

  const shot = (name: string): void => {
    if (name === 'title') cam.orbit = true;
    else cam.shot(SHOTS[name] ?? SHOTS.percy);
  };
  const params = new URLSearchParams(location.search);
  shot(params.get('shot') ?? 'percy');
  const weather = params.get('weather');
  if (weather === 'clear' || weather === 'drizzle' || weather === 'rain') world.setWeather(weather);

  window.addEventListener('keydown', (e) => {
    const digit = /^Digit([1-6])$/.exec(e.code);
    if (digit) shot(SHOT_KEYS[Number(digit[1]) - 1] ?? 'title');
    const kind = WEATHER_KEYS[e.code];
    if (kind) world.setWeather(kind, 3);
  });
  events.on('zone:changed', ({ from, to }) => console.info('[sandbox] zone', from, '->', to));
  events.on('trigger:enter', ({ triggerId }) => console.info('[sandbox] enter', triggerId));

  engine.start();
  Object.assign(window, { __world: { ctx, engine, world, shot, flags } });
}

void boot();
