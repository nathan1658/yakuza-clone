import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import { CG, interactionGroups } from './types';
import type { ICharacterBody, IPhysicsWorld, RaycastHit } from './types';

const GRAVITY = { x: 0, y: -9.81, z: 0 };
const STATIC_FRICTION = 0.8;

const STATIC_GROUPS = interactionGroups(CG.STATIC, CG.ALL);
const CHARACTER_GROUPS = interactionGroups(CG.CHARACTER, CG.STATIC | CG.PROP);
/** The character controller's sweep only ever collides with static geometry and the arena ring. */
const KCC_QUERY_GROUPS = interactionGroups(CG.CHARACTER, CG.STATIC | CG.ARENA);
const PROP_GROUPS = interactionGroups(CG.PROP, CG.STATIC | CG.PROP | CG.CHARACTER | CG.DEBRIS);

const KCC = {
  offset: 0.02,
  stepHeight: 0.3,
  stepMinWidth: 0.2,
  snapToGround: 0.3,
  maxClimbDeg: 45,
  minSlideDeg: 50,
} as const;

const DYNAMIC_DEFAULTS = {
  mass: 4,
  friction: 0.6,
  restitution: 0.1,
  groups: PROP_GROUPS,
  linearDamping: 0.05,
  angularDamping: 0.2,
};

type DynamicBoxOptions = Partial<typeof DYNAMIC_DEFAULTS>;

const DEG = Math.PI / 180;

export class PhysicsWorld implements IPhysicsWorld {
  readonly rapier = RAPIER;
  readonly world: RAPIER.World;

  /** Linked dynamic bodies and their objects (parallel arrays, swap-remove). */
  private readonly linkedBodies: RAPIER.RigidBody[] = [];
  private readonly linkedObjects: Object3D[] = [];
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private readonly rotScratch = { x: 0, y: 0, z: 0, w: 1 };
  /** Colliders were added since the last step: Rapier's query BVH doesn't contain them yet. */
  private queriesStale = false;

  private constructor() {
    this.world = new RAPIER.World(GRAVITY);
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  createStaticBox(center: Vector3, halfExtents: Vector3, rotationY = 0): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) });
    return this.createStatic(desc);
  }

  createStaticCylinder(center: Vector3, halfHeight: number, radius: number): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(center.x, center.y, center.z);
    return this.createStatic(desc);
  }

  createStaticTrimesh(vertices: Float32Array, indices: Uint32Array): RAPIER.Collider {
    return this.createStatic(RAPIER.ColliderDesc.trimesh(vertices, indices));
  }

  createCharacterBody(footPosition: Vector3, radius: number, height: number): ICharacterBody {
    this.queriesStale = true;
    return new CharacterBody(this.world, this.flushQueries, footPosition, radius, height);
  }

  createDynamicBox(object: Object3D, halfExtents: Vector3, opts: DynamicBoxOptions = {}): RAPIER.RigidBody {
    const o = { ...DYNAMIC_DEFAULTS, ...opts };
    const { position, rotation } = worldPose(object);
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation)
      .setLinearDamping(o.linearDamping)
      .setAngularDamping(o.angularDamping)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setMass(o.mass)
      .setFriction(o.friction)
      .setRestitution(o.restitution)
      .setCollisionGroups(o.groups);
    this.world.createCollider(colliderDesc, body);
    this.queriesStale = true;
    this.linkedBodies.push(body);
    this.linkedObjects.push(object);
    return body;
  }

  removeBody(body: RAPIER.RigidBody): void {
    const i = this.linkedBodies.indexOf(body);
    if (i >= 0) {
      const last = this.linkedBodies.length - 1;
      this.linkedBodies[i] = this.linkedBodies[last];
      this.linkedObjects[i] = this.linkedObjects[last];
      this.linkedBodies.pop();
      this.linkedObjects.pop();
    }
    if (body.isValid()) this.world.removeRigidBody(body);
  }

  /**
   * `groups` is a CG filter mask (which memberships the ray may hit), default CG.ALL.
   * Returns a fresh hit object (safe to keep), or null.
   */
  raycast(
    origin: Vector3,
    dir: Vector3,
    maxDist: number,
    groups: number = CG.ALL,
    excludeCollider?: RAPIER.Collider,
  ): RaycastHit | null {
    const len = dir.length();
    if (len === 0) return null;
    this.flushQueries();
    const ray = this.ray;
    ray.origin.x = origin.x;
    ray.origin.y = origin.y;
    ray.origin.z = origin.z;
    ray.dir.x = dir.x / len;
    ray.dir.y = dir.y / len;
    ray.dir.z = dir.z / len;
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxDist,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      interactionGroups(CG.ALL, groups),
      excludeCollider,
    );
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: new Vector3(ray.origin.x + ray.dir.x * t, ray.origin.y + ray.dir.y * t, ray.origin.z + ray.dir.z * t),
      normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: t,
      collider: hit.collider,
    };
  }

  step(fixedDt: number): void {
    this.world.timestep = fixedDt;
    this.world.step();
    this.queriesStale = false;
  }

  syncLinked(): void {
    const bodies = this.linkedBodies;
    const objects = this.linkedObjects;
    const r = this.rotScratch;
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body.isSleeping()) continue;
      const obj = objects[i];
      body.translation(obj.position);
      body.rotation(r);
      obj.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  /**
   * Rapier only inserts new colliders into its query structure during a step, so
   * a raycast or character sweep right after building geometry (world init,
   * spawning) would miss them. A zero-length step inserts them without moving
   * anything.
   */
  private readonly flushQueries = (): void => {
    if (!this.queriesStale) return;
    this.world.timestep = 0;
    this.world.step();
    this.queriesStale = false;
  };

  private createStatic(desc: RAPIER.ColliderDesc): RAPIER.Collider {
    desc.setFriction(STATIC_FRICTION).setCollisionGroups(STATIC_GROUPS);
    this.queriesStale = true;
    return this.world.createCollider(desc);
  }
}

