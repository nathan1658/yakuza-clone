/**
 * Runs one fight at a time: spawns the enemies, raises the ring, feeds in
 * later waves, detects the win, pays out and tears everything down.
 */
import { Vector3 } from 'three';
import { yawTo } from '../core/math';
import type { EncounterId, EncounterResult, ICharacter } from '../core/types';
import type { CombatHub } from './hub';
import { fighterOf } from './Fighter';
import { Arena } from './Arena';
import { EnemyBrain, type Pattern } from './ai/EnemyBrain';
import { BossBrain } from './boss/BossBrain';
import { DaiPaiDongTables } from './boss/DaiPaiDongTables';
import { arenaRadiusFor } from './arenaGeometry';
import { ENCOUNTERS, resolveWaves, rewardFor, type EncounterDef, type EnemySpec } from './encounters';
import { PATTERNS } from './moves';
import { ARCHETYPES, BOSS_BAR, BOSS_ID, VICTORY_SLOWMO, type ArchetypeId } from './tables';

type Phase = 'prepared' | 'running' | 'victory';

interface Encounter {
  def: EncounterDef;
  center: Vector3;
  waves: EnemySpec[][];
  waveIndex: number;
  /** Everyone spawned for this fight, alive or not. */
  enemies: ICharacter[];
  phase: Phase;
  waveTimer: number;
  victoryTimer: number;
}

interface Corpse {
  id: string;
  t: number;
}

const PATTERNS_OF: Readonly<Record<Exclude<ArchetypeId, 'boss'>, readonly Pattern[]>> = {
  goon: PATTERNS.goon,
  lieutenant: PATTERNS.lieutenant,
  collector: PATTERNS.goon,
};

const FIRST_WAVE_RING: readonly [number, number] = [2.5, 5];
const LATER_WAVE_RING = { min: 11, max: 13 } as const;
const NEXT_WAVE_DELAY = 1;
/** Real seconds of slow motion + breath between the last KO and the payout. */
const VICTORY_BEAT = 1.5;
const CORPSE_TIME = 8;
const FACTION = 'tungShing';


export class EncounterDirector {
  /** Alive enemies of the running fight (rebuilt every frame, never reallocated). */
  readonly activeEnemies: ICharacter[] = [];
  /** Everyone whose combat motor should tick: the running fight's cast plus bodies still lying around. */
  readonly participants: ICharacter[] = [];
  readonly arena: Arena;
  private current: Encounter | null = null;
  private readonly waiters = new Map<EncounterId, ((r: EncounterResult) => void)[]>();
  private readonly corpses: Corpse[] = [];
  private serial = 0;

  constructor(private readonly hub: CombatHub) {
    this.arena = new Arena(hub.ctx.physics);
  }

  get fighting(): boolean {
    return this.current !== null && this.current.phase === 'running';
  }

  /** The encounter in progress (running or celebrating the win). */
  get encounterId(): EncounterId | null {
    return this.current && this.current.phase !== 'prepared' ? this.current.def.id : null;
  }

  /** How hard the thugs of the current fight press (1 = the first alley). */
  get aggression(): number {
    return this.current?.def.aggression ?? 1;
  }

  get isBossFight(): boolean {
    return this.current !== null && this.current.def.isBoss && this.current.phase === 'running';
  }

  prepare(id: EncounterId): ICharacter[] {
    const cur = this.current;
    if (cur && cur.def.id === id) return cur.enemies.slice();
    if (cur && cur.phase !== 'prepared') {
      console.warn(`[combat] prepareEncounter('${id}') ignored: '${cur.def.id}' is still on`);
      return [];
    }
    if (cur) this.despawnAll(cur);
    DaiPaiDongTables.of(this.hub)?.dispose();
    const def = ENCOUNTERS[id];
    const center = def.location ? this.hub.ctx.world.getLocation(def.location).position.clone()
      : this.hub.ctx.entities.player.position.clone();
    const enc: Encounter = {
      def, center, waves: resolveWaves(def, Math.random), waveIndex: 0, enemies: [],
      phase: 'prepared', waveTimer: 0, victoryTimer: 0,
    };
    this.current = enc;
    const ring = def.spawnRing ?? FIRST_WAVE_RING;
    this.spawnWave(enc, ring[0], ring[1]);
    return enc.enemies.slice();
  }

