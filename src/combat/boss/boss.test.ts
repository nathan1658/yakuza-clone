/**
 * 烏鴉: the pure decisions, then headless fights against the real CombatSystem
 * (fakes of the other modules, as in slice.test.ts) with BossBrain attached.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Group, Scene, Vector3, type Object3D } from 'three';
import type { AnimClipDef, CharacterSpawnDef, CombatState, GameContext, GameTime, ICharacter } from '../../core/types';
import { turnTowards, wrapAngle, yawTo } from '../../core/math';
import { CombatSystem } from '../CombatSystem';
import type { CombatHub } from '../hub';
import { fighterOf } from '../Fighter';
import { PATTERNS } from '../moves';
import { BossBrain } from './BossBrain';
import { DaiPaiDongTables } from './DaiPaiDongTables';
import {
  FLIP_PLAYER_MAX, GRAB_CHANCE, GRAB_RANGE, RUSH_BAND, RUSH_CHANCE, TABLE_RING, TABLE_SPREAD, TABLE_WALK, TURTLE_TIME,
  choosePlan, nearestTable, patternFor, phaseDef, tableRing, type BossView,
} from './bossRules';

const view = (over: Partial<BossView> = {}): BossView => ({
  phase: 1, dist: 2.5, flipReady: false, tableDist: Infinity, turtle: 0, roll: 0.99, ...over,
});
const MID = (RUSH_BAND[0] + RUSH_BAND[1]) / 2;

describe('bossRules', () => {
  it('reads each phase off BOSS_PHASES, clamped', () => {
    expect(phaseDef(0)).toBe(phaseDef(1));
    expect(phaseDef(1).armor).toBe(false);
    expect(phaseDef(2).armor).toBe(true);
    expect(phaseDef(3).grab).toBe(true);
    expect(phaseDef(9)).toBe(phaseDef(3));
  });

  it('boxes in phase 1: strings, a rush from mid range, never a flip or a grab', () => {
    expect(choosePlan(view())).toBe('string');
    expect(choosePlan(view({ dist: MID, roll: RUSH_CHANCE / 2 }))).toBe('rush');
    expect(choosePlan(view({ dist: MID }))).toBe('string');
    expect(choosePlan(view({ dist: 1, roll: RUSH_CHANCE / 2 }))).toBe('string');
    expect(choosePlan(view({ flipReady: true, tableDist: 1 }))).toBe('string');
    expect(choosePlan(view({ dist: 1, turtle: 9, roll: 0 }))).toBe('string');
  });

  it('flips in phase 2 only with a table in walking distance and the player in range', () => {
    const ready = { phase: 2, flipReady: true };
    expect(choosePlan(view({ ...ready, tableDist: 1.5 }))).toBe('flip');
    expect(choosePlan(view({ ...ready, tableDist: TABLE_WALK }))).toBe('flip');
    expect(choosePlan(view({ ...ready, tableDist: TABLE_WALK + 0.1 }))).toBe('string');
    expect(choosePlan(view({ ...ready, tableDist: 1.5, dist: FLIP_PLAYER_MAX + 0.5 }))).toBe('string');
    expect(choosePlan(view({ phase: 2, tableDist: 1.5 }))).toBe('string');
    expect(choosePlan(view({ phase: 2, dist: 1, turtle: 9, roll: 0 }))).toBe('string');
  });

  it('grabs in phase 3: always a turtle, now and then anyone close', () => {
    expect(choosePlan(view({ phase: 3, dist: 3, turtle: TURTLE_TIME }))).toBe('grab');
    expect(choosePlan(view({ phase: 3, dist: 3, turtle: TURTLE_TIME - 0.1 }))).toBe('string');
    expect(choosePlan(view({ phase: 3, dist: GRAB_RANGE, roll: GRAB_CHANCE / 2 }))).toBe('grab');
    expect(choosePlan(view({ phase: 3, dist: GRAB_RANGE }))).toBe('string');
    expect(choosePlan(view({ phase: 3, flipReady: true, tableDist: 2, turtle: 9 }))).toBe('flip');
  });

  it('strings come from PATTERNS.boss1, then the heavier boss2 set', () => {
    expect(patternFor(1, 0)).toBe(PATTERNS.boss1[0]);
    expect(patternFor(1, 1)).toBe(PATTERNS.boss1[PATTERNS.boss1.length - 1]);
    for (const phase of [2, 3]) {
      for (let r = 0; r < 1; r += 0.1) expect(PATTERNS.boss2).toContain(patternFor(phase, r));
    }
  });

  it('picks the nearest free table within reach', () => {
    const spots = [{ x: 3, z: 0 }, null, { x: 0, z: 2 }, { x: 10, z: 0 }];
    expect(nearestTable(spots, { x: 0, z: 0 }, 6)).toBe(2);
    expect(nearestTable(spots, { x: 0, z: 0 }, 1.5)).toBe(-1);
    expect(nearestTable(spots, { x: 9, z: 0 }, 6)).toBe(3);
    expect(nearestTable([null, null], { x: 0, z: 0 }, 99)).toBe(-1);
  });

  it('sets the tables on a ring, fanned out towards `toward`, never overlapping', () => {
    let seed = 3;
    const rand = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const center = { x: 10, z: -4 };
    for (const toward of [{ x: 10, z: 20 }, { x: -30, z: -4 }, { x: 14, z: -8 }]) {
      const base = Math.atan2(toward.x - center.x, toward.z - center.z);
      const spots = tableRing(center, toward, 4, rand);
      expect(spots).toHaveLength(4);
      for (const s of spots) {
        const r = Math.hypot(s.x - center.x, s.z - center.z);
        expect(r).toBeGreaterThanOrEqual(TABLE_RING[0]);
        expect(r).toBeLessThanOrEqual(TABLE_RING[1]);
        expect(Math.abs(wrapAngle(Math.atan2(s.x - center.x, s.z - center.z) - base))).toBeLessThanOrEqual(TABLE_SPREAD);
      }
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(1.2);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Headless fight

type Payload = Record<string, unknown>;
type Handler = (p: Payload) => void;

const DT = 1 / 60;
const TICK: GameTime = { dt: DT, realDt: DT, elapsed: 0, realElapsed: 0, frame: 0 };
const TRANSITIONS: Record<string, readonly string[]> = {
  freeRoam: ['dialogue', 'combat', 'cutscene', 'menu', 'shop'],
  combat: ['heatAction', 'freeRoam', 'gameOver', 'cutscene', 'dialogue', 'menu'],
  heatAction: ['combat', 'freeRoam', 'cutscene', 'gameOver'],
  gameOver: ['title', 'freeRoam', 'cutscene'],
};
const ALLEY = new Vector3(-83, 0, -58);

/** mulberry32: the AI rolls dice, the tests must not. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realRandom = Math.random;
beforeEach(() => {
  Math.random = seeded(7);
});
afterEach(() => {
  Math.random = realRandom;
});

const CLIPS: Record<string, readonly [number, number]> = {
  jab: [0.36, 0.42], cross: [0.42, 0.45], hook: [0.5, 0.48], heavyPunch: [0.75, 0.5], throwToss: [0.9, 0.5],
};
const clipDefs = new Map<string, AnimClipDef>();
function clipDef(name: string): AnimClipDef {
  let d = clipDefs.get(name);
  if (!d) {
    const [duration, impactAt] = CLIPS[name] ?? [0.5, 0.45];
    d = { name, duration, loop: false, keys: [], impactAt };
    clipDefs.set(name, d);
  }
  return d;
}

function makeCharacter(def: CharacterSpawnDef, id: string) {
  const maxHp = def.maxHp ?? 100;
  const root = new Group();
  root.position.copy(def.position);
  const hand = new Group();
  hand.position.set(0.25, 1.1, 0.3);
  root.add(hand);
  return {
    id, kind: 'character', role: def.role, faction: def.faction, displayName: def.name,
    position: root.position, facing: def.yaw ?? 0, radius: 0.35, height: 1.75, hp: maxHp, maxHp,
    stats: { power: 1, defense: 1, speed: 1, poise: 0, ...def.stats },
    combatState: 'idle' as CombatState, stateTime: 0, desiredVelocity: new Vector3(), stance: 'normal',
    heldWeapon: null, brain: null as { update(t: GameTime): void } | null, hyperArmor: false, invulnerable: false,
    userData: {} as Record<string, unknown>,
    anims: [] as string[],
    rig: {
      play() {}, getClipDef: clipDef, flash() {}, setOutline() {}, getBone: () => null,
      attachToHand(_hand: string, o: Object3D | null) {
        if (o) hand.add(o);
      },
    },
    isAlive() { return this.hp > 0; },
    faceTowards(p: Vector3, maxTurn = Infinity) { this.facing = turnTowards(this.facing, yawTo(this.position, p), maxTurn); },
    setDesiredVelocity(v: Vector3) { this.desiredVelocity.copy(v); },
    addImpulse() {},
    playAnim(clip: string | AnimClipDef) { this.anims.push(typeof clip === 'string' ? clip : clip.name); },
    moveTo: () => Promise.resolve(),
  };
}
type FakeCharacter = ReturnType<typeof makeCharacter>;

function harness() {
  const handlers = new Map<string, Handler[]>();
  const log: { type: string; payload: Payload }[] = [];
  const events = {
    on(type: string, h: Handler) {
      const list = handlers.get(type) ?? [];
      list.push(h);
      handlers.set(type, list);
      return () => list.splice(list.indexOf(h), 1);
    },
    emit(type: string, payload: Payload) {
      log.push({ type, payload });
      for (const h of [...(handlers.get(type) ?? [])]) h(payload);
    },
  };
  const state = {
    mode: 'freeRoam',
    is: (m: string) => state.mode === m,
    transition(to: string, payload?: unknown) {
      if (!TRANSITIONS[state.mode]?.includes(to)) return false;
      const from = state.mode;
      state.mode = to;
      events.emit('state:changed', { from, to, payload });
      return true;
    },
  };
  const engine = {
    scene: new Scene(), timeScale: 1, restoreIn: Infinity, renderPipeline: null,
    setTimeScale(s: number, realDur?: number) {
      engine.timeScale = s;
      engine.restoreIn = realDur ?? Infinity;
    },
  };
  const chars = new Map<string, FakeCharacter>();
  const player = makeCharacter({
    name: '陳浩南', role: 'player', faction: 'hungHing', appearance: 'hero', position: ALLEY.clone().add(new Vector3(0, 0, 3)), maxHp: 200,
  } as unknown as CharacterSpawnDef, 'player');
  const bodies: { lin: { x: number; y: number; z: number } }[] = [];
  const toasts: string[] = [];
  const ctx = {
    events, state, engine,
    // God mode: the player takes the blows but never goes down, so every run is a full fight.
    debug: { enabled: false, god: true },
    input: { getMoveVector: () => ({ x: 0, y: 0 }), getLabel: () => 'J' },
    physics: {
      createStaticBox: () => ({ groups: 0, setCollisionGroups() {} }),
      world: { removeCollider() {} },
      createDynamicBox() {
        const b = {
          lin: { x: 0, y: 0, z: 0 },
          setLinvel(v: { x: number; y: number; z: number }) {
            b.lin = { x: v.x, y: v.y, z: v.z };
          },
          setAngvel() {}, setTranslation() {}, setRotation() {},
        };
        bodies.push(b);
        return b;
      },
      removeBody() {},
      raycast: () => null,
    },
    world: {
      getLocation: () => ({ position: ALLEY.clone(), yaw: 0 }),
      getSpawnPoints(center: Vector3, minR: number, maxR: number, n: number) {
        const r = (minR + maxR) / 2;
        return Array.from({ length: n }, (_, i) => new Vector3(center.x + r * Math.sin(i * 2.1), 0, center.z + r * Math.cos(i * 2.1)));
      },
      getTerritories: () => [],
      getPropSpawns: () => [],
    },
    interactions: { register() {}, unregister() {} },
    entities: {
      player,
      spawnCharacter(def: CharacterSpawnDef) {
        const c = makeCharacter(def, def.id ?? `anon_${chars.size}`);
        chars.set(c.id, c);
        return c;
      },
      despawn: (id: string) => chars.delete(id),
      getCharacter: (id: string) => (id === 'player' ? player : chars.get(id) ?? null),
    },
    ui: { toast: (text: string) => toasts.push(text), showBossBar() {}, hideBossBar() {}, showSubtitle() {} },
    audio: { playSfx() {} },
    cameraRig: { shake() {}, punch() {}, setLockTarget() {}, getYaw: () => 0, playSequence: () => Promise.resolve(), stopSequence() {} },
    inventory: { addMoney() {} },
  };
  const combat = new CombatSystem(ctx as unknown as GameContext);
  combat.init();
  const hub = combat as unknown as CombatHub;
  const tables = new DaiPaiDongTables(hub);

  function step(playerBrain?: () => void): void {
    engine.restoreIn -= DT;
    if (engine.restoreIn <= 0) engine.setTimeScale(1);
    const time: GameTime = { dt: DT * engine.timeScale, realDt: DT, elapsed: 0, realElapsed: 0, frame: 0 };
    if (player.isAlive()) playerBrain?.();
    for (const c of chars.values()) {
      if (c.isAlive() && c.brain && combat.canMove(c as unknown as ICharacter)) c.brain.update(time);
    }
    for (const c of [player, ...chars.values()]) c.position.addScaledVector(c.desiredVelocity, time.dt);
    combat.update(time);
    tables.update(time.dt);
  }

  /** Step up to `sec` seconds; true as soon as `until` holds. */
  function run(sec: number, until: () => boolean, playerBrain?: () => void): boolean {
    for (let i = 0; i < sec * 60; i++) {
      step(playerBrain);
      if (until()) return true;
    }
    return false;
  }

  return { combat, hub, tables, bodies, log, player, toasts, run };
}