class CharacterBody implements ICharacterBody {
  readonly collider: RAPIER.Collider;
  readonly rigidBody: RAPIER.RigidBody;
  readonly position = new Vector3();

  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly centre = new Vector3();
  private readonly movement = new Vector3();
  private readonly halfTotalHeight: number;
  private isGrounded = false;
  private enabled = true;
  private disposed = false;

  constructor(
    private readonly world: RAPIER.World,
    private readonly flushQueries: () => void,
    foot: Vector3,
    radius: number,
    height: number,
  ) {
    this.halfTotalHeight = height / 2;
    this.centre.set(foot.x, foot.y + this.halfTotalHeight, foot.z);
    this.position.copy(foot);

    const c = this.centre;
    this.rigidBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, c.y, c.z));
    const shape = RAPIER.ColliderDesc.capsule(Math.max(0, height / 2 - radius), radius).setCollisionGroups(CHARACTER_GROUPS);
    this.collider = world.createCollider(shape, this.rigidBody);
    this.controller = createController(world);
  }

  get grounded(): boolean {
    return this.isGrounded;
  }

  move(displacement: Vector3): void {
    if (!this.enabled || this.disposed) return;
    this.flushQueries();
    const kcc = this.controller;
    kcc.computeColliderMovement(this.collider, displacement, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, KCC_QUERY_GROUPS);
    kcc.computedMovement(this.movement);
    this.isGrounded = kcc.computedGrounded();
    this.centre.add(this.movement);
    this.placeCollider();
  }

  teleport(footPosition: Vector3): void {
    if (this.disposed) return;
    this.centre.set(footPosition.x, footPosition.y + this.halfTotalHeight, footPosition.z);
    this.rigidBody.setTranslation(this.centre, true);
    this.placeCollider();
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this.enabled = enabled;
    this.rigidBody.setEnabled(enabled);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.removeCharacterController(this.controller);
    this.world.removeRigidBody(this.rigidBody);
  }

  /**
   * The body only reaches its next kinematic position on the next world step;
   * the collider is moved now as well so that a second move()/raycast before
   * that step starts from the right place.
   */
  private placeCollider(): void {
    const c = this.centre;
    this.rigidBody.setNextKinematicTranslation(c);
    this.collider.setTranslation(c);
    this.position.set(c.x, c.y - this.halfTotalHeight, c.z);
  }
}

function createController(world: RAPIER.World): RAPIER.KinematicCharacterController {
  const kcc = world.createCharacterController(KCC.offset);
  kcc.enableAutostep(KCC.stepHeight, KCC.stepMinWidth, false);
  kcc.enableSnapToGround(KCC.snapToGround);
  kcc.setMaxSlopeClimbAngle(KCC.maxClimbDeg * DEG);
  kcc.setMinSlopeSlideAngle(KCC.minSlideDeg * DEG);
  return kcc;
}

const pose = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3() };

/** World-space position/rotation of an object (scratch result, read immediately). */
function worldPose(object: Object3D): { position: Vector3; rotation: RAPIER.Rotation } {
  object.updateWorldMatrix(true, false);
  object.matrixWorld.decompose(pose.position, pose.quaternion, pose.scale);
  const q = pose.quaternion;
  return { position: pose.position, rotation: { x: q.x, y: q.y, z: q.z, w: q.w } };
}
