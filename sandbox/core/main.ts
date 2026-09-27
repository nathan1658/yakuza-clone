/**
 * Core sandbox: engine loop + input + Rapier + camera rig + save, with no other modules.
 * Open /sandbox/core.html. Click to lock the mouse; WASD/Shift move.
 * 1 title · 2 free roam · 3 combat (lock dummy) · 4 dialogue · 5 cutscene · 6 menu
 * H shake+punch · T bullet time · U unlock · O save · P load · N reset
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { EventBus } from '../../src/core/EventBus';
import { GameEngine } from '../../src/core/GameEngine';
import { InputManager } from '../../src/core/InputManager';
import { PhysicsWorld } from '../../src/core/PhysicsWorld';
import { CameraRig } from '../../src/core/CameraRig';
import { SaveSystem } from '../../src/core/SaveSystem';
import type {
  CameraShot,
  GameContext,
  GameEvents,
  GameModeId,
  GameSystem,
  GameTime,
  ICharacterBody,
  ISaveable,
} from '../../src/core/types';

const WALK_SPEED = 4.5;
const RUN_SPEED = 8;
const GRAVITY = 20;
const SPAWN = new Vector3(0, 0, 0);
const MOVE_STATES: ReadonlySet<GameModeId> = new Set<GameModeId>(['freeRoam', 'combat']);

class SandboxState {
  mode: GameModeId = 'boot';
  constructor(private readonly events: EventBus<GameEvents>) {}
  set(to: GameModeId): void {
    const from = this.mode;
    if (from === to) return;
    this.mode = to;
    this.events.emit('state:changed', { from, to, payload: undefined });
  }
}

/** Camera-relative KCC movement for a capsule; also the 'player' saveable. */
class SandboxPlayer implements GameSystem, ISaveable {
  readonly name = 'sandboxPlayer';
  readonly saveKey = 'player';
  private vy = 0;
  private readonly displacement = new Vector3();

  constructor(
    private readonly ctx: GameContext,
    private readonly body: ICharacterBody,
    readonly object: Object3D,
  ) {}

  init(): void {
    this.reset();
  }

  fixedUpdate(dt: number): void {
    const { input, state, cameraRig } = this.ctx;
    const move = input.getMoveVector();
    const k = MOVE_STATES.has(state.mode) ? (input.isDown('sprint') ? RUN_SPEED : WALK_SPEED) * dt : 0;
    const yaw = cameraRig.getYaw();
    const dx = (Math.sin(yaw) * move.y - Math.cos(yaw) * move.x) * k;
    const dz = (Math.cos(yaw) * move.y + Math.sin(yaw) * move.x) * k;
    this.vy = this.body.grounded ? -1 : this.vy - GRAVITY * dt;
    this.body.move(this.displacement.set(dx, this.vy * dt, dz));
    if (dx * dx + dz * dz > 1e-10) this.object.rotation.y = Math.atan2(dx, dz);
  }

  update(): void {
    this.object.position.copy(this.body.position);
  }

  serialize(): unknown {
    const p = this.body.position;
    return { x: p.x, y: p.y, z: p.z, yaw: this.object.rotation.y };
  }

  deserialize(data: unknown): void {
    const d = data as Record<string, unknown>;
    const nums = [d.x, d.y, d.z, d.yaw];
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) throw new Error('bad player save');
    this.place(new Vector3(d.x as number, d.y as number, d.z as number), d.yaw as number);
  }

  reset(): void {
    this.place(SPAWN, 0);
  }

  private place(foot: Vector3, yaw: number): void {
    this.body.teleport(foot);
    this.object.position.copy(foot);
    this.object.rotation.y = yaw;
    this.vy = 0;
    this.ctx.cameraRig.snapBehindTarget();
  }
}

function material(color: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.8 });
}

function addStaticBox(engine: GameEngine, physics: PhysicsWorld, center: Vector3, half: Vector3, color: number): void {
  const mesh = new Mesh(new BoxGeometry(half.x * 2, half.y * 2, half.z * 2), material(color));
  mesh.position.copy(center);
  mesh.castShadow = mesh.receiveShadow = true;
  engine.scene.add(mesh);
  physics.createStaticBox(center, half);
}

function addCharacterMesh(engine: GameEngine, color: number, at: Vector3): Object3D {
  const root = new Object3D();
  const body = new Mesh(new CapsuleGeometry(0.35, 1.1, 4, 12), material(color));
  body.position.y = 0.9;
  const nose = new Mesh(new BoxGeometry(0.15, 0.15, 0.3), material(0xffffff));
  nose.position.set(0, 1.55, 0.35);
  body.castShadow = nose.castShadow = true;
  root.add(body, nose);
  root.position.copy(at);
  engine.scene.add(root);
  return root;
}