/** sogo_boss started, with 烏鴉 on BossBrain. */
function bossFight() {
  const h = harness();
  const [boss] = h.combat.prepareEncounter('sogo_boss');
  h.combat.startEncounter('sogo_boss');
  boss.brain?.dispose?.();
  const brain = new BossBrain(h.hub, boss);
  boss.brain = brain;
  const hitsOnPlayer = (): number =>
    h.log.filter((e) => e.type === 'combat:hit' && e.payload.attackerId === boss.id && e.payload.targetId === 'player').length;
  return { ...h, boss, brain, f: fighterOf(boss), fake: boss as unknown as FakeCharacter, hitsOnPlayer };
}

describe('烏鴉 headless', () => {
  it('boxes a masher: lands strings, blocks, and counters a blocked hit', () => {
    const h = bossFight();
    const p = h.player as unknown as ICharacter;
    let frame = 0;
    const mash = (): void => {
      frame++;
      const d = h.boss.position.distanceTo(h.player.position);
      const walk = d > 1.3 ? h.boss.position.clone().sub(h.player.position).setY(0).setLength(3.2) : new Vector3();
      if (h.combat.canMove(p)) h.player.setDesiredVelocity(walk);
      if (d < 1.8 && frame % 6 === 0) h.combat.requestAction(p, 'light');
    };
    const blocked = (): boolean => h.log.some((e) => e.type === 'combat:hit' && e.payload.targetId === h.boss.id && e.payload.blocked);
    let countered = false;
    const done = h.run(60, () => {
      countered ||= h.f.move?.id === 'b_counter';
      return countered && blocked() && h.hitsOnPlayer() >= 3;
    }, mash);
    expect(done).toBe(true);
    expect(h.boss.isAlive()).toBe(true);
  });

  it('roars when BossPhases moves him to phase 2, then heaves one of the encounter\'s tables at the player', () => {
    const h = bossFight();
    // EncounterDirector.start set the tables out round the arena centre (ALLEY in this harness).
    const tableBodies = h.bodies.slice(-4);
    expect(tableBodies).toHaveLength(4);
    expect(h.tables.nearest(ALLEY, 7)).toBeGreaterThanOrEqual(0);
    // The fake has no arena ring to stop the knockdowns, so the player walks back to the middle
    // himself; left alone he gets bowled 15 m away and no table is ever in 烏鴉's walking range.
    const p = h.player as unknown as ICharacter;
    const holdCentre = (): void => {
      if (!h.combat.canMove(p)) return;
      const back = ALLEY.clone().sub(h.player.position).setY(0);
      h.player.setDesiredVelocity(back.length() > 2 ? back.setLength(3.2) : new Vector3());
    };
    h.f.phase = 2;
    h.f.armored = true;
    let heaved = false;
    const done = h.run(30, () => {
      heaved ||= h.f.move?.id === 'b_tableFlip';
      return heaved && tableBodies.some((b) => b.lin.y > 0);
    }, holdCentre);
    expect(done).toBe(true);
    expect(h.fake.anims).toContain('boss_roar');
    // Announcing phases is BossPhases' job, never the brain's.
    expect(h.log.some((e) => e.type === 'boss:phase' && e.payload.phase === 2)).toBe(false);
  });

  it('grabs a player who turtles in phase 3', () => {
    const h = bossFight();
    h.tables.dispose();
    h.f.phase = 3;
    h.f.armored = true;
    h.hub.motor.guardStart(fighterOf(h.player as unknown as ICharacter));
    expect(h.run(20, () => h.player.combatState === 'grabbed')).toBe(true);
    expect(h.f.grabbing).toBe(h.player);
    expect(h.fake.anims).toContain('boss_grabReach');
  });

  it("does nothing while BossPhases has him kneeling, then fights on after a missed finisher", () => {
    const h = bossFight();
    const { f, boss } = h;
    h.run(2, () => false);
    f.phase = 3;
    boss.hp = 90;
    h.hub.boss.afterHit(f);
    expect(f.kneeling).toBe(true);
    boss.setDesiredVelocity(new Vector3(0.5, 0, 0));
    h.brain.update(TICK);
    expect(boss.desiredVelocity.x).toBe(0.5);
    expect(boss.combatState).toBe('staggered');
    expect(h.hub.tokens.has(boss.id)).toBe(false);
    const before = h.hitsOnPlayer();
    h.run(3, () => false);
    expect(boss.combatState).toBe('staggered');
    expect(h.hitsOnPlayer()).toBe(before);
    h.hub.boss.recover(f);
    h.hub.motor.toIdle(f);
    expect(h.run(10, () => h.hitsOnPlayer() > before)).toBe(true);
    expect(h.toasts.filter((t) => t.includes('了結佢'))).toHaveLength(1);
  });
});
