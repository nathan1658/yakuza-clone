import { describe, expect, it, vi } from 'vitest';
import { Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';
import { CameraRig } from './CameraRig';
import { EventBus } from './EventBus';
import { CG } from './types';
import type { CameraShot, GameContext, GameEvents, GameModeId, GameTime } from './types';

const FOLLOW_REACH = Math.hypot(4.4, 0.3); // orbit distance + shoulder offset
const SOGO = new Vector3(100, 0, 50);

function setup() {
  const events = new EventBus<GameEvents>();
  const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 900);
  const state = { mode: 'boot' as GameModeId };
  const look = { x: 0, y: 0 };
  const input = { pointerLocked: false, getLookDelta: () => look };
  const wall = { distance: null as number | null };
  const raycast = vi.fn((_o: Vector3, _d: Vector3, maxDist: number, _groups?: number) =>
    wall.distance !== null && wall.distance <= maxDist ? { distance: wall.distance } : null,
  );
  const getLocation = vi.fn(() => ({ position: SOGO.clone(), yaw: 0 }));
  const scene = new Scene();
  const player = new Object3D();
  scene.add(player);
  const ctx = {
    engine: { camera },
    events,
    input,
    state,
    physics: { raycast },
    world: { getLocation },
    entities: { player: { object3d: player } },
  } as unknown as GameContext;

  const rig = new CameraRig(ctx);
  rig.init();
  const time: GameTime = { dt: 0, realDt: 0, elapsed: 0, realElapsed: 0, frame: 0 };

  function frame(realDt = 1 / 60, dt = realDt): void {
    time.realDt = realDt;
    time.dt = dt;
    time.realElapsed += realDt;
    time.elapsed += dt;
    time.frame++;
    rig.lateUpdate(time);
  }
  function run(seconds: number, perFrame?: () => void): void {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      perFrame?.();
      frame();
    }
  }
  function setState(to: GameModeId): void {
    const from = state.mode;
    state.mode = to;
    events.emit('state:changed', { from, to, payload: undefined });
  }
  function anchor(): Vector3 {
    return player.position.clone().add(new Vector3(0, 1.55, 0));
  }
  function ndcX(p: Vector3): number {
    camera.updateMatrixWorld(true);
    return p.clone().project(camera).x;
  }

  return { rig, camera, scene, player, state, look, input, wall, raycast, getLocation, frame, run, setState, anchor, ndcX };
}

/** Start in free roam behind a player at the origin facing `yaw`. */
function inFreeRoam(yaw = 0.8) {
  const s = setup();
  s.player.rotation.y = yaw;
  s.setState('title');
  s.frame();
  s.setState('freeRoam');
  s.frame();
  return s;
}

const shot = (over: Partial<CameraShot> = {}): CameraShot => ({
  position: new Vector3(10, 2, 0),
  lookAt: new Vector3(0, 1, 0),
  duration: 0.5,
  ...over,
});

const right = (yaw: number) => new Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
const forward = (yaw: number) => new Vector3(Math.sin(yaw), 0, Math.cos(yaw));

