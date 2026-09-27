/**
 * A physical character: capsule body integrated at the fixed rate, rendered
 * interpolated, animated by the ANIMATION RULE in core/types.ts.
 */
import { Vector3, type Object3D } from 'three';
import { turnTowards } from '../core/math';
import type {
  AnimClip, AnimClipDef, CharacterRole, CombatState, CombatStats, Faction, GameContext, GameTime, ICharacter,
  ICharacterBody, ICharacterBrain, IWeaponProp, PlayAnimOptions, PlaySfxOptions,
} from '../core/types';
import { LOCO_SPEED } from './anim/clips/locomotion';
import { CLIP_LIBRARY } from './anim/library';
import type { Look } from './look/body';
import { locomotionClip, locomotionRate, STILL_SPEED } from './motion';
import { CharacterRig } from './rig/CharacterRig';

const GRAVITY = 12;
const STICK_VY = -1;
const MAX_FALL = 30;
const FRICTION_GROUND = 8;
const FRICTION_AIR = 1;
const ARRIVE = 0.3;
const ARRIVE_BRAKE = 4;
const MOVE_TURN = 10;
const HURT_R = 0.38;
const LYING_R = 0.6;
const LYING_H = 0.45;
const LYING_BACK = 0.45;
const FOOTSTEP_RANGE_SQ = 15 * 15;
const LYING: ReadonlySet<CombatState> = new Set<CombatState>(['knockdown', 'downed', 'ko', 'airborne']);
const LOOP: PlayAnimOptions = { loop: true };
const KEEP: PlayAnimOptions = {};

export interface CharacterInit {
  id: string;
  name: string;
  role: CharacterRole;
  faction: Faction;
  look: Look;
  position: Vector3;
  yaw: number;
  maxHp: number;
  stats: CombatStats;
  idleClip: AnimClip;
}

/** Render interpolation factor shared by all characters (owned by EntityManager). */
export interface FrameClock {
  alpha: number;
}

interface MoveTask {
  target: Vector3;
  speed: number;
  left: number;
  resolve: () => void;
}

export class Character implements ICharacter {
  readonly kind = 'character' as const;
  readonly id: string;
  readonly role: CharacterRole;
  readonly faction: Faction;
  readonly displayName: string;
  readonly rig: CharacterRig;
  readonly body: ICharacterBody;
  readonly object3d: Object3D;
  readonly position: Vector3;
  readonly radius: number;
  readonly height: number;
  readonly userData: Record<string, unknown> = {};
  maxHp: number;
  stats: CombatStats;
  combatState: CombatState = 'idle';
  stateTime = 0;
  facing: number;
  idleClip: AnimClip;
  stance: 'normal' | 'combat' = 'normal';
  heldWeapon: IWeaponProp | null = null;
  brain: ICharacterBrain | null = null;
  hyperArmor = false;
  invulnerable = false;

  private _hp: number;
  private vy = 0;
  private task: MoveTask | null = null;
  private readonly desired = new Vector3();
  private readonly impulse = new Vector3();
  private readonly prev = new Vector3();
  private readonly step = new Vector3();
  private readonly hurtbox = { base: new Vector3(), radius: HURT_R, height: 0 };
  private readonly sfx: PlaySfxOptions;

  constructor(
    private readonly ctx: GameContext,
    private readonly clock: FrameClock,
    init: CharacterInit,
  ) {
    this.id = init.id;
    this.role = init.role;
    this.faction = init.faction;
    this.displayName = init.name;
    this.maxHp = init.maxHp;
    this._hp = init.maxHp;
    this.stats = init.stats;
    this.idleClip = init.idleClip;
    this.facing = init.yaw;
    this.rig = new CharacterRig(init.look, init.idleClip);
    this.object3d = this.rig.root;
    this.object3d.name = init.id;
    this.object3d.rotation.y = init.yaw;
    this.position = this.object3d.position;
    this.height = this.rig.height;
    this.radius = init.look.build === 'heavy' || init.look.build === 'muscular' ? 0.42 : 0.35;
    this.body = ctx.physics.createCharacterBody(init.position, this.radius, this.height);
    this.prev.copy(this.body.position);
    this.position.copy(this.prev);
    this.sfx = { position: this.position, volume: 0.4 };
  }

  get hp(): number {
    return this._hp;
  }

  set hp(value: number) {
    const hp = Math.min(this.maxHp, Math.max(0, value));
    const delta = hp - this._hp;
    if (delta === 0) return;
    this._hp = hp;
    if (this.role === 'player') this.ctx.events.emit('player:hp', { hp, maxHp: this.maxHp, delta });
  }

  get desiredVelocity(): Vector3 {
    return this.desired;
  }

  /** True while a moveTo() owns this character's motion. */
  get scripted(): boolean {
    return this.task !== null;
  }

  isAlive(): boolean {
    return this._hp > 0;
  }

