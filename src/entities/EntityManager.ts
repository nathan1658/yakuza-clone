/**
 * Owns every Character, the PlayerController, NPC idle brains, soft
 * separation, the shadow budget, the ambient crowd and the 'player' saveable.
 */
import { Vector3 } from 'three';
import {
  FIXED_DT, type CharacterRole, type CharacterSpawnDef, type CombatState, type CombatStats, type Faction,
  type GameContext, type GameSystem, type GameTime, type ICharacter, type IEntityManager, type WeatherKind,
} from '../core/types';
import { Character, type FrameClock } from './Character';
import { IdleBrain } from './IdleBrain';
import { resolveLook } from './look/build';
import { separation } from './motion';
import { Pedestrians } from './pedestrians/Pedestrians';
import { PlayerController } from './PlayerController';
import { playerSaveable } from './playerSave';
import { characterLighting } from './rig/materials';

type Filter = { role?: CharacterRole; faction?: Faction; alive?: boolean };

const DEFAULT_STATS: CombatStats = { power: 1, defense: 1, speed: 1, poise: 20 };
const DEFAULT_HP = 100;
const BRAINED_ROLES: ReadonlySet<CharacterRole> = new Set<CharacterRole>(['npc', 'vendor']);
/** States where combat pins two bodies together on purpose. */
const PINNED: ReadonlySet<CombatState> = new Set<CombatState>(['grabbing', 'grabbed', 'heatLocked']);
const SEPARATION_RATE = 12;
const PLAYER_YIELD = 0.25;
const SHADOW_MAX = 10;
const SHADOW_RANGE_SQ = 30 * 30;
/** How soaked clothes and hair get in each weather, and how fast (per second) they wet and dry. */
const WETNESS: Readonly<Record<WeatherKind, number>> = { clear: 0.1, drizzle: 0.6, rain: 1 };
const SOAK_RATE = 0.25;
const DRY_RATE = 0.04;

function matches(c: ICharacter, f: Filter | undefined): boolean {
  return !f || ((!f.role || c.role === f.role) && (!f.faction || c.faction === f.faction) && (f.alive === undefined || c.isAlive() === f.alive));
}

export class EntityManager implements IEntityManager, GameSystem {
  readonly name = 'entities';
  playerInputEnabled = true;

  private readonly byId = new Map<string, Character>();
  private readonly list: Character[] = [];
  private readonly clock: FrameClock = { alpha: 1 };
  private readonly push = new Vector3();
  private readonly pushB = new Vector3();
  private acc = 0;
  private counter = 0;
  private hero: Character | null = null;
  private controller: PlayerController | null = null;
  private crowd: Pedestrians | null = null;
  private wetKnown = false;

  constructor(private readonly ctx: GameContext) {}

  get player(): ICharacter {
    if (!this.hero) throw new Error('[entities] player accessed before EntityManager.init()');
    return this.hero;
  }

  init(): void {
    const { ctx } = this;
    characterLighting.envMap = ctx.world.environment ?? null;
    const start = ctx.world.getLocation('player_start');
    const hero = this.spawn({
      id: 'player', name: '陳浩南', role: 'player', faction: 'hungHing', appearance: 'hoNam',
      position: start.position, yaw: start.yaw, maxHp: 200, stats: { poise: 30 },
    });
    this.hero = hero;
    this.controller = new PlayerController(ctx, hero);
    ctx.cameraRig.setFollowTarget(hero.object3d);
    ctx.save.register(playerSaveable(ctx, hero));
    this.crowd = new Pedestrians(ctx, hero);
  }

  spawnCharacter(def: CharacterSpawnDef): ICharacter {
    return this.spawn(def);
  }

  despawn(id: string): void {
    const c = this.byId.get(id);
    if (!c) return;
    if (c === this.hero) {
      console.warn('[entities] the player cannot be despawned');
      return;
    }
    this.byId.delete(id);
    this.list.splice(this.list.indexOf(c), 1);
    c.dispose();
  }

  getCharacter(id: string): ICharacter | undefined {
    return this.byId.get(id);
  }

  getCharacters(filter?: Filter): ICharacter[] {
    return this.list.filter((c) => matches(c, filter));
  }