function buildLevel(engine: GameEngine, physics: PhysicsWorld): void {
  engine.scene.background = new Color(0x1b1f27);
  engine.scene.add(new HemisphereLight(0xbcd0ff, 0x3a3228, 1.4));
  const sun = new DirectionalLight(0xfff1dd, 2.2);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 });
  engine.scene.add(sun);

  addStaticBox(engine, physics, new Vector3(0, -0.5, 0), new Vector3(40, 0.5, 40), 0x4a4d52);
  addStaticBox(engine, physics, new Vector3(0, 2, -3), new Vector3(6, 2, 0.3), 0x8a5a44); // wall behind spawn
  addStaticBox(engine, physics, new Vector3(-8, 3, 6), new Vector3(0.6, 3, 0.6), 0x6b7a8f);
  addStaticBox(engine, physics, new Vector3(8, 3, 6), new Vector3(0.6, 3, 0.6), 0x6b7a8f);
  addStaticBox(engine, physics, new Vector3(0, 0.25, 12), new Vector3(3, 0.25, 2), 0x5b6b4f); // step
  for (let i = 0; i < 3; i++) {
    const crate = new Mesh(new BoxGeometry(0.8, 0.8, 0.8), material(0xb08a4a));
    crate.position.set(4, 0.4 + i * 0.85, 3);
    crate.castShadow = crate.receiveShadow = true;
    engine.scene.add(crate);
    physics.createDynamicBox(crate, new Vector3(0.4, 0.4, 0.4));
  }
}

function cutsceneShots(player: Object3D): CameraShot[] {
  const head = () => player.position.clone().setY(player.position.y + 1.6);
  return [
    { position: new Vector3(-10, 6, 14), toPosition: new Vector3(10, 6, 14), lookAt: head, duration: 2.5, ease: 'inOutQuad', fov: 40 },
    { position: new Vector3(0, 1.2, 4), toPosition: new Vector3(0, 1.8, 2.5), lookAt: head, duration: 1.5, fov: 30 },
  ];
}

class Hud implements GameSystem {
  readonly name = 'sandboxHud';
  constructor(
    private readonly ctx: GameContext,
    private readonly el: HTMLElement,
    private readonly rig: CameraRig,
  ) {}
  init(): void {}
  update(time: GameTime): void {
    if (time.frame % 10 !== 0) return;
    const { engine, state, input, save } = this.ctx;
    const p = this.ctx.entities.player.object3d.position;
    const c = engine.camera.position;
    this.el.textContent = [
      `state ${state.mode}   camera ${this.rig.mode}   fov ${engine.camera.fov.toFixed(1)}`,
      `fps ${(1 / Math.max(time.realDt, 1e-3)).toFixed(0)}   timeScale ${engine.timeScale.toFixed(2)}   locked ${input.pointerLocked}`,
      `player ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}   camera ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${c.z.toFixed(1)}`,
      `playTime ${save.playTimeSec.toFixed(1)}s   save ${save.hasSave() ? 'yes' : 'no'}`,
      '1 title 2 roam 3 combat 4 dialogue 5 cutscene 6 menu | H shake T slow-mo U unlock | O save P load N reset',
    ].join('\n');
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('game-root')!;
  const events = new EventBus<GameEvents>();
  const input = new InputManager(root);
  const physics = await PhysicsWorld.create();
  const engine = new GameEngine(root, input, physics);
  const state = new SandboxState(events);
  buildLevel(engine, physics);

  const playerObject = addCharacterMesh(engine, 0x2e6fd8, SPAWN);
  const enemy = addCharacterMesh(engine, 0xc0392b, new Vector3(5, 0, 9));
  const npc = addCharacterMesh(engine, 0x27ae60, new Vector3(-2, 0, 4));
  npc.rotation.y = Math.PI;

  const ctx = {
    engine,
    events,
    input,
    state,
    physics,
    world: { getLocation: () => ({ position: new Vector3(0, 0, 0), yaw: 0 }) },
    entities: { player: { object3d: playerObject } },
  } as unknown as GameContext & { cameraRig: CameraRig; save: SaveSystem };
  const rig = new CameraRig(ctx);
  const save = new SaveSystem(ctx);
  Object.assign(ctx, { cameraRig: rig, save });

  const player = new SandboxPlayer(ctx, physics.createCharacterBody(SPAWN, 0.35, 1.8), playerObject);
  const hud = new Hud(ctx, document.getElementById('hud')!, rig);
  const systems: GameSystem[] = [save, rig, player, hud];
  for (const s of systems) s.init();
  save.register(player);
  for (const s of [player, rig, save, hud]) engine.addSystem(s);
  rig.setFollowTarget(playerObject);

  const keys: Record<string, () => void> = {
    Digit1: () => state.set('title'),
    Digit2: () => state.set('freeRoam'),
    Digit3: () => (state.set('combat'), rig.setLockTarget(enemy)),
    Digit4: () => (rig.setDialogueFraming(playerObject, npc), state.set('dialogue')),
    Digit5: () => (state.set('cutscene'), void rig.playSequence(cutsceneShots(playerObject)).then(() => state.set('freeRoam'))),
    Digit6: () => state.set('menu'),
    KeyH: () => (rig.shake(0.7, 0.5), rig.punch(-8, 0.35)),
    KeyT: () => engine.setTimeScale(0.2, 2),
    KeyU: () => rig.setLockTarget(null),
    KeyO: () => save.save({ chapterZh: '沙盒', locationZh: '測試場' }),
    KeyP: () => save.load(),
    KeyN: () => save.resetAll(),
  };
  window.addEventListener('keydown', (e) => {
    if (!e.repeat) keys[e.code]?.();
  });
  root.addEventListener('click', () => {
    if (MOVE_STATES.has(state.mode)) input.requestPointerLock();
  });
  events.on('save:done', ({ meta }) => console.info('[sandbox] saved', meta));

  state.set('title');
  engine.start();
  Object.assign(window, { __core: { ctx, engine, rig, save, state, player: playerObject, enemy, npc, physics } });
}

void boot();
