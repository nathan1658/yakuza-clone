/**
 * The 大排檔 folding tables 烏鴉 flips (掀桌). Each table is one merged mesh on
 * a dynamic physics box; all the plastic stools are one static mesh, so the
 * set costs 5 draw calls and no lights. A flip: the brain grabs a table and
 * starts b_tableFlip; while the move's windup runs the table is heaved up in
 * front of him, tipping towards the player; when the windup ends it is thrown,
 * spinning, along his facing. The damage is the move's own cone
 * (Motor → HitResolver), never the physics contact. A thrown or dropped table
 * is spent: it lies where it lands until dispose().
 */
import {
  BoxGeometry, BufferAttribute, Color, CylinderGeometry, Euler, Mesh, MeshStandardMaterial, Quaternion, Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { TAU } from '../../core/math';
import { CG, interactionGroups, type ICharacter } from '../../core/types';
import type { CombatHub } from '../hub';
import type { Fighter } from '../Fighter';
import { MOVES } from '../moves';
import { nearestTable, tableRing, type XZ } from './bossRules';

const COUNT = 4;
const TABLE = { radius: 0.45, height: 0.74, top: 0.03, leg: 0.3, mass: 8 } as const;
const STOOL = { dist: 0.78, seat: 0.43, leg: 0.11 } as const;
const GROUPS = interactionGroups(CG.PROP, CG.STATIC | CG.PROP | CG.CHARACTER | CG.DEBRIS);
/** The heaved table ends up in front of his chest, tipped over towards the player. */
const HOLD = { fwd: 0.95, y: 1.0, tilt: 1.2 } as const;
/** Flat and fast so it reaches the player about when the move's hit lands. */
const THROW = { speed: 9, up: 3, spin: 10 } as const;
const COLORS = { top: 0xd8d0bc, steel: 0x70767c, stools: [0xb8322a, 0x2f5f9e] } as const;
const FLIP = MOVES.b_tableFlip.id;

interface Table {
  readonly mesh: Mesh;
  readonly body: RigidBody;
  state: 'standing' | 'held' | 'spent';
  holder: Fighter | null;
  /** Pose when grabbed: the heave blends from here. */
  readonly from: Vector3;
  readonly fromQ: Quaternion;
}

/** One set per combat hub, so the boss brain can find it without extra wiring. */
const REGISTRY = new WeakMap<CombatHub, DaiPaiDongTables>();
const STILL = { x: 0, y: 0, z: 0 };
const pos = new Vector3();
const quat = new Quaternion();
const aim = new Quaternion();
const euler = new Euler();

export class DaiPaiDongTables {
  private tables: Table[] = [];
  private stools: Mesh | null = null;
  private tableGeo: BufferGeometry | null = null;
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 });

  /** The tables made with this hub, if any (the boss brain looks here). */
  static of(hub: CombatHub): DaiPaiDongTables | null {
    return REGISTRY.get(hub) ?? null;
  }

  constructor(private readonly hub: CombatHub) {
    REGISTRY.set(hub, this);
  }

  /** Set the tables out around `center`, leaning towards the world point `toward` (e.g. the player). */
  spawn(center: Vector3, toward: Vector3): void {
    this.dispose();
    const { physics, engine } = this.hub.ctx;
    const geo = (this.tableGeo = tableGeometry());
    const half = new Vector3(TABLE.radius, TABLE.height / 2, TABLE.radius);
    const stoolParts: BufferGeometry[] = [];
    for (const s of tableRing(center, toward, COUNT, Math.random)) {
      const mesh = new Mesh(geo, this.material);
      mesh.position.set(s.x, center.y + TABLE.height / 2, s.z);
      mesh.rotation.y = s.yaw;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      engine.scene.add(mesh);
      mesh.updateMatrixWorld();
      const body = physics.createDynamicBox(mesh, half, {
        mass: TABLE.mass, friction: 0.7, restitution: 0.15, groups: GROUPS, angularDamping: 0.3,
      });
      this.tables.push({ mesh, body, state: 'standing', holder: null, from: new Vector3(), fromQ: new Quaternion() });
      stoolParts.push(...stoolsAround(s, center.y, Math.random));
    }
    this.stools = new Mesh(merge(stoolParts), this.material);
    this.stools.castShadow = true;
    engine.scene.add(this.stools);
  }

  update(_dt: number): void {
    for (const t of this.tables) {
      if (t.state === 'held') this.hold(t);
    }
  }

  dispose(): void {
    const { physics, engine } = this.hub.ctx;
    for (const t of this.tables) {
      physics.removeBody(t.body);
      engine.scene.remove(t.mesh);
    }
    this.tables = [];
    if (this.stools) {
      engine.scene.remove(this.stools);
      this.stools.geometry.dispose();
      this.stools = null;
    }
    this.tableGeo?.dispose();
    this.tableGeo = null;
    this.material.dispose();
  }

  /** Index of the nearest table still standing within `maxDist` of `from`, or -1. */
  nearest(from: XZ, maxDist: number): number {
    return nearestTable(this.tables.map((t) => (t.state === 'standing' ? t.mesh.position : null)), from, maxDist);
  }

  /** Where table `i` stands, or null once it is taken. */
  standing(i: number): Vector3 | null {
    const t = this.tables[i];
    return t && t.state === 'standing' ? t.mesh.position : null;
  }

  /** `holder` heaves table `i`: it rides their b_tableFlip windup and flies when it ends. */
  grab(i: number, holder: Fighter): boolean {
    const t = this.tables[i];
    if (!t || t.state !== 'standing') return false;
    t.state = 'held';
    t.holder = holder;
    t.from.copy(t.mesh.position);
    t.fromQ.copy(t.mesh.quaternion);
    this.hub.ctx.audio.playSfx('metal_clang', { position: t.mesh.position, volume: 0.8 });
    this.hub.vfx.dust(t.mesh.position);
    return true;
  }

  private hold(t: Table): void {
    const f = t.holder;
    // Knocked out of the move (KO, grab, fight over): the table just drops.
    if (!f || f.c.combatState !== 'attacking' || f.move?.id !== FLIP) {
      t.state = 'spent';
      t.holder = null;
      return;
    }
    if (f.windupTo > 0) this.lift(t, f.c, f.norm / f.windupTo);
    else this.launch(t, f.c);
  }

  /** Blend from where the table stood to held-up-and-tipped in front of him. */
  private lift(t: Table, c: ICharacter, k: number): void {
    const e = Math.min(1, Math.max(0, k));
    const s = e * (2 - e);
    const fx = Math.sin(c.facing);
    const fz = Math.cos(c.facing);
    pos.set(c.position.x + fx * HOLD.fwd, c.position.y + HOLD.y, c.position.z + fz * HOLD.fwd);
    pos.sub(t.from).multiplyScalar(s).add(t.from);
    aim.setFromEuler(euler.set(HOLD.tilt, c.facing, 0, 'YXZ'));
    quat.slerpQuaternions(t.fromQ, aim, s);
    t.body.setTranslation(pos, true);
    t.body.setRotation(quat, true);
    t.body.setLinvel(STILL, true);
    t.body.setAngvel(STILL, true);
    t.mesh.position.copy(pos);
    t.mesh.quaternion.copy(quat);
  }

  /** Thrown along his facing, tumbling end over end (about his right axis). */
  private launch(t: Table, c: ICharacter): void {
    const fx = Math.sin(c.facing);
    const fz = Math.cos(c.facing);
    t.state = 'spent';
    t.holder = null;
    t.body.setLinvel({ x: fx * THROW.speed, y: THROW.up, z: fz * THROW.speed }, true);
    t.body.setAngvel({ x: fz * THROW.spin, y: 0, z: -fx * THROW.spin }, true);
    const { ctx, vfx } = this.hub;
    ctx.audio.playSfx('glass_break', { position: t.mesh.position });
    ctx.cameraRig.punch(-4, 0.25);
    ctx.cameraRig.shake(0.3, 0.25);
    vfx.dust(t.mesh.position);
  }
}