describe('CameraRig modes', () => {
  it('title: slowly orbits the Sogo crossing, looking slightly up', () => {
    const s = setup();
    s.setState('title');
    expect(s.rig.mode).toBe('orbitShowcase');
    s.frame();
    const p0 = s.camera.position.clone();
    s.run(2);
    const p = s.camera.position;
    expect(Math.hypot(p.x - SOGO.x, p.z - SOGO.z)).toBeCloseTo(34, 5);
    expect(p.y).toBeCloseTo(11, 5);
    expect(p.distanceTo(p0)).toBeCloseTo(34 * 0.06 * 2, 1);
    expect(s.camera.getWorldDirection(new Vector3()).y).toBeGreaterThan(0);
    expect(s.getLocation).toHaveBeenCalledTimes(1);
  });

  it('free roam: cuts behind the player; D (camera right) moves screen-right', () => {
    const s = inFreeRoam(0.8);
    expect(s.rig.mode).toBe('follow');
    expect(s.rig.getYaw()).toBeCloseTo(0.8, 6);
    expect(s.camera.position.distanceTo(s.anchor())).toBeCloseTo(FOLLOW_REACH, 5);
    expect(s.camera.position.y).toBeGreaterThan(s.anchor().y);
    const here = s.player.position.clone();
    const yaw = s.rig.getYaw();
    expect(s.ndcX(here.clone().add(right(yaw)))).toBeGreaterThan(s.ndcX(here) + 0.05);
  });

  it('mouse steers only while pointer-locked in freeRoam/combat', () => {
    const s = inFreeRoam(0.8);
    s.look.x = 100;
    s.frame();
    expect(s.rig.getYaw()).toBeCloseTo(0.8, 6);
    s.input.pointerLocked = true;
    s.frame();
    expect(s.rig.getYaw()).toBeCloseTo(0.8 - 0.22, 6);
    s.setState('cutscene');
    s.frame();
    expect(s.rig.getYaw()).toBeCloseTo(0.8 - 0.22, 6);
  });

  it('recenters behind a moving target only after 2.5 s without mouse', () => {
    const s = inFreeRoam(0);
    s.input.pointerLocked = true;
    s.look.x = -500; // turn the view 1.1 rad left
    s.frame();
    s.look.x = 0;
    const yawAfterMouse = s.rig.getYaw();
    const step = forward(0).multiplyScalar(3 / 60);
    s.run(2, () => s.player.position.add(step)); // moving, but mouse used recently
    expect(s.rig.getYaw()).toBeCloseTo(yawAfterMouse, 6);
    s.run(2); // mouse idle long enough, but standing still
    expect(s.rig.getYaw()).toBeCloseTo(yawAfterMouse, 6);
    s.run(1, () => s.player.position.add(step));
    expect(s.rig.getYaw()).toBeLessThan(yawAfterMouse);
    s.run(6, () => s.player.position.add(step));
    expect(Math.abs(s.rig.getYaw())).toBeLessThan(0.05);
  });

  it.each([
    ['strafing', -Math.PI / 2],
    ['walking toward the camera', Math.PI],
  ])('does not swing while %s with camera-relative input', (_label, relative) => {
    const s = inFreeRoam(0.4);
    s.run(3); // mouse long idle
    const yaw0 = s.rig.getYaw();
    s.run(3, () => {
      const facing = s.rig.getYaw() + relative; // what camera-relative movement makes the player do
      s.player.rotation.y = facing;
      s.player.position.add(forward(facing).multiplyScalar(4 / 60));
    });
    expect(s.rig.getYaw()).toBeCloseTo(yaw0, 3);
  });

  it('pulls in instantly in front of walls and eases back out', () => {
    const s = inFreeRoam(0);
    s.wall.distance = 2;
    s.frame();
    expect(s.raycast.mock.calls.at(-1)?.[3]).toBe(CG.STATIC);
    expect(s.camera.position.distanceTo(s.anchor())).toBeCloseTo(1.75, 5);
    s.wall.distance = null;
    s.frame();
    const d1 = s.camera.position.distanceTo(s.anchor());
    expect(d1).toBeGreaterThan(1.75);
    expect(d1).toBeLessThan(1.9);
    s.run(3);
    expect(s.camera.position.distanceTo(s.anchor())).toBeCloseTo(FOLLOW_REACH, 2);
  });

  it('combat lock keeps the camera behind the player on the enemy→player line, both in frame', () => {
    const s = inFreeRoam(0);
    const enemy = new Object3D();
    enemy.position.set(4, 0, 3);
    s.scene.add(enemy);
    s.setState('combat');
    s.rig.setLockTarget(enemy);
    s.input.pointerLocked = true;
    s.look.x = 300; // ignored for yaw while locked
    s.run(4);
    const cam = s.camera.position;
    const toEnemy = enemy.position.clone().sub(s.player.position).setY(0).normalize();
    const toCam = cam.clone().sub(s.player.position).setY(0).normalize();
    expect(toCam.dot(toEnemy)).toBeLessThan(-0.9);
    const head = (o: Object3D) => o.position.clone().add(new Vector3(0, 1.5, 0));
    const px = s.ndcX(head(s.player));
    const ex = s.ndcX(head(enemy));
    expect(px).toBeLessThan(ex);
    expect(Math.abs(px)).toBeLessThan(0.9);
    expect(Math.abs(ex)).toBeLessThan(0.9);

    s.rig.setLockTarget(null);
    s.look.x = 0;
    s.run(2);
    expect(s.camera.position.distanceTo(s.player.position.clone().add(new Vector3(0, 1.8, 0)))).toBeCloseTo(
      Math.hypot(5.6, 0.45),
      1,
    );
  });

  it('dialogue frames A over the shoulder looking at B, with a narrower FOV', () => {
    const s = inFreeRoam(0);
    const npc = new Object3D();
    npc.position.set(0, 0, 2);
    s.scene.add(npc);
    s.rig.setDialogueFraming(s.player, npc);
    s.setState('dialogue');
    expect(s.rig.mode).toBe('dialogue');
    s.run(3);
    const cam = s.camera.position;
    expect(cam.z).toBeLessThan(-0.9); // behind A
    expect(cam.x).toBeLessThan(-0.4); // A's right side (-X when facing +Z)
    expect(cam.y).toBeGreaterThan(1.6);
    expect(s.camera.fov).toBeCloseTo(45, 1);
    const bHead = npc.position.clone().add(new Vector3(0, 1.6, 0));
    expect(Math.abs(s.ndcX(bHead))).toBeLessThan(0.3);
  });

  it('menu, shop and game over freeze the camera (including shake)', () => {
    const s = inFreeRoam(0);
    s.setState('menu');
    s.rig.shake(1, 0.5);
    const before = s.camera.position.clone();
    s.run(1, () => s.player.position.x += 0.1);
    expect(s.camera.position.equals(before)).toBe(true);
    s.setState('freeRoam');
    s.frame();
    expect(s.camera.position.equals(before)).toBe(false);
  });
});

