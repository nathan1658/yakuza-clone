/**
 * Ambient crowd: rig-only walkers (no physics, not in getCharacters) that
 * follow the world's pedestrian paths around the player, carry umbrellas in
 * the wet, and scatter while a fight is on.
 */
import { Vector3, type Mesh } from 'three';
import { turnTowards } from '../../core/math';
import type { AnimClip, AnimClipDef, GameContext, GameTime, ICharacter } from '../../core/types';
import { LOCO_SPEED, WALK } from '../anim/clips/locomotion';
import { CLIP_LIBRARY } from '../anim/library';
import { randomLook } from '../look/presets';
import { CharacterRig } from '../rig/CharacterRig';
import { steerAround } from '../motion';
import { createUmbrella, UMBRELLA_WALK } from './umbrella';

const MAX = 25;
const LANE_MIN = 0.35;
const LANE_SPAN = 1.1;
const ARRIVE_SQ = 0.4 * 0.4;
const HOP_SQ = 4 * 4;
const TURN = 6;
const AVOID = 1.6;
const AVOID_GAIN = 2.5;
const FLEE_SPEED = LOCO_SPEED.flee ?? 4;
const FLEE_UNTIL_SQ = 25 * 25;
const FLEE_ANGLES = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8];
const LOD_SQ = 35 * 35;
const KEEP_SQ = 60 * 60;
const SPAWN_MIN_SQ = 20 * 20;
const SPAWN_MAX = 55;
const SPAWN_TRIES = 6;
const IN_VIEW_SQ = 40 * 40;

type Mode = 'walk' | 'flee' | 'react';

interface Ped {
  rig: CharacterRig;
  umbrella: Mesh;
  path: readonly Vector3[];
  node: number;
  dir: 1 | -1;
  lane: number;
  speed: number;
  mode: Mode;
  react: AnimClip;
  lodDt: number;
  lodPhase: number;
}