/** Round melamine top, four steel legs and two braces; origin at the box centre. */
function tableGeometry(): BufferGeometry {
  const { radius: r, height: h, top, leg } = TABLE;
  const parts = [paint(new CylinderGeometry(r, r, top, 24).translate(0, h / 2 - top / 2, 0), COLORS.top)];
  for (const [x, z] of corners(leg)) {
    parts.push(paint(new CylinderGeometry(0.016, 0.016, h - top, 6).translate(x, -top / 2, z), COLORS.steel));
  }
  for (const z of [leg, -leg]) parts.push(paint(new BoxGeometry(2 * leg, 0.02, 0.02).translate(0, -h / 4, z), COLORS.steel));
  return merge(parts);
}

/** One or two plastic stools on opposite sides of a table, in world space. */
function stoolsAround(s: XZ, y: number, rand: () => number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const n = rand() < 0.5 ? 1 : 2;
  const a0 = rand() * TAU;
  for (let i = 0; i < n; i++) {
    const x = s.x + Math.sin(a0 + i * Math.PI) * STOOL.dist;
    const z = s.z + Math.cos(a0 + i * Math.PI) * STOOL.dist;
    const color = COLORS.stools[Math.floor(rand() * COLORS.stools.length)];
    parts.push(paint(new CylinderGeometry(0.17, 0.17, 0.035, 12).translate(x, y + STOOL.seat, z), color));
    for (const [lx, lz] of corners(STOOL.leg)) {
      parts.push(paint(new BoxGeometry(0.035, STOOL.seat, 0.035).translate(x + lx, y + STOOL.seat / 2, z + lz), color));
    }
  }
  return parts;
}

function corners(d: number): readonly (readonly [number, number])[] {
  return [[d, d], [d, -d], [-d, d], [-d, -d]];
}

function paint(g: BufferGeometry, hex: number): BufferGeometry {
  const c = new Color(hex);
  const rgb = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = c.r;
    rgb[i + 1] = c.g;
    rgb[i + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(rgb, 3));
  return g;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}
