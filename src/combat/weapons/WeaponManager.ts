/**
 * Every street weapon in the game. A weapon is always in exactly one state:
 * lying about as a physics prop (pick it up), in someone's hand, flying after
 * a throw, or gone (broken; spawn-point weapons come back later).
 */
import { Vector3, type Group, type Object3D, type Scene } from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { CG } from '../../core/types';
import type {
  CombatState, GameTime, ICharacter, IInteractable, IWeaponProp, PropSpawn, WeaponKind,
} from '../../core/types';
import { wrapAngle, yawTo } from '../../core/math';
import type { CombatHub } from '../hub';
import { canAct } from '../Fighter';
import { isHittable } from '../hitTest';
import { MOVES } from '../moves';
import { Debris } from './Debris';
import { WEAPONS, wearDown, type WeaponSpec } from './weaponData';
import { buildWeaponModel, type WeaponModel } from './weaponMeshes';

/** 'worn': jammed over someone's head by a heat action, until it's smashed. */
type WeaponState = 'lying' | 'held' | 'flying' | 'worn' | 'gone';

const THROW_SPEED = 16;
const GRAVITY = 9.8;
/** A throw that hits nothing drops after this long. */
const FLIGHT_MAX = 1.2;
const TUMBLE = 14;
const HIT_PAD = 0.25;
const AIM_RANGE = 14;
const AIM_CONE = Math.PI / 4;
const RESPAWN_AFTER = 120;
/** Broken spawn-point weapons only reappear out of the player's sight. */
const RESPAWN_DIST = 40;
const PICKUP_RADIUS = 1.4;
/** A crowned traffic cone sits this far up the head bone. */
const CROWN_LIFT = 0.2;
/** Holders in these states lose their grip. */
const LETS_GO: ReadonlySet<CombatState> = new Set<CombatState>(['airborne', 'knockdown', 'downed', 'ko', 'grabbed']);

const seg = new Vector3();
const dir = new Vector3();
const aim = new Vector3();

class WeaponProp implements IWeaponProp {
  readonly kind = 'prop' as const;
  readonly object3d: Group;
  readonly position: Vector3;
  readonly displayName: string;
  readonly maxDurability: number;
  durability: number;
  holder: ICharacter | null = null;
  state: WeaponState = 'gone';
  body: RigidBody | null = null;
  readonly vel = new Vector3();
  flight = 0;
  thrower: ICharacter | null = null;
  /** A dodged throw passes through that fighter. */
  spared: ICharacter | null = null;
  respawn = 0;

  constructor(
    readonly id: string,
    readonly weaponKind: WeaponKind,
    readonly spec: WeaponSpec,
    readonly model: WeaponModel,
    readonly home: PropSpawn | null,
  ) {
    this.object3d = model.root;
    this.position = model.root.position;
    this.displayName = spec.displayName;
    this.maxDurability = spec.durability;
    this.durability = spec.durability;
  }

  /** Ballistic flight; collisions are the manager's business. */
  update(time: GameTime): void {
    if (this.state !== 'flying') return;
    this.flight += time.dt;
    this.position.addScaledVector(this.vel, time.dt);
    this.vel.y -= GRAVITY * time.dt;
    this.object3d.rotateX(TUMBLE * time.dt);
  }

  dispose(): void {
    this.object3d.removeFromParent();
  }
}

export class WeaponManager {
  readonly list: WeaponProp[] = [];
  private readonly debris: Debris;
  private readonly scene: Scene;
  private serial = 0;

  constructor(private readonly hub: CombatHub) {
    this.scene = hub.ctx.engine.scene;
    this.debris = new Debris(hub.ctx.physics, this.scene);
  }

  /** Lay out the weapons the streets start with. */
  populate(): void {
    for (const s of this.hub.ctx.world.getPropSpawns()) this.lay(this.create(s.kind, s), s.position, s.yaw);
  }

  update(time: GameTime): void {
    for (let i = this.list.length - 1; i >= 0; i--) this.tick(this.list[i], time);
    this.debris.update(time.dt);
  }