  start(id: EncounterId): void {
    const cur = this.current;
    if (cur && cur.phase !== 'prepared') {
      if (cur.def.id !== id) console.warn(`[combat] startEncounter('${id}') ignored: '${cur.def.id}' is still on`);
      return;
    }
    if (!cur || cur.def.id !== id) this.prepare(id);
    const enc = this.current;
    if (!enc) return;
    const { ctx } = this.hub;
    enc.phase = 'running';
    for (const e of enc.enemies) e.stance = 'combat';
    // A street ambush rings in wherever the player stands now, not where the thugs were rolled.
    if (!enc.def.location) enc.center.copy(ctx.entities.player.position);
    // The HUD reads the roster in the same frame the fight starts.
    this.rebuildLists();
    this.arena.build(enc.center, this.ringRadius(enc));
    ctx.events.emit('combat:start', { encounterId: id, enemyIds: enc.enemies.map((e) => e.id), isBoss: enc.def.isBoss });
    if (enc.def.isBoss) this.bossIntro(enc);
    else if (enc.def.toast) ctx.ui.toast(enc.def.toast, 'warning');
    if (!ctx.state.transition('combat', { encounterId: id })) {
      console.warn(`[combat] could not enter 'combat' from '${ctx.state.mode}'`);
    }
  }

  wait(id: EncounterId): Promise<EncounterResult> {
    return new Promise((resolve) => {
      const list = this.waiters.get(id);
      if (list) list.push(resolve);
      else this.waiters.set(id, [resolve]);
    });
  }

  update(dt: number, realDt: number): void {
    this.tickCorpses(dt);
    this.rebuildLists();
    const enc = this.current;
    if (!enc || enc.phase === 'prepared') return;
    if (enc.phase === 'victory') {
      enc.victoryTimer -= realDt;
      if (enc.victoryTimer <= 0) this.win(enc);
      return;
    }
    // A heat action finishing off the last enemy wraps up once it hands control back.
    if (this.activeEnemies.length > 0 || !this.hub.ctx.state.is('combat')) return;
    if (enc.waveIndex + 1 < enc.waves.length) this.nextWave(enc, dt);
    else this.beginVictory(enc);
  }

  /**
   * Tear the fight down without a result (game over, load, new game): enemies
   * and ring go now; `announce` must follow once the rest of combat is reset.
   */
  abort(): EncounterId | null {
    const enc = this.current;
    this.current = null;
    this.activeEnemies.length = 0;
    this.arena.remove();
    DaiPaiDongTables.of(this.hub)?.dispose();
    if (enc) this.despawnAll(enc);
    for (const c of this.corpses) this.hub.ctx.entities.despawn(c.id);
    this.corpses.length = 0;
    this.participants.length = 0;
    if (enc?.def.isBoss) this.hub.ctx.ui.hideBossBar();
    return enc && enc.phase !== 'prepared' ? enc.def.id : null;
  }

  /** Resolve the waiters and tell everyone the fight is over. */
  announce(id: EncounterId, victory: boolean, moneyEarned: number): void {
    const result: EncounterResult = { encounterId: id, victory, moneyEarned };
    this.hub.ctx.events.emit('combat:end', result);
    const list = this.waiters.get(id);
    this.waiters.delete(id);
    if (list) for (const resolve of list) resolve(result);
  }

  // -------------------------------------------------------------------------

  private bossIntro(enc: Encounter): void {
    const { ctx } = this.hub;
    ctx.ui.showBossBar(BOSS_BAR.name, BOSS_BAR.title);
    DaiPaiDongTables.of(this.hub)?.spawn(enc.center, ctx.entities.player.position);
    for (const e of enc.enemies) if (e.role === 'boss') this.hub.boss.begin(e);
  }

  private nextWave(enc: Encounter, dt: number): void {
    enc.waveTimer += dt;
    if (enc.waveTimer < NEXT_WAVE_DELAY) return;
    enc.waveTimer = 0;
    enc.waveIndex++;
    const r = Math.min(LATER_WAVE_RING.min, this.arena.radius - 2);
    const fresh = this.spawnWave(enc, r, Math.min(LATER_WAVE_RING.max, this.arena.radius - 1));
    for (const e of fresh) e.stance = 'combat';
    this.hub.ctx.audio.playSfx('enemy_alert', { position: fresh[0]?.position });
    this.hub.ctx.ui.toast('又嚟多班！', 'warning');
  }

  private beginVictory(enc: Encounter): void {
    enc.phase = 'victory';
    enc.victoryTimer = VICTORY_BEAT;
    this.hub.timeFx.slowmo(VICTORY_SLOWMO.scale, VICTORY_SLOWMO.dur);
    this.hub.ctx.audio.playSfx('slowmo_in', { volume: 0.6 });
    this.hub.ctx.cameraRig.punch(-4, 0.4);
  }

