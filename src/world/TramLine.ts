/**
 * The trams in the world: TramSim stepped on scaled time, a model and a
 * kinematic body per car, the bell, and the fight ring they must not barge
 * into. IPhysicsWorld has no kinematic-body helper, so the bodies are made
 * through its raw rapier handles.
 */
import { Group, Mesh, Vector3 } from 'three';
import type { Material, Object3D } from 'three';
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import { CG, interactionGroups } from '../core/types';
import type { GameContext, GameTime } from '../core/types';
import { signFaces } from './build/signs';
import { buildTramModel } from './build/tram';
import { carSigns, LOOP, TRAM, TramSim } from './data/trams';
import type { Person, Ring, Tram } from './data/trams';
import type { SignAtlas } from './rendering/signAtlas';

/** Solid to everything, like a wall that moves. */
const GROUPS = interactionGroups(CG.STATIC, CG.ALL);
/** Seconds between looks for the fight ring while a fight is on. */
const RING_SCAN = 1;
/** Combat's wall boxes stand a little outside the circle through their centres. */
const RING_WALL = 0.5;
const BELL_Y = 3;

interface Car {
  readonly tram: Tram;
  readonly model: Object3D;
  readonly body: RigidBody;
  readonly bell: Vector3;
  lastX: number;
}

export interface TramMaterials {
  readonly body: Material;
  readonly glow: Material;
  readonly signs: Material;
}

export class TramLine {
  private readonly sim = new TramSim((t) => this.ding(t));
  private readonly cars: Car[] = [];
  private readonly people: Person[] = [];
  private readonly target = { x: 0, y: TRAM.height / 2, z: 0 };
  private readonly circle: Ring = { x: 0, z: 0, r: 0 };
  private ring: Ring | null = null;
  private scanIn = 0;

  constructor(private readonly ctx: GameContext) {}

  build(parent: Object3D, mats: TramMaterials, atlas: SignAtlas): void {
    const model = buildTramModel();
    const { rapier, world } = this.ctx.physics;
    this.sim.trams.forEach((tram, i) => {
      const body = new Mesh(model.body, mats.body);
      body.castShadow = true;
      body.receiveShadow = true;
      const glow = new Mesh(model.glow, mats.glow);
      const signs = new Mesh(signFaces(carSigns(i), atlas), mats.signs);
      glow.layers.enable(1);
      signs.layers.enable(1);
      const car = new Group();
      car.name = `world:tram${i}`;
      car.add(body, glow, signs);
      car.position.set(tram.x, 0, tram.track.z);
      car.rotation.y = tram.track.dir > 0 ? 0 : Math.PI;
      parent.add(car);
      const desc = rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(tram.x, TRAM.height / 2, tram.track.z);
      const rb = world.createRigidBody(desc);
      world.createCollider(rapier.ColliderDesc.cuboid(TRAM.halfLength, TRAM.height / 2, TRAM.halfWidth).setCollisionGroups(GROUPS), rb);
      this.cars.push({ tram, model: car, body: rb, bell: new Vector3(), lastX: tram.x });
    });
  }

  update(time: GameTime): void {
    this.findRing(time.realDt);
    this.sim.update(time.dt, this.gatherPeople(), this.ring);
    for (const car of this.cars) this.place(car);
  }

  /** Everyone who could be standing on the rails: the player first, in case the list leaves them out. */
  private gatherPeople(): readonly Person[] {
    const { player } = this.ctx.entities;
    const people = this.people;
    people.length = 0;
    people.push(player);
    for (const c of this.ctx.entities.getCharacters()) if (c !== player) people.push(c);
    return people;
  }

  private place(car: Car): void {
    const { tram, body } = car;
    this.target.x = tram.x;
    this.target.z = tram.track.z;
    // Back on at the far end: jump there rather than sweep the whole road.
    if (Math.abs(tram.x - car.lastX) > LOOP / 2) body.setTranslation(this.target, true);
    else body.setNextKinematicTranslation(this.target);
    car.lastX = tram.x;
    car.model.position.x = tram.x;
  }

  /** Combat's ring walls are the ARENA group; while a fight is on, find the circle they make. */
  private findRing(dt: number): void {
    if (!this.ctx.combat.inCombat) {
      this.ring = null;
      this.scanIn = 0;
      return;
    }
    this.scanIn -= dt;
    if (this.scanIn > 0) return;
    this.scanIn = RING_SCAN;
    const walls: Collider[] = [];
    this.ctx.physics.world.forEachCollider((c) => {
      if ((c.collisionGroups() >>> 16) & CG.ARENA) walls.push(c);
    });
    this.ring = walls.length > 0 ? this.fit(walls) : null;
  }

  /** The walls are a regular polygon: centre at their mean, radius out to the farthest. */
  private fit(walls: readonly Collider[]): Ring {
    const c = this.circle;
    c.x = 0;
    c.z = 0;
    c.r = 0;
    for (const w of walls) {
      const p = w.translation();
      c.x += p.x / walls.length;
      c.z += p.z / walls.length;
    }
    for (const w of walls) {
      const p = w.translation();
      c.r = Math.max(c.r, Math.hypot(p.x - c.x, p.z - c.z));
    }
    c.r += RING_WALL;
    return c;
  }

  private ding(t: Tram): void {
    const car = this.cars[this.sim.trams.indexOf(t)];
    if (!car) return;
    car.bell.set(t.x + t.track.dir * TRAM.halfLength, BELL_Y, t.track.z);
    this.ctx.audio.playSfx('tram_bell', { position: car.bell });
  }
}
