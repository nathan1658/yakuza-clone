import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_DT, type GameContext, type GameModeId, type InputAction, type ISaveable } from '../core/types';
import { EntityManager } from './EntityManager';

function fakeBody(foot: Vector3) {
  const position = foot.clone();
  return {
    position, grounded: true, collider: null, rigidBody: null,
    move(d: Vector3) {
      position.add(d);
      this.grounded = position.y <= 0;
      position.y = Math.max(0, position.y);
    },
    teleport: (f: Vector3) => void position.copy(f),
    setEnabled: () => {},
    dispose: () => {},
  };
}

function setup() {
  const pressed = new Set<InputAction>();
  const requests: string[] = [];
  const saveables: ISaveable[] = [];
  const handlers = new Map<string, Array<(p: unknown) => void>>();
  const move = { x: 0, y: 0 };
  const state = { mode: 'freeRoam' as GameModeId };
  const ctx = {
    engine: { scene: new Scene() },
    events: {
      on: (t: string, h: (p: unknown) => void) => (handlers.set(t, [...(handlers.get(t) ?? []), h]), () => {}),
      emit: (t: string, p: unknown) => handlers.get(t)?.forEach((h) => h(p)),
    },
    state: { is: (...m: GameModeId[]) => m.includes(state.mode) },
    input: {
      getMoveVector: () => move,
      isDown: () => false,
      wasPressed: (a: InputAction) => pressed.has(a),
      consume: (a: InputAction) => void pressed.delete(a),
    },
    physics: { createCharacterBody: fakeBody },
    cameraRig: { camera: new PerspectiveCamera(), getYaw: () => 0, setFollowTarget: () => {}, snapBehindTarget: () => {} },
    world: {
      weather: 'rain',
      getLocation: () => ({ position: new Vector3(1, 0, 2), yaw: 0 }),
      getPedestrianPaths: () => [[new Vector3(-20, 0, 5), new Vector3(20, 0, 5)]],
      isWalkable: () => true,
    },
    combat: {
      canMove: () => true, lockTarget: null,
      requestAction: (_c: unknown, a: string) => (requests.push(a), true),
    },
    interactions: { tryInteract: () => false },
    audio: { playSfx: () => {} },
    save: { register: (s: ISaveable) => saveables.push(s) },
  } as unknown as GameContext;
  const em = new EntityManager(ctx);
  Object.assign(ctx, { entities: em });
  em.init();
  let frame = 0;
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += FIXED_DT) {
      em.fixedUpdate(FIXED_DT);
      em.update({ dt: FIXED_DT, realDt: FIXED_DT, elapsed: t, realElapsed: t, frame: frame++ });
    }
  };
  return { em, ctx, pressed, requests, saveables, move, state, run };
}

describe('EntityManager', () => {
  it('spawns 陳浩南 at player_start and registers the player saveable', () => {
    const { em, saveables } = setup();
    expect(em.player.id).toBe('player');
    expect(em.player.displayName).toBe('陳浩南');
    expect(em.player.maxHp).toBe(200);
    expect(em.player.position.toArray()).toEqual([1, 0, 2]);
    expect(saveables.map((s) => s.saveKey)).toEqual(['player']);
  });

  it('moves the player camera-relative and picks the run clip', () => {
    const { em, move, run } = setup();
    move.y = 1;
    run(1);
    expect(em.player.position.z).toBeGreaterThan(5);
    expect(Math.abs(em.player.position.x - 1)).toBeLessThan(1e-6);
    expect(em.player.rig.currentClip).toBe('run');
    move.y = 0;
    run(1);
    expect(em.player.rig.currentClip).toBe('idle');
  });

  it('reads gameplay presses only in freeRoam/combat', () => {
    const { pressed, requests, state, run } = setup();
    state.mode = 'heatAction';
    pressed.add('lightAttack');
    run(0.1);
    expect(pressed.has('lightAttack')).toBe(true);
    state.mode = 'combat';
    run(FIXED_DT);
    expect(pressed.has('lightAttack')).toBe(false);
    expect(requests).toContain('light');
  });

  it('spawns, replaces and despawns characters; NPCs get the idle brain', () => {
    const { em } = setup();
    const npc = em.spawnCharacter({ id: 'npc_x', name: 'X', role: 'npc', faction: 'civilian', appearance: 'debtor', position: new Vector3(3, 0, 3) });
    expect(npc.brain).not.toBeNull();
    const goon = em.spawnCharacter({ name: 'G', role: 'enemy', faction: 'tungShing', appearance: 'tsGoonA', position: new Vector3(4, 0, 2) });
    expect(goon.brain).toBeNull();
    expect(em.queryRadius(new Vector3(1, 0, 2), 3.5, { role: 'enemy' })).toEqual([goon]);
    em.spawnCharacter({ id: 'npc_x', name: 'Y', role: 'npc', faction: 'civilian', appearance: 'debtor', position: new Vector3() });
    expect(em.getCharacter('npc_x')?.displayName).toBe('Y');
    em.despawn('npc_x');
    expect(em.getCharacter('npc_x')).toBeUndefined();
    expect(em.getCharacters().length).toBe(2);
  });

  it('player saveable revives on load', () => {
    const { em, saveables } = setup();
    em.player.hp = 0;
    em.player.combatState = 'ko';
    saveables[0].deserialize({ position: [5, 0, 5], yaw: 1, hp: 120 });
    expect(em.player.hp).toBe(120);
    expect(em.player.combatState).toBe('idle');
    expect(em.player.position.toArray()).toEqual([5, 0, 5]);
  });
});