export class Pedestrians {
  private readonly peds: Ped[] = [];
  private readonly paths: readonly (readonly Vector3[])[];
  private readonly offs: Array<() => void>;
  private readonly vel = new Vector3();
  private readonly tmp = new Vector3();
  private readonly camDir = new Vector3();
  private active = MAX;
  private fighting = false;
  private frame = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly player: ICharacter,
  ) {
    this.paths = ctx.world.getPedestrianPaths().filter((p) => p.length >= 2);
    this.offs = [
      ctx.events.on('combat:start', () => (this.fighting = true)),
      ctx.events.on('combat:end', () => this.calmDown()),
    ];
    if (this.paths.length === 0) return;
    for (let i = 0; i < MAX; i++) this.peds.push(this.create(i));
  }

  setDensity(density: number): void {
    this.active = Math.round(MAX * Math.min(1, Math.max(0, density)));
    this.peds.forEach((p, i) => (p.rig.root.visible = i < this.active && p.rig.root.visible));
  }

  update(time: GameTime): void {
    this.frame++;
    const wet = this.ctx.world.weather !== 'clear';
    this.ctx.cameraRig.camera.getWorldDirection(this.camDir);
    for (let i = 0; i < this.active; i++) this.tick(this.peds[i], time.dt, wet);
  }

  dispose(): void {
    for (const off of this.offs) off();
    for (const p of this.peds) p.rig.dispose();
    this.peds.length = 0;
  }

  private create(i: number): Ped {
    const rig = new CharacterRig(randomLook(), 'walk');
    rig.setCastShadow(false);
    rig.root.name = `pedestrian_${i}`;
    const umbrella = createUmbrella(Math.random());
    rig.attachToHand('left', umbrella);
    this.ctx.engine.scene.add(rig.root);
    const ped: Ped = {
      rig, umbrella, path: this.paths[0], node: 0, dir: 1, lane: LANE_MIN + Math.random() * LANE_SPAN,
      speed: 1.2 + Math.random() * 0.4, mode: 'walk', react: 'cower', lodDt: 0, lodPhase: i % 3,
    };
    if (!this.place(ped, 0)) rig.root.visible = false;
    return ped;
  }

  private tick(p: Ped, dt: number, wet: boolean): void {
    const root = p.rig.root;
    const d2 = root.position.distanceToSquared(this.player.position);
    if (!root.visible || d2 > KEEP_SQ) {
      root.visible = this.place(p, SPAWN_MIN_SQ);
      return;
    }
    if (this.fighting && p.mode === 'walk' && d2 < FLEE_UNTIL_SQ) p.mode = 'flee';
    if (p.mode === 'flee' && d2 >= FLEE_UNTIL_SQ) this.startReact(p, d2);
    const clip = p.mode === 'walk' ? this.walk(p, dt, wet) : p.mode === 'flee' ? this.flee(p, dt) : this.react(p, dt);
    p.umbrella.visible = wet;
    const rate = p.mode === 'walk' ? p.speed / WALK.speed : 1;
    this.animate(p, clip, rate, dt, d2 > LOD_SQ);
  }

  private walk(p: Ped, dt: number, wet: boolean): AnimClipDef {
    const pos = p.rig.root.position;
    const me = this.player.position;
    const target = this.laneTarget(p);
    // A node the player stands on can't be reached: skip it rather than circle him.
    if (target.distanceToSquared(pos) < ARRIVE_SQ || target.distanceToSquared(me) < AVOID * AVOID) this.advance(p);
    this.vel.subVectors(this.laneTarget(p), pos).setY(0).setLength(p.speed);
    steerAround(this.vel, pos.x - me.x, pos.z - me.z, AVOID, AVOID_GAIN);
    this.stepAndFace(p, dt);
    return wet ? UMBRELLA_WALK : CLIP_LIBRARY.walk;
  }

  private flee(p: Ped, dt: number): AnimClipDef {
    const pos = p.rig.root.position;
    const away = Math.atan2(pos.x - this.player.position.x, pos.z - this.player.position.z);
    for (const a of FLEE_ANGLES) {
      this.vel.set(Math.sin(away + a) * FLEE_SPEED, 0, Math.cos(away + a) * FLEE_SPEED);
      if (this.ctx.world.isWalkable(this.tmp.copy(this.vel).multiplyScalar(0.5).add(pos))) {
        this.stepAndFace(p, dt);
        return CLIP_LIBRARY.flee;
      }
    }
    this.startReact(p, 0);
    return CLIP_LIBRARY[p.react];
  }

  private react(p: Ped, dt: number): AnimClipDef {
    p.rig.root.rotation.y = turnTowards(p.rig.root.rotation.y, this.yawToPlayer(p), TURN * dt);
    return CLIP_LIBRARY[p.react];
  }

  /** Far away and safe: some cheer the fight on, the rest cower. */
  private startReact(p: Ped, d2: number): void {
    p.mode = 'react';
    p.react = d2 >= FLEE_UNTIL_SQ && Math.random() < 0.5 ? 'cheer' : 'cower';
  }

  private calmDown(): void {
    this.fighting = false;
    for (const p of this.peds) {
      if (p.mode !== 'walk') this.rejoin(p);
    }
  }

  /** Walk back to the nearest node of the current path. */
  private rejoin(p: Ped): void {
    const pos = p.rig.root.position;
    let best = 0;
    for (let i = 1; i < p.path.length; i++) {
      if (p.path[i].distanceToSquared(pos) < p.path[best].distanceToSquared(pos)) best = i;
    }
    p.mode = 'walk';
    p.node = best;
    p.dir = best === 0 ? 1 : best === p.path.length - 1 ? -1 : Math.random() < 0.5 ? 1 : -1;
  }

  /** Next node; at a path end hop onto a path that starts or ends nearby, else turn back. */
  private advance(p: Ped): void {
    const next = p.node + p.dir;
    if (next >= 0 && next < p.path.length) {
      p.node = next;
      return;
    }
    const end = p.path[p.node];
    const hops = this.paths.filter((q) => q !== p.path && (q[0].distanceToSquared(end) < HOP_SQ || q[q.length - 1].distanceToSquared(end) < HOP_SQ));
    const q = hops[Math.floor(Math.random() * hops.length)];
    if (!q) {
      p.dir = p.dir === 1 ? -1 : 1;
      p.node += p.dir;
      return;
    }
    const fromStart = q[0].distanceToSquared(end) < HOP_SQ;
    p.path = q;
    p.dir = fromStart ? 1 : -1;
    p.node = fromStart ? 1 : q.length - 2;
  }

  /** Current node shifted to the right of travel, so opposite walkers pass each other. */
  private laneTarget(p: Ped): Vector3 {
    const to = p.path[p.node];
    const from = p.path[p.node - p.dir] ?? p.path[p.node + p.dir];
    const sign = p.path[p.node - p.dir] ? 1 : -1;
    const dx = (to.x - from.x) * sign;
    const dz = (to.z - from.z) * sign;
    const k = p.lane / (Math.hypot(dx, dz) || 1);
    return this.tmp.set(to.x - dz * k, to.y, to.z + dx * k);
  }

  private stepAndFace(p: Ped, dt: number): void {
    const root = p.rig.root;
    root.position.x += this.vel.x * dt;
    root.position.z += this.vel.z * dt;
    root.rotation.y = turnTowards(root.rotation.y, Math.atan2(this.vel.x, this.vel.z), TURN * dt);
  }

  private yawToPlayer(p: Ped): number {
    const pos = p.rig.root.position;
    return Math.atan2(this.player.position.x - pos.x, this.player.position.z - pos.z);
  }

  /** Far walkers animate every third frame with the accumulated time. */
  private animate(p: Ped, clip: AnimClipDef, rate: number, dt: number, far: boolean): void {
    p.rig.play(clip);
    p.rig.animator.rate = rate;
    p.lodDt += dt;
    if (far && (this.frame + p.lodPhase) % 3 !== 0) return;
    p.rig.update(p.lodDt);
    p.lodDt = 0;
  }

  /**
   * Put a walker on a random path point at least √minSq and at most
   * SPAWN_MAX from the player, preferring spots the camera can't see.
   */
  private place(p: Ped, minSq: number): boolean {
    const eye = this.ctx.cameraRig.camera.position;
    for (let t = 0; t < SPAWN_TRIES; t++) {
      const path = this.paths[Math.floor(Math.random() * this.paths.length)];
      const i = 1 + Math.floor(Math.random() * (path.length - 1));
      const at = this.tmp.lerpVectors(path[i - 1], path[i], Math.random());
      const d2 = at.distanceToSquared(this.player.position);
      if (d2 < minSq || d2 > SPAWN_MAX * SPAWN_MAX) continue;
      if (minSq > 0 && this.inView(at, eye)) continue;
      p.rig.root.position.copy(at);
      p.path = path;
      p.node = i;
      p.dir = 1;
      p.mode = this.fighting && d2 < FLEE_UNTIL_SQ ? 'flee' : 'walk';
      return true;
    }
    return false;
  }

  private inView(at: Vector3, eye: Vector3): boolean {
    const c = this.camDir;
    const ahead = (at.x - eye.x) * c.x + (at.y - eye.y) * c.y + (at.z - eye.z) * c.z;
    return ahead > 0 && at.distanceToSquared(eye) < IN_VIEW_SQ;
  }
}
