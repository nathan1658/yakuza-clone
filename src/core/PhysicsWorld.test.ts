import { beforeAll, describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { PhysicsWorld } from './PhysicsWorld';
import { CG, FIXED_DT, interactionGroups } from './types';

let physics: PhysicsWorld;

beforeAll(async () => {
  physics = await PhysicsWorld.create();
  // 40×40 m floor, top surface at y = 0.
  physics.createStaticBox(new Vector3(0, -0.5, 0), new Vector3(20, 0.5, 20));
});

function walk(body: ReturnType<PhysicsWorld['createCharacterBody']>, v: Vector3, seconds: number): void {
  const d = new Vector3();
  for (let t = 0; t < seconds; t += FIXED_DT) {
    d.copy(v).multiplyScalar(FIXED_DT).setY(-0.05); // light constant gravity
    body.move(d);
    physics.step(FIXED_DT);
  }
}

describe('PhysicsWorld', () => {
  it('raycasts against colliders created this frame, with a unit-distance result', () => {
    const hit = physics.raycast(new Vector3(0, 5, 0), new Vector3(0, -2, 0), 20);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(5, 3);
    expect(hit!.point.y).toBeCloseTo(0, 3);
    expect(hit!.normal.y).toBeCloseTo(1, 3);
    expect(physics.raycast(new Vector3(0, 5, 0), new Vector3(0, 0, 0), 20)).toBeNull();
    expect(physics.raycast(new Vector3(0, 5, 0), new Vector3(0, -1, 0), 2)).toBeNull();
  });

  it('group mask filters raycasts by membership', () => {
    expect(physics.raycast(new Vector3(0, 5, 0), new Vector3(0, -1, 0), 20, CG.PROP)).toBeNull();
    expect(physics.raycast(new Vector3(0, 5, 0), new Vector3(0, -1, 0), 20, CG.STATIC)).not.toBeNull();
  });

  it('character walks on the floor, steps up a kerb and is blocked by a wall', () => {
    physics.createStaticBox(new Vector3(5, 0.1, 0), new Vector3(1, 0.1, 3)); // 0.2 m kerb at x ∈ [4, 6]
    physics.createStaticBox(new Vector3(10, 1, 0), new Vector3(0.5, 1, 3)); // wall face at x = 9.5
    const body = physics.createCharacterBody(new Vector3(0, 0, 0), 0.35, 1.8);
    walk(body, new Vector3(0, 0, 0), 0.2);
    expect(body.grounded).toBe(true);
    expect(body.position.y).toBeCloseTo(0, 1);

    walk(body, new Vector3(4.5, 0, 0), 1.1); // onto the kerb
    expect(body.position.x).toBeGreaterThan(4.4);
    expect(body.position.y).toBeCloseTo(0.2, 1);

    walk(body, new Vector3(4.5, 0, 0), 3); // into the wall
    expect(body.position.x).toBeLessThan(9.5 - 0.3);
    expect(body.position.x).toBeGreaterThan(9.5 - 0.5);
    body.dispose();
    body.dispose(); // idempotent
  });

  it('arena walls stop characters but not the camera ray, props or STATIC raycasts', () => {
    const wall = physics.createStaticBox(new Vector3(0, 1, 14), new Vector3(3, 1, 0.1)); // face at z = 13.9
    wall.setCollisionGroups(interactionGroups(CG.ARENA, CG.CHARACTER));
    expect(physics.raycast(new Vector3(0, 1, 10), new Vector3(0, 0, 1), 8, CG.STATIC)).toBeNull();
    expect(physics.raycast(new Vector3(0, 1, 10), new Vector3(0, 0, 1), 8)).not.toBeNull();
    const body = physics.createCharacterBody(new Vector3(0, 0, 11), 0.35, 1.8);
    walk(body, new Vector3(0, 0, 4.5), 2);
    expect(body.position.z).toBeLessThan(13.9 - 0.3);
    expect(body.position.z).toBeGreaterThan(13.9 - 0.5);
    body.dispose();
    physics.world.removeCollider(wall, false);
  });

  it('teleport moves immediately; disabled bodies ignore move()', () => {
    const body = physics.createCharacterBody(new Vector3(-10, 0, -10), 0.35, 1.8);
    body.teleport(new Vector3(-12, 0, -12));
    expect(body.position.toArray()).toEqual([-12, 0, -12]);
    expect(body.collider.translation().x).toBeCloseTo(-12, 5);
    physics.step(FIXED_DT);
    expect(body.rigidBody.translation().y).toBeCloseTo(0.9, 5);
    body.setEnabled(false);
    body.move(new Vector3(1, 0, 0));
    expect(body.position.x).toBe(-12);
    body.dispose();
  });

  it('character controller ignores props (they are pushed by the capsule instead)', () => {
    const crate = new Object3D();
    crate.position.set(-5, 0.5, 5);
    const crateBody = physics.createDynamicBox(crate, new Vector3(0.5, 0.5, 0.5));
    const body = physics.createCharacterBody(new Vector3(-7, 0, 5), 0.35, 1.8);
    walk(body, new Vector3(3, 0, 0), 1);
    expect(body.position.x).toBeGreaterThan(-4.2);
    body.dispose();
    physics.removeBody(crateBody);
  });

  it('dynamic boxes fall, settle and drive their linked object', () => {
    const obj = new Object3D();
    obj.position.set(3, 2, -8);
    obj.rotation.y = 0.5;
    const body = physics.createDynamicBox(obj, new Vector3(0.25, 0.25, 0.25));
    expect(body.translation().y).toBeCloseTo(2, 5);
    for (let i = 0; i < 180; i++) {
      physics.step(FIXED_DT);
      physics.syncLinked();
    }
    expect(obj.position.y).toBeCloseTo(0.25, 1);
    expect(obj.position.x).toBeCloseTo(3, 1);
    expect(Math.abs(obj.quaternion.y)).toBeGreaterThan(0.2); // kept its yaw
    physics.removeBody(body);
    expect(body.isValid()).toBe(false);
    physics.removeBody(body); // idempotent
    obj.position.set(0, 0, 0);
    physics.syncLinked();
    expect(obj.position.y).toBe(0);
  });
});