  /** Agreed order: freeRoam, then 'combat:end', then the waiters. */
  private win(enc: Encounter): void {
    const { ctx } = this.hub;
    this.current = null;
    this.arena.remove();
    this.hub.lock.clear();
    const count = enc.enemies.length;
    const money = rewardFor(enc.def, count, Math.random);
    if (money > 0) {
      ctx.inventory.addMoney(money);
      ctx.ui.toast(`+HK$${money.toLocaleString('en-US')}`, 'money');
      ctx.audio.playSfx('money');
    }
    if (enc.def.isBoss) ctx.ui.hideBossBar();
    for (const e of enc.enemies) this.bury(e);
    const p = ctx.entities.player;
    if (p.isAlive() && (p.combatState === 'idle' || p.combatState === 'moving')) p.playAnim('victory', { restart: true });
    ctx.state.transition('freeRoam');
    this.announce(enc.def.id, true, money);
  }

  /** The beaten stay down for a while; 烏鴉 stays until the story is done with him. */
  private bury(e: ICharacter): void {
    e.stance = 'normal';
    e.brain?.dispose?.();
    e.brain = null;
    if (e.id !== BOSS_ID) this.corpses.push({ id: e.id, t: CORPSE_TIME });
  }

  private tickCorpses(dt: number): void {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.t -= dt;
      if (c.t > 0) continue;
      this.hub.ctx.entities.despawn(c.id);
      this.corpses.splice(i, 1);
    }
  }

  private rebuildLists(): void {
    this.activeEnemies.length = 0;
    this.participants.length = 0;
    const enc = this.current;
    if (enc && enc.phase !== 'prepared') {
      for (const e of enc.enemies) {
        this.participants.push(e);
        if (enc.phase === 'running' && e.isAlive()) this.activeEnemies.push(e);
      }
    }
    for (const c of this.corpses) {
      const e = this.hub.ctx.entities.getCharacter(c.id);
      if (e) this.participants.push(e);
    }
  }

  private despawnAll(enc: Encounter): void {
    for (const e of enc.enemies) this.hub.ctx.entities.despawn(e.id);
    enc.enemies.length = 0;
  }

  /** Enclose everyone taking part, player included. */
  private ringRadius(enc: Encounter): number {
    let far = 0;
    const p = this.hub.ctx.entities.player.position;
    far = Math.max(far, Math.hypot(p.x - enc.center.x, p.z - enc.center.z));
    for (const e of enc.enemies) far = Math.max(far, Math.hypot(e.position.x - enc.center.x, e.position.z - enc.center.z));
    return arenaRadiusFor(enc.def.arenaRadius, far);
  }

  private spawnWave(enc: Encounter, minR: number, maxR: number): ICharacter[] {
    const specs = enc.waves[enc.waveIndex] ?? [];
    const lone = enc.def.faceToward && specs.length === 1;
    const points = lone ? [enc.center] : this.hub.ctx.world.getSpawnPoints(enc.center, minR, maxR, specs.length);
    const face = enc.def.faceToward ? this.hub.ctx.world.getLocation(enc.def.faceToward).position : enc.center;
    const out: ICharacter[] = [];
    for (let i = 0; i < specs.length; i++) {
      const at = points[i] ?? points[points.length - 1] ?? enc.center;
      const c = this.spawnEnemy(specs[i], at, lone ? face : this.faceTarget(enc));
      enc.enemies.push(c);
      out.push(c);
    }
    return out;
  }

  /** Enemies face the player if they're already in the ring, else the centre. */
  private faceTarget(enc: Encounter): Vector3 {
    const p = this.hub.ctx.entities.player.position;
    return Math.hypot(p.x - enc.center.x, p.z - enc.center.z) < enc.def.arenaRadius + 4 ? p : enc.center;
  }

  private spawnEnemy(spec: EnemySpec, at: Vector3, face: Vector3): ICharacter {
    const { entities } = this.hub.ctx;
    const arch = ARCHETYPES[spec.archetype];
    const id = spec.archetype === 'boss' ? BOSS_ID : `enemy_${++this.serial}`;
    if (entities.getCharacter(id)) entities.despawn(id);
    const c = entities.spawnCharacter({
      id,
      name: arch.displayName,
      role: arch.role,
      faction: FACTION,
      appearance: arch.presets[Math.floor(Math.random() * arch.presets.length)],
      position: at.clone(),
      yaw: yawTo(at, face),
      maxHp: spec.hp,
      stats: { ...arch.stats },
    });
    c.stance = 'normal';
    fighterOf(c);
    if (spec.weapon) this.hub.weapons.give(c, spec.weapon);
    c.brain = spec.archetype === 'boss'
      ? new BossBrain(this.hub, c)
      : new EnemyBrain(this.hub, c, arch, PATTERNS_OF[spec.archetype]);
    return c;
  }
}