  getForward(out = new Vector3()): Vector3 {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  faceTowards(point: Vector3, maxTurn?: number): void {
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    if (dx * dx + dz * dz < 1e-8) return;
    const yaw = Math.atan2(dx, dz);
    this.facing = maxTurn === undefined ? yaw : turnTowards(this.facing, yaw, maxTurn);
    this.object3d.rotation.y = this.facing;
  }

  setDesiredVelocity(v: Vector3): void {
    this.desired.set(v.x, 0, v.z);
  }

  addImpulse(v: Vector3): void {
    this.impulse.x += v.x;
    this.impulse.z += v.z;
    this.vy = Math.max(this.vy, 0) + v.y;
  }

  teleport(footPosition: Vector3, yaw?: number): void {
    this.endTask();
    this.body.teleport(footPosition);
    this.prev.copy(this.body.position);
    this.position.copy(this.prev);
    this.impulse.set(0, 0, 0);
    this.vy = 0;
    if (yaw === undefined) return;
    this.facing = yaw;
    this.object3d.rotation.y = yaw;
  }

  moveTo(target: Vector3, speed = 1.5, timeoutSec = 10): Promise<void> {
    this.endTask();
    return new Promise((resolve) => {
      this.task = { target: target.clone(), speed, left: timeoutSec, resolve };
    });
  }

  playAnim(clip: AnimClip | AnimClipDef, opts?: PlayAnimOptions): void {
    this.rig.play(clip, opts);
  }

  getHurtbox(): { base: Vector3; radius: number; height: number } {
    const h = this.hurtbox;
    const lying = LYING.has(this.combatState);
    const back = lying ? LYING_BACK : 0;
    h.base.set(
      this.position.x - Math.sin(this.facing) * back,
      this.position.y,
      this.position.z - Math.cos(this.facing) * back,
    );
    h.radius = lying ? LYING_R : HURT_R;
    h.height = lying ? LYING_H : this.height;
    return h;
  }

  setVisible(visible: boolean): void {
    this.object3d.visible = visible;
    this.body.setEnabled(visible);
  }

  /** Physics step: gravity, desired + decaying impulse velocity, KCC move. */
  fixedUpdate(dt: number): void {
    const b = this.body;
    this.prev.copy(b.position);
    this.vy = b.grounded && this.vy <= 0 ? STICK_VY : Math.max(-MAX_FALL, this.vy - GRAVITY * dt);
    this.impulse.multiplyScalar(Math.exp(-(b.grounded ? FRICTION_GROUND : FRICTION_AIR) * dt));
    const d = this.desired;
    b.move(this.step.set((d.x + this.impulse.x) * dt, this.vy * dt, (d.z + this.impulse.z) * dt));
  }

  update(time: GameTime): void {
    if (this.task) this.stepTask(this.task, time.dt);
    this.position.lerpVectors(this.prev, this.body.position, this.clock.alpha);
    this.object3d.rotation.y = this.facing;
    this.stateTime += time.dt;
    if (this.combatState === 'idle' || this.combatState === 'moving') this.locomote();
    this.rig.update(time.dt);
    this.footsteps();
  }

  dispose(): void {
    this.endTask();
    this.brain?.dispose?.();
    this.brain = null;
    this.rig.dispose();
    this.body.dispose();
  }

  private stepTask(t: MoveTask, dt: number): void {
    t.left -= dt;
    const dx = t.target.x - this.body.position.x;
    const dz = t.target.z - this.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE || t.left <= 0) return this.endTask();
    if (!this.ctx.combat.canMove(this)) return;
    const v = Math.min(t.speed, dist * ARRIVE_BRAKE) / dist;
    this.desired.set(dx * v, 0, dz * v);
    this.facing = turnTowards(this.facing, Math.atan2(dx, dz), MOVE_TURN * dt);
  }

  private endTask(): void {
    const t = this.task;
    if (!t) return;
    this.task = null;
    this.desired.set(0, 0, 0);
    t.resolve();
  }

  private locomote(): void {
    const d = this.desired;
    const speed = Math.hypot(d.x, d.z);
    const state = speed < STILL_SPEED ? 'idle' : 'moving';
    if (state !== this.combatState) {
      this.combatState = state;
      this.stateTime = 0;
    }
    const a = this.rig.animator;
    if (!a.looping && !a.finished) return;
    const clip = locomotionClip(this.stance, this.idleClip, d.x, d.z, this.facing);
    a.play(CLIP_LIBRARY[clip], clip === this.idleClip ? LOOP : KEEP);
    a.rate = locomotionRate(clip, speed);
  }

  private footsteps(): void {
    const a = this.rig.animator;
    const clip = a.def.name as AnimClip;
    if (!this.object3d.visible || LOCO_SPEED[clip] === undefined) return;
    if (!a.crossed(0) && !a.crossed(0.5)) return;
    const player = this.ctx.entities.player;
    if (player !== this && player.position.distanceToSquared(this.position) > FOOTSTEP_RANGE_SQ) return;
    this.sfx.volume = Math.min(0.7, 0.25 + Math.hypot(this.desired.x, this.desired.z) * 0.06);
    this.ctx.audio.playSfx(this.ctx.world.weather === 'clear' ? 'footstep' : 'footstep_wet', this.sfx);
  }
}