describe('CameraRig sequences', () => {
  it('plays shots back to back (dolly, ease, fov, live sources) then restores the state camera', async () => {
    const s = inFreeRoam(0);
    const moving = new Vector3(0, 1, 5);
    let done = false;
    void s.rig
      .playSequence([
        shot({ toPosition: new Vector3(20, 2, 0), fov: 30 }),
        shot({ position: () => moving, lookAt: new Vector3(0, 1, 0), duration: 0.5 }),
      ])
      .then(() => (done = true));
    expect(s.rig.mode).toBe('cinematic');
    s.run(0.25);
    expect(s.camera.position.x).toBeCloseTo(15, 5);
    expect(s.camera.fov).toBe(30);
    s.run(0.5);
    moving.set(0, 1, 7);
    s.frame();
    expect(s.camera.position.toArray()).toEqual([0, 1, 7]);
    expect(s.camera.fov).toBe(55);
    s.run(0.25);
    await Promise.resolve();
    expect(done).toBe(true);
    expect(s.rig.mode).toBe('follow');
    s.run(2);
    expect(s.camera.position.distanceTo(s.anchor())).toBeCloseTo(FOLLOW_REACH, 2);
  });

  it('realTime=false shots follow scaled time', () => {
    const s = inFreeRoam(0);
    void s.rig.playSequence([shot({ toPosition: new Vector3(20, 2, 0), realTime: false })]);
    s.frame(1 / 60, 0);
    s.frame(0.25, 0);
    expect(s.camera.position.x).toBeCloseTo(10, 5);
    s.frame(0.25, 0.25);
    expect(s.camera.position.x).toBeCloseTo(15, 5);
  });

  it('ignores state changes while playing and restores the camera for the state current at the end', async () => {
    const s = inFreeRoam(0);
    const p = s.rig.playSequence([shot()]);
    s.setState('combat');
    expect(s.rig.mode).toBe('cinematic');
    s.run(0.6);
    await p;
    expect(s.rig.mode).toBe('combat');
  });

  it('stopSequence resolves at once; a new sequence resolves the previous one', async () => {
    const s = inFreeRoam(0);
    const order: string[] = [];
    const first = s.rig.playSequence([shot({ duration: 5 })]).then(() => order.push('first'));
    const second = s.rig.playSequence([shot({ duration: 5 })]).then(() => order.push('second'));
    await first;
    expect(order).toEqual(['first']);
    expect(s.rig.mode).toBe('cinematic');
    s.rig.stopSequence();
    await second;
    expect(order).toEqual(['first', 'second']);
    expect(s.rig.mode).toBe('follow');
    await s.rig.playSequence([]);
  });
});

describe('CameraRig effects & helpers', () => {
  it('shake and punch are additive, real-time and fade out completely', () => {
    const s = inFreeRoam(0);
    s.run(0.5);
    const steady = s.camera.position.clone();
    const yaw = s.rig.getYaw();
    s.rig.shake(1, 0.4);
    s.rig.punch(-10, 0.3);
    s.frame(0.05, 0); // bullet time / pause does not stop effects
    expect(s.camera.position.distanceTo(steady)).toBeGreaterThan(0.01);
    expect(s.camera.fov).toBeLessThan(50);
    expect(s.rig.getYaw()).toBeCloseTo(yaw, 9);
    s.run(0.5);
    expect(s.camera.position.distanceTo(steady)).toBeLessThan(1e-9);
    expect(s.camera.fov).toBe(55);
  });

  it('snapBehindTarget cuts straight behind a teleported player', () => {
    const s = inFreeRoam(0);
    s.player.position.set(50, 0, -30);
    s.player.rotation.y = -2;
    s.rig.snapBehindTarget();
    s.frame();
    expect(s.rig.getYaw()).toBeCloseTo(-2, 6);
    expect(s.camera.position.distanceTo(s.anchor())).toBeCloseTo(FOLLOW_REACH, 5);
  });

  it('dispose unsubscribes and settles a running sequence', async () => {
    const s = inFreeRoam(0);
    const p = s.rig.playSequence([shot({ duration: 10 })]);
    s.rig.dispose();
    await p;
    s.setState('combat');
    expect(s.rig.mode).toBe('cinematic');
  });
});