  /** Hand a fresh weapon to `c` (armed enemies). */
  give(c: ICharacter, kind: WeaponKind): void {
    const w = this.create(kind, null);
    this.scene.add(w.object3d);
    w.state = 'lying';
    this.pickUp(c, w, false);
  }

  pickUp(c: ICharacter, w: IWeaponProp, announce = true): boolean {
    if (!(w instanceof WeaponProp) || w.state !== 'lying' || c.heldWeapon) return false;
    this.freeBody(w);
    w.state = 'held';
    w.holder = c;
    c.heldWeapon = w;
    c.rig.attachToHand('right', w.object3d);
    w.object3d.position.copy(w.model.grip).negate();
    if (!announce) return true;
    this.hub.ctx.audio.playSfx('pickup', { position: c.position });
    this.hub.ctx.events.emit('weapon:pickup', { weaponId: w.id, kind: w.weaponKind, characterId: c.id });
    return true;
  }

  /** Let go of whatever `c` holds; it falls where it is. */
  drop(c: ICharacter): boolean {
    const w = c.heldWeapon;
    if (!(w instanceof WeaponProp)) return false;
    this.release(w);
    w.vel.set((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2);
    this.settle(w, 1);
    this.hub.ctx.audio.playSfx('drop', { position: w.position, volume: 0.7 });
    return true;
  }

  /** The throw's release frame: the weapon leaves the hand towards `focus`, or straight ahead. */
  launch(c: ICharacter, focus: ICharacter | null): void {
    const w = c.heldWeapon;
    if (!(w instanceof WeaponProp)) return;
    this.release(w);
    const t = focus && focus.isAlive() ? focus : this.throwTarget(c);
    const p = w.position;
    if (t) aim.set(t.position.x - p.x, t.position.y + t.height * 0.6 - p.y, t.position.z - p.z);
    else aim.set(Math.sin(c.facing) * AIM_RANGE, 0, Math.cos(c.facing) * AIM_RANGE);
    const flat = Math.max(0.1, Math.hypot(aim.x, aim.z));
    const time = flat / THROW_SPEED;
    // Enough loft that gravity brings it down on the target's chest.
    w.vel.set((aim.x / flat) * THROW_SPEED, aim.y / time + 0.5 * GRAVITY * time, (aim.z / flat) * THROW_SPEED);
    w.state = 'flying';
    w.flight = 0;
    w.thrower = c;
    w.spared = null;
    this.hub.ctx.audio.playSfx('throw', { position: p });
  }

  /** A weapon strike landed: it takes `amount` wear and may break in the hand. */
  wear(c: ICharacter, amount: number): void {
    const w = c.heldWeapon;
    if (!(w instanceof WeaponProp)) return;
    w.durability = wearDown(w.durability, amount);
    if (w.durability <= 0) this.shatter(w);
  }

  /** Break the held weapon now (heat actions). */
  breakHeld(c: ICharacter): void {
    const w = c.heldWeapon;
    if (w instanceof WeaponProp) this.shatter(w);
  }

  /** 雪糕筒笠頭: what `c` holds ends up jammed over `victim`'s head. */
  crown(c: ICharacter, victim: ICharacter): IWeaponProp | null {
    const w = c.heldWeapon;
    const head = victim.rig.getBone('head') as Object3D | null;
    if (!(w instanceof WeaponProp) || !head) return null;
    this.release(w);
    head.add(w.object3d);
    w.object3d.position.set(0, CROWN_LIFT, 0);
    w.object3d.rotation.set(0, 0, 0);
    w.state = 'worn';
    return w;
  }

  /** Break a weapon wherever it is: in a hand, on a head, lying about. */
  smash(w: IWeaponProp): void {
    if (!(w instanceof WeaponProp) || w.state === 'gone') return;
    // Back into world space first, so the shards burst from where it really is.
    if (w.state === 'worn') this.scene.attach(w.object3d);
    this.shatter(w);
  }

  /** Nearest weapon lying within `radius` of `at`, if any. */
  nearestLying(at: Vector3, radius: number): IWeaponProp | null {
    let best: WeaponProp | null = null;
    let bestD = radius;
    for (const w of this.list) {
      if (w.state !== 'lying') continue;
      const d = Math.hypot(w.position.x - at.x, w.position.z - at.z);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  /** New game or load: street weapons back home, anything else gone. */
  reset(): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i];
      if (w.holder) this.release(w);
      this.freeBody(w);
      w.state = 'gone';
      if (w.home) this.lay(w, w.home.position, w.home.yaw);
      else this.forget(w);
    }
    this.debris.clear();
  }