  queryRadius(center: Vector3, radius: number, filter?: Filter): ICharacter[] {
    const r2 = radius * radius;
    return this.list.filter((c) => {
      const dx = c.position.x - center.x;
      const dz = c.position.z - center.z;
      return dx * dx + dz * dz <= r2 && matches(c, filter);
    });
  }

  setPedestrianDensity(density: number): void {
    this.crowd?.setDensity(density);
  }

  fixedUpdate(dt: number): void {
    this.acc -= dt;
    for (const c of this.list) c.fixedUpdate(dt);
    const k = Math.min(1, SEPARATION_RATE * dt);
    for (let i = 0; i < this.list.length; i++) {
      for (let j = i + 1; j < this.list.length; j++) this.separate(this.list[i], this.list[j], k);
    }
  }

  update(time: GameTime): void {
    this.acc = Math.min(FIXED_DT, Math.max(0, this.acc + time.dt));
    this.clock.alpha = this.acc / FIXED_DT;
    const { combat } = this.ctx;
    for (const c of this.list) {
      if (c.brain && c.isAlive() && !c.scripted && combat.canMove(c)) c.brain.update(time);
    }
    this.controller?.update(time);
    for (const c of this.list) c.update(time);
    this.crowd?.update(time);
    this.shadowBudget();
    this.soak(time.realDt);
  }

  dispose(): void {
    this.crowd?.dispose();
    for (const c of this.list) c.dispose();
    this.list.length = 0;
    this.byId.clear();
  }

  private spawn(def: CharacterSpawnDef): Character {
    const id = def.id ?? `${def.role}_${++this.counter}`;
    if (this.byId.has(id)) {
      console.warn(`[entities] '${id}' already exists; replacing it`);
      this.despawn(id);
    }
    const c = new Character(this.ctx, this.clock, {
      id,
      name: def.name,
      role: def.role,
      faction: def.faction,
      look: resolveLook(def.appearance),
      position: def.position,
      yaw: def.yaw ?? 0,
      maxHp: def.maxHp ?? DEFAULT_HP,
      stats: { ...DEFAULT_STATS, ...def.stats },
      idleClip: def.idleClip ?? 'idle',
    });
    if (BRAINED_ROLES.has(def.role)) c.brain = new IdleBrain(this.ctx, c);
    this.ctx.engine.scene.add(c.object3d);
    this.byId.set(id, c);
    this.list.push(c);
    return c;
  }

  /** Pushes overlapping bodies apart through the KCC so walls still hold; the player yields less. */
  private separate(a: Character, b: Character, k: number): void {
    if (!this.separable(a) || !this.separable(b)) return;
    const pa = a.body.position;
    const pb = b.body.position;
    if (!separation(pa.x, pa.z, pb.x, pb.z, a.radius + b.radius, k, this.push)) return;
    const wa = a === this.hero ? PLAYER_YIELD : 1;
    const wb = b === this.hero ? PLAYER_YIELD : 1;
    const share = wa / (wa + wb);
    b.body.move(this.pushB.copy(this.push).multiplyScalar(share - 1));
    a.body.move(this.push.multiplyScalar(share));
  }

  private separable(c: Character): boolean {
    return c.object3d.visible && c.isAlive() && !PINNED.has(c.combatState);
  }

  /** Clothes and hair follow the weather: quick to soak, slow to dry. */
  private soak(realDt: number): void {
    const target = WETNESS[this.ctx.world.weather] ?? 0;
    const wet = characterLighting.wet;
    if (!this.wetKnown) {
      wet.value = target;
      this.wetKnown = true;
      return;
    }
    const rate = target > wet.value ? SOAK_RATE : DRY_RATE;
    wet.value += (target - wet.value) * (1 - Math.exp(-rate * realDt));
  }

  /** Only the nearest few characters to the camera cast shadows. */
  private shadowBudget(): void {
    const eye = this.ctx.cameraRig.camera.position;
    for (const c of this.list) c.rig.setCastShadow(false);
    for (let n = 0; n < SHADOW_MAX; n++) {
      let best: Character | null = null;
      let bestD = SHADOW_RANGE_SQ;
      for (const c of this.list) {
        const d = c.position.distanceToSquared(eye);
        if (d >= bestD || !c.object3d.visible || c.rig.castShadow) continue;
        best = c;
        bestD = d;
      }
      if (!best) return;
      best.rig.setCastShadow(true);
    }
  }
}