  dispose(): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i];
      if (w.holder) this.release(w);
      this.freeBody(w);
      this.forget(w);
    }
    this.debris.dispose();
  }

  // -------------------------------------------------------------------------

  private tick(w: WeaponProp, time: GameTime): void {
    if (w.state === 'held') this.checkGrip(w);
    else if (w.state === 'flying') this.fly(w, time);
    else if (w.state === 'gone' && w.home) this.waitRespawn(w, w.home, time.dt);
  }

  private checkGrip(w: WeaponProp): void {
    const h = w.holder;
    const gone = !h || this.hub.ctx.entities.getCharacter(h.id) !== h;
    if (!gone && !LETS_GO.has(h.combatState)) return;
    this.release(w);
    w.vel.set((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3);
    this.settle(w, 1);
  }

  private fly(w: WeaponProp, time: GameTime): void {
    seg.copy(w.vel).multiplyScalar(time.dt);
    const len = seg.length();
    if (len > 1e-5) {
      dir.copy(seg).divideScalar(len);
      const hit = this.hub.ctx.physics.raycast(w.position, dir, len + 0.1, CG.STATIC);
      if (hit) {
        w.position.copy(hit.point).addScaledVector(hit.normal, 0.15);
        w.vel.multiplyScalar(0.2);
        this.settle(w, 1);
        return;
      }
    }
    w.update(time);
    const victim = this.victimOf(w);
    if (victim) this.strikeWith(w, victim);
    else if (w.flight >= FLIGHT_MAX) this.settle(w, 0.4);
  }

  private victimOf(w: WeaponProp): ICharacter | null {
    const thrower = w.thrower;
    const p = this.hub.ctx.entities.player;
    if (thrower !== p) return this.touches(w, p) ? p : null;
    for (const e of this.hub.director.activeEnemies) if (this.touches(w, e)) return e;
    return null;
  }

  private touches(w: WeaponProp, t: ICharacter): boolean {
    if (t === w.spared || !t.isAlive() || !isHittable(t.combatState, false)) return false;
    const dy = w.position.y - t.position.y;
    if (dy < 0 || dy > t.height) return false;
    return Math.hypot(w.position.x - t.position.x, w.position.z - t.position.z) < t.radius + HIT_PAD;
  }

  private strikeWith(w: WeaponProp, t: ICharacter): void {
    const m = MOVES.thrownWeapon;
    const landed = this.hub.hits.applyHit(w.thrower ?? t, t, m, 0, 1, { mul: w.spec.damageMul, sfx: w.spec.hitSfx });
    if (!landed) {
      w.spared = t;
      return;
    }
    w.durability = wearDown(w.durability, m.wear);
    if (w.durability <= 0) {
      this.shatter(w);
      return;
    }
    // Bounces off the body and clatters down at their feet.
    w.vel.set(-w.vel.x * 0.15, 2, -w.vel.z * 0.15);
    this.settle(w, 1);
  }

  private waitRespawn(w: WeaponProp, home: PropSpawn, dt: number): void {
    w.respawn -= dt;
    if (w.respawn > 0) return;
    const p = this.hub.ctx.entities.player.position;
    if (Math.hypot(p.x - home.position.x, p.z - home.position.z) < RESPAWN_DIST) return;
    w.durability = w.maxDurability;
    this.lay(w, home.position, home.yaw);
  }

  /** Lock target first, else whoever is most in front within throwing range. */
  throwTarget(c: ICharacter): ICharacter | null {
    const lock = this.hub.lock.target;
    if (lock && lock.isAlive()) return lock;
    let best: ICharacter | null = null;
    let bestD = AIM_RANGE;
    for (const e of this.hub.director.activeEnemies) {
      const d = Math.hypot(e.position.x - c.position.x, e.position.z - c.position.z);
      if (d >= bestD || Math.abs(wrapAngle(yawTo(c.position, e.position) - c.facing)) > AIM_CONE) continue;
      bestD = d;
      best = e;
    }
    return best;
  }

  private create(kind: WeaponKind, home: PropSpawn | null): WeaponProp {
    const spec = WEAPONS[kind];
    const w = new WeaponProp(`weapon_${++this.serial}`, kind, spec, buildWeaponModel(kind), home);
    this.list.push(w);
    this.hub.ctx.interactions.register(this.interactable(w));
    return w;
  }

  private interactable(w: WeaponProp): IInteractable {
    const player = (): ICharacter => this.hub.ctx.entities.player;
    return {
      id: w.id,
      label: `拾起 ${w.displayName}`,
      radius: PICKUP_RADIUS,
      modes: ['freeRoam', 'combat'],
      priority: -1,
      getPosition: () => w.position,
      isEnabled: () => w.state === 'lying' && !player().heldWeapon && player().isAlive() && canAct(player()),
      interact: () => {
        if (this.pickUp(player(), w)) player().playAnim('pickup', { restart: true });
      },
    };
  }

  /** Place a weapon at rest on the ground at `at`. */
  private lay(w: WeaponProp, at: Vector3, yaw: number): void {
    const o = w.object3d;
    this.scene.add(o);
    const tilt = w.spec.restTilt;
    o.rotation.order = 'YXZ';
    o.rotation.set(tilt, yaw, 0);
    // Height of the tilted box's lowest face above its centre.
    const up = Math.abs(Math.cos(tilt)) * w.model.half.y + Math.abs(Math.sin(tilt)) * w.model.half.z;
    o.position.set(at.x, at.y + up + 0.01, at.z);
    o.visible = true;
    w.vel.set(0, 0, 0);
    this.settle(w, 0);
  }

  /** Hand the weapon to physics as a loose prop, moving at `keep` × its current velocity. */
  private settle(w: WeaponProp, keep: number): void {
    this.freeBody(w);
    w.state = 'lying';
    w.thrower = null;
    w.body = this.hub.ctx.physics.createDynamicBox(w.object3d, w.model.half, { mass: w.spec.mass });
    if (keep > 0) w.body.setLinvel({ x: w.vel.x * keep, y: w.vel.y * keep, z: w.vel.z * keep }, true);
  }

  /** Out of the hand, into the scene, keeping its world pose. */
  private release(w: WeaponProp): void {
    const h = w.holder;
    w.holder = null;
    if (h && h.heldWeapon === w) h.heldWeapon = null;
    if (h && w.object3d.parent !== this.scene) h.rig.attachToHand('right', null);
    this.scene.attach(w.object3d);
  }

  private shatter(w: WeaponProp): void {
    if (w.holder) this.release(w);
    this.freeBody(w);
    const { audio, events } = this.hub.ctx;
    this.debris.burst(w.position, w.spec.shards, w.spec.shardSize, w.model.shardMaterial);
    for (const id of w.spec.breakSfx) audio.playSfx(id, { position: w.position });
    events.emit('weapon:broken', { weaponId: w.id, kind: w.weaponKind });
    w.state = 'gone';
    w.object3d.removeFromParent();
    if (w.home) w.respawn = RESPAWN_AFTER;
    else this.forget(w);
  }

  private forget(w: WeaponProp): void {
    this.hub.ctx.interactions.unregister(w.id);
    const i = this.list.indexOf(w);
    if (i >= 0) this.list.splice(i, 1);
    w.dispose();
  }

  private freeBody(w: WeaponProp): void {
    if (w.body) this.hub.ctx.physics.removeBody(w.body);
    w.body = null;
  }
}
