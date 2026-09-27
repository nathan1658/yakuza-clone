/**
 * Headless run of a whole fight against fakes of the other modules: the
 * encounter flow, the AI, the player's combos, KO/victory/defeat ordering.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Group, Scene, Vector3, type Object3D } from 'three';
import { CG, interactionGroups } from '../core/types';
import type {
  AnimClipDef, CharacterSpawnDef, CombatState, EncounterId, GameContext, GameTime, ICharacter, IInteractable, PropSpawn,
} from '../core/types';
import { turnTowards, yawTo } from '../core/math';
import { isHittable } from './hitTest';
import { CombatSystem } from './CombatSystem';
import { MOVES } from './moves';
import { fighterOf } from './Fighter';

type Payload = Record<string, unknown>;
type Handler = (p: Payload) => void;

const DT = 1 / 60;
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

/** Real lengths and impact points of the attack clips (entities' library). */
const CLIPS: Record<string, readonly [number, number]> = {
  jab: [0.36, 0.42], cross: [0.42, 0.45], hook: [0.5, 0.48], uppercut: [0.6, 0.5], frontKick: [0.55, 0.45],
  roundhouse: [0.7, 0.5], spinKick: [0.85, 0.55], stomp: [0.6, 0.55], dropKick: [0.9, 0.45],
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
  // Enough of a body for held weapons to travel with their holder.
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
    playAnim() {},
    moveTo: () => Promise.resolve(),
    teleport(p: Vector3, yaw?: number) {
      this.position.copy(p);
      if (yaw !== undefined) this.facing = yaw;
    },
  };
}
type FakeCharacter = ReturnType<typeof makeCharacter>;

function harness(props: PropSpawn[] = []) {
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
  const player = makeCharacter({ name: '陳浩南', role: 'player', faction: 'hungHing', appearance: 'hero', position: ALLEY.clone().add(new Vector3(0, 0, 3)), maxHp: 200 } as unknown as CharacterSpawnDef, 'player');
  const colliders = new Set<{ groups: number }>();
  const bodies = new Set<object>();
  const interactables = new Map<string, IInteractable>();
  const money: number[] = [];
  const toasts: string[] = [];
  const qte = { pass: true, keys: [] as string[][] };
  const sequences: unknown[][] = [];
  const ctx = {
    events, state, engine,
    debug: { enabled: false, god: false },
    input: { getMoveVector: () => ({ x: 0, y: 0 }), getLabel: () => 'J' },
    physics: {
      createStaticBox() {
        const c = { groups: 0, setCollisionGroups(g: number) { c.groups = g; } };
        colliders.add(c);
        return c;
      },
      world: { removeCollider: (c: { groups: number }) => colliders.delete(c) },
      createDynamicBox() {
        const b = { setLinvel() {}, setAngvel() {} };
        bodies.add(b);
        return b;
      },
      removeBody: (b: object) => bodies.delete(b),
      raycast: () => null,
    },
    world: {
      getLocation: () => ({ position: ALLEY.clone(), yaw: Math.PI / 2 }),
      getSpawnPoints(center: Vector3, minR: number, maxR: number, n: number) {
        const r = (minR + maxR) / 2;
        return Array.from({ length: n }, (_, i) => new Vector3(center.x + r * Math.sin(i * 2.1), 0, center.z + r * Math.cos(i * 2.1)));
      },
      getTerritories: () => [],
      getPropSpawns: () => props,
    },
    interactions: {
      register: (i: IInteractable) => interactables.set(i.id, i),
      unregister: (id: string) => interactables.delete(id),
    },
    entities: {
      player,
      spawnCharacter(def: CharacterSpawnDef) {
        const c = makeCharacter(def, def.id ?? `anon_${chars.size}`);
        chars.set(c.id, c);
        return c;
      },
      despawn: (id: string) => chars.delete(id),
      queryRadius: () => [],
      getCharacter: (id: string) => (id === 'player' ? player : chars.get(id) ?? null),
    },
    ui: {
      toast: (text: string) => toasts.push(text), showBossBar() {}, hideBossBar() {}, showSubtitle() {},
      showHeatActionName() {},
      runQTE(keys: string[]) {
        qte.keys.push(keys);
        return Promise.resolve(qte.pass);
      },
    },
    audio: { playSfx() {} },
    cameraRig: { shake() {}, punch() {}, setLockTarget() {}, getYaw: () => 0, playSequence: (s: unknown[]) => sequences.push(s) && Promise.resolve(), stopSequence() {} },
    inventory: { addMoney: (n: number) => money.push(n) },
  };
  const combat = new CombatSystem(ctx as unknown as GameContext);
  combat.init();

  let frame = 0;
  function step(playerBrain?: () => void): void {
    engine.restoreIn -= DT;
    if (engine.restoreIn <= 0) engine.setTimeScale(1);
    const time: GameTime = { dt: DT * engine.timeScale, realDt: DT, elapsed: 0, realElapsed: 0, frame: 0 };
    if (player.isAlive()) playerBrain?.();
    frame++;
    for (const c of chars.values()) {
      if (c.isAlive() && c.brain && combat.canMove(c as unknown as ICharacter)) c.brain.update(time);
    }
    for (const c of [player, ...chars.values()]) c.position.addScaledVector(c.desiredVelocity, time.dt);
    combat.update(time);
  }

  /** A button-masher: walk up to the nearest thug and hammer J ten times a second. */
  function brawl(): void {
    let best: ICharacter | null = null;
    let bestD = Infinity;
    for (const e of combat.getActiveEnemies()) {
      // Like a person would: go for whoever is standing, finish off the rest after.
      const d = e.position.distanceTo(player.position) + (isHittable(e.combatState, true) ? 0 : 5);
      if (d < bestD) [best, bestD] = [e, d];
    }
    const p = player as unknown as ICharacter;
    if (!best) return;
    if (combat.canMove(p)) {
      const walk = bestD > 1.3 ? best.position.clone().sub(player.position).setY(0).setLength(3.2) : new Vector3();
      player.setDesiredVelocity(walk);
    }
    if (bestD < 1.8 && frame % 6 === 0) combat.requestAction(p, 'light');
  }

  /** The lead's play-test bot: lock on, walk up, J J J J K on repeat; never dodges or guards. */
  let presses = 0;
  function mash(): void {
    const p = player as unknown as ICharacter;
    if (!combat.lockTarget) combat.toggleLockOn();
    const t = combat.lockTarget;
    if (!t) return;
    const d = Math.hypot(t.position.x - player.position.x, t.position.z - player.position.z);
    if (combat.canMove(p)) {
      player.setDesiredVelocity(d > 1.3 ? t.position.clone().sub(player.position).setY(0).setLength(3.2) : new Vector3());
    }
    if (d < 1.8 && frame % 6 === 0 && combat.requestAction(p, presses % 5 === 4 ? 'heavy' : 'light')) presses++;
  }

  /** Reads the tells: holds off while a thug close by swings, dodges into the strike, strings J J K. */
  let strings = 0;
  function skilled(): void {
    const p = player as unknown as ICharacter;
    let busy = false;
    for (const e of combat.getActiveEnemies()) {
      const f = fighterOf(e);
      if (e.combatState !== 'attacking' || e.position.distanceTo(player.position) > 2.8) continue;
      busy = true;
      const until = f.hitIndex < f.hitTimes.length ? (f.hitTimes[f.hitIndex] - f.norm) * f.curDur : Infinity;
      if (until > 0.03 && until < 0.2 && combat.requestAction(p, 'dodge')) strings = 0;
    }
    if (busy) return;
    if (!combat.lockTarget) combat.toggleLockOn();
    const t = combat.lockTarget;
    if (!t) return;
    const d = Math.hypot(t.position.x - player.position.x, t.position.z - player.position.z);
    if (combat.canMove(p)) {
      player.setDesiredVelocity(d > 1.3 ? t.position.clone().sub(player.position).setY(0).setLength(3.2) : new Vector3());
    }
    if (d < 1.8 && frame % 6 === 0 && combat.requestAction(p, strings % 3 === 2 ? 'heavy' : 'light')) strings++;
  }

  return {
    ctx, combat, log, state, engine, chars, player, colliders, bodies, interactables, money, toasts, qte, sequences, step, brawl, mash, skilled,
  };
}

const count = (log: { type: string }[], type: string): number => log.filter((e) => e.type === type).length;
const indexOf = (log: { type: string; payload: Payload }[], type: string, pred: (p: Payload) => boolean = () => true): number =>
  log.findIndex((e) => e.type === type && pred(e.payload));

describe('prologue_alley end to end', () => {
  it('spawns, fights, pays out and cleans up in the agreed order', async () => {
    const h = harness();
    const enemies = h.combat.prepareEncounter('prologue_alley');
    expect(enemies.map((e) => e.displayName)).toEqual(['東星打仔', '東星打仔', '東星打仔']);
    expect(enemies.map((e) => e.maxHp)).toEqual([60, 70, 60]);
    expect(enemies.every((e) => /^enemy_\d+$/.test(e.id))).toBe(true);
    expect(h.combat.inCombat).toBe(false);

    const done = h.combat.waitForEncounter('prologue_alley');
    h.combat.startEncounter('prologue_alley');
    expect(h.state.mode).toBe('combat');
    expect(h.combat.inCombat).toBe(true);
    expect(h.colliders.size).toBe(20);
    for (const c of h.colliders) expect(c.groups).toBe(interactionGroups(CG.ARENA, CG.CHARACTER));
    expect(h.log.find((e) => e.type === 'combat:start')?.payload).toMatchObject({ encounterId: 'prologue_alley', isBoss: false });

    // Stand still: the thugs close in and take turns.
    for (let i = 0; i < 6 * 60; i++) h.step();
    expect(h.player.hp).toBeLessThan(200);
    expect(indexOf(h.log, 'combat:hit', (p) => p.targetId === 'player')).toBeGreaterThanOrEqual(0);

    for (let i = 0; i < 90 * 60 && h.state.mode === 'combat'; i++) h.step(h.brawl);
    expect(h.state.mode).toBe('freeRoam');
    expect(h.player.hp).toBeGreaterThan(0);
    expect(count(h.log, 'combat:ko')).toBe(3);
    expect(h.log.filter((e) => e.type === 'combat:ko').every((e) => e.payload.byId === 'player')).toBe(true);

    const toFree = indexOf(h.log, 'state:changed', (p) => p.to === 'freeRoam');
    const end = indexOf(h.log, 'combat:end');
    expect(toFree).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(toFree);
    expect(h.log[end].payload).toEqual({ encounterId: 'prologue_alley', victory: true, moneyEarned: 300 });
    await expect(done).resolves.toEqual({ encounterId: 'prologue_alley', victory: true, moneyEarned: 300 });
    expect(h.money).toEqual([300]);
    expect(h.toasts).toContain('+HK$300');
    expect(h.colliders.size).toBe(0);
    expect(h.combat.inCombat).toBe(false);
    expect(h.engine.timeScale).toBe(1);

    // The bodies stay a while, then get cleared away.
    expect(h.chars.size).toBe(3);
    for (let i = 0; i < 9 * 60; i++) h.step();
    expect(h.chars.size).toBe(0);
  });
});

describe('losing', () => {
  it("sends 'player:died' once and tears the fight down on game over", async () => {
    const h = harness();
    h.player.hp = 5;
    const done = h.combat.waitForEncounter('prologue_alley');
    h.combat.startEncounter('prologue_alley');
    for (let i = 0; i < 30 * 60 && count(h.log, 'player:died') === 0; i++) h.step();
    for (let i = 0; i < 60; i++) h.step();
    expect(count(h.log, 'player:died')).toBe(1);
    expect(h.player.combatState).toBe('ko');

    h.state.transition('gameOver');
    expect(h.chars.size).toBe(0);
    expect(h.colliders.size).toBe(0);
    expect(h.engine.timeScale).toBe(1);
    await expect(done).resolves.toEqual({ encounterId: 'prologue_alley', victory: false, moneyEarned: 0 });
    expect(h.combat.inCombat).toBe(false);
  });

  it('never hurts the player in god mode', () => {
    const h = harness();
    h.ctx.debug.god = true;
    h.combat.startEncounter('prologue_alley');
    for (let i = 0; i < 8 * 60; i++) h.step();
    expect(h.player.hp).toBe(200);
    expect(indexOf(h.log, 'combat:hit', (p) => p.targetId === 'player')).toBeGreaterThanOrEqual(0);
  });
});


describe('pacing: the first fight is a warm-up', () => {
  // Coordinator's target: a passive player loses ~25-35% over 10 s; a player who fights back ends well above half.
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

  it('three goons standing around a passive player take turns, not chunks', () => {
    for (const seed of SEEDS) {
      Math.random = seeded(seed);
      const h = harness();
      h.combat.startEncounter('prologue_alley');
      for (let i = 0; i < 10 * 60; i++) h.step();
      const lost = (200 - h.player.hp) / 200;
      expect(lost).toBeGreaterThanOrEqual(0.2);
      expect(lost).toBeLessThanOrEqual(0.4);
    }
  });

  it('even a button-masher wins comfortably', () => {
    let total = 0;
    for (const seed of SEEDS) {
      Math.random = seeded(seed);
      const h = harness();
      h.combat.startEncounter('prologue_alley');
      for (let i = 0; i < 90 * 60 && h.state.mode === 'combat'; i++) h.step(h.brawl);
      expect(h.state.mode).toBe('freeRoam');
      total += h.player.hp;
    }
    // Mashing one button now gets shoved off every third flinch: still a win, not a free one.
    expect(total / SEEDS.length).toBeGreaterThan(0.5 * 200);
  });
});

describe('street weapons', () => {
  const chairAt = (): PropSpawn[] => [{ kind: 'folding_chair', position: ALLEY.clone().add(new Vector3(0, 0, 2.2)), yaw: 0, zone: 'causewayBay' } as unknown as PropSpawn];

  it('a chair on the floor can be picked up, swung until it breaks, and comes back later', () => {
    const h = harness(chairAt());
    const [chair] = h.combat.getWeapons();
    expect(chair.displayName).toBe('摺凳');
    const pickup = h.interactables.get(chair.id);
    expect(pickup?.label).toBe('拾起 摺凳');
    expect(h.bodies.size).toBe(1);

    h.combat.startEncounter('prologue_alley');
    expect(pickup?.isEnabled()).toBe(true);
    pickup?.interact();
    expect(h.player.heldWeapon).toBe(chair);
    expect(chair.holder).toBe(h.player);
    expect(h.bodies.size).toBe(0);
    expect(pickup?.isEnabled()).toBe(false);
    expect(indexOf(h.log, 'weapon:pickup', (p) => p.weaponId === chair.id)).toBeGreaterThanOrEqual(0);

    for (let i = 0; i < 60 * 60 && count(h.log, 'weapon:broken') === 0; i++) h.step(h.brawl);
    expect(count(h.log, 'weapon:broken')).toBe(1);
    expect(h.player.heldWeapon).toBeNull();
    const swings = h.log.filter((e) => e.type === 'combat:hit' && e.payload.attackerId === 'player' && e.payload.kind === 'weapon');
    expect(swings.length).toBeGreaterThanOrEqual(3);
    // A street weapon returns to its spot once the player is long gone.
    h.player.position.set(0, 0, 0);
    for (let i = 0; i < 125 * 10; i++) h.combat.update({ dt: 0.1, realDt: 0.1, elapsed: 0, realElapsed: 0, frame: 0 });
    expect(h.combat.getWeapons()).toContain(chair);
    expect(chair.durability).toBe(chair.maxDurability);
  });

  it('a thrown chair flies at the nearest thug and floors him', () => {
    const h = harness(chairAt());
    h.combat.startEncounter('prologue_alley');
    const [chair] = h.combat.getWeapons();
    h.interactables.get(chair.id)?.interact();
    for (let i = 0; i < 30; i++) h.step();
    const target = h.combat.getActiveEnemies()[0];
    h.player.facing = yawTo(h.player.position, target.position);
    expect(h.combat.requestAction(h.player as unknown as ICharacter, 'throwWeapon')).toBe(true);
    for (let i = 0; i < 90 && indexOf(h.log, 'combat:hit', (p) => p.kind === 'weapon') < 0; i++) h.step();
    const hit = h.log.find((e) => e.type === 'combat:hit' && e.payload.kind === 'weapon');
    expect(hit?.payload).toMatchObject({ attackerId: 'player', knockdown: true });
    expect(h.player.heldWeapon).toBeNull();
  });

  it('debt collectors turn up armed', () => {
    const h = harness();
    const thugs = h.combat.prepareEncounter('substory_debt');
    expect(thugs.map((e) => e.heldWeapon?.weaponKind).sort()).toEqual(['beer_bottle', 'wooden_stool']);
    expect(thugs.every((e) => e.displayName === '收數佬')).toBe(true);
  });
});

describe('heat actions', () => {
  type H = ReturnType<typeof harness>;
  const asChar = (c: unknown): ICharacter => c as ICharacter;
  const phases = (h: H): unknown[] => h.log.filter((e) => e.type === 'boss:phase').map((e) => e.payload.phase);
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  /** Square the player up to `e`, a step away. */
  function faceUp(h: H, e: ICharacter): void {
    h.player.position.copy(e.position).add(new Vector3(0, 0, -1.3));
    h.player.facing = yawTo(h.player.position, e.position);
  }

  /** A jab landing on 烏鴉 at `hp` (skips the slog down to each threshold). */
  function jabAt(h: H, boss: ICharacter, hp: number): boolean {
    boss.hp = hp;
    return h.combat.hits.applyHit(asChar(h.player), boss, MOVES.jab, 0, 1);
  }

  /** Beat 烏鴉 down to his knees and press F in front of him. */
  function toFinisher(h: H): ICharacter {
    h.combat.startEncounter('sogo_boss');
    const boss = asChar(h.chars.get('boss_crow'));
    for (const hp of [795, 398, 100]) jabAt(h, boss, hp);
    faceUp(h, boss);
    h.step();
    h.combat.requestAction(asChar(h.player), 'heat');
    for (let i = 0; i < 60 && h.qte.keys.length === 0; i++) h.step();
    return boss;
  }

  it('a full bar and F: 怒火連環拳 plays in the heatAction state, then the fight resumes', () => {
    const h = harness();
    h.combat.startEncounter('prologue_alley');
    const e = h.combat.getActiveEnemies().find((c) => c.maxHp === 70) as ICharacter;
    faceUp(h, e);
    h.combat.addHeat(100);
    h.step();
    expect(h.combat.heatActionAvailable?.nameZh).toBe('怒火連環拳');
    expect(h.combat.requestAction(asChar(h.player), 'heat')).toBe(true);
    expect(h.state.mode).toBe('heatAction');
    expect([h.player.combatState, e.combatState]).toEqual(['heatLocked', 'heatLocked']);
    expect(h.combat.heat).toBe(0);
    expect(h.sequences).toHaveLength(1);
    expect(h.log.find((x) => x.type === 'heat:action')?.payload).toMatchObject({ actionId: 'rage_rush', targetId: e.id });

    for (let i = 0; i < 5 * 60 && h.state.mode === 'heatAction'; i++) h.step();
    expect(h.state.mode).toBe('combat');
    expect(h.log.filter((x) => x.type === 'combat:hit' && x.payload.kind === 'heat')).toHaveLength(7);
    expect(e.hp).toBe(10);
    expect(e.combatState).toBe('downed');
    expect(h.player.combatState).toBe('idle');
    expect(h.engine.timeScale).toBe(1);
  });

  it('摺凳伺候 costs a bar and leaves the chair in pieces', () => {
    const h = harness();
    h.combat.startEncounter('prologue_alley');
    const e = h.combat.getActiveEnemies().find((c) => c.maxHp === 70) as ICharacter;
    h.combat.weapons.give(asChar(h.player), 'folding_chair');
    faceUp(h, e);
    h.combat.addHeat(50);
    h.step();
    expect(h.combat.heatActionAvailable?.nameZh).toBe('摺凳伺候');
    expect(h.combat.requestAction(asChar(h.player), 'heat')).toBe(true);
    expect(h.combat.heat).toBe(17);
    for (let i = 0; i < 5 * 60 && h.state.mode === 'heatAction'; i++) h.step();
    expect(h.state.mode).toBe('combat');
    expect(e.hp).toBe(70 - 45);
    expect(h.player.heldWeapon).toBeNull();
    expect(h.log.filter((x) => x.type === 'weapon:broken')).toHaveLength(1);
  });

  it('nothing on offer without heat or a victim in reach', () => {
    const h = harness();
    h.combat.startEncounter('prologue_alley');
    const e = h.combat.getActiveEnemies()[0];
    faceUp(h, e);
    h.step();
    expect(h.combat.heatActionAvailable).toBeNull();
    expect(h.combat.requestAction(asChar(h.player), 'heat')).toBe(false);
    h.combat.addHeat(100);
    h.player.position.set(e.position.x, 0, e.position.z - 4);
    h.step();
    expect(h.combat.requestAction(asChar(h.player), 'heat')).toBe(false);
    expect(h.state.mode).toBe('combat');
  });

  it('烏鴉 goes down on one knee at 8%, and the finisher prompt ends him', async () => {
    const h = harness();
    h.ctx.debug.god = true;
    const done = h.combat.waitForEncounter('sogo_boss');
    h.combat.startEncounter('sogo_boss');
    const boss = asChar(h.chars.get('boss_crow'));
    expect(phases(h)).toEqual([1]);
    for (const hp of [795, 398, 100]) expect(jabAt(h, boss, hp)).toBe(true);
    expect(phases(h)).toEqual([1, 2, 3]);
    expect(boss.combatState).toBe('staggered');
    expect(h.toasts).toContain('按 [J] 了結佢！');
    expect(jabAt(h, boss, boss.hp)).toBe(false);

    faceUp(h, boss);
    h.step();
    expect(h.combat.heatActionAvailable?.nameZh).toBe('極道・鴉殺');
    expect(h.combat.requestAction(asChar(h.player), 'heat')).toBe(true);
    for (let i = 0; i < 60 && h.qte.keys.length === 0; i++) h.step();
    expect(h.qte.keys).toHaveLength(1);
    expect(h.qte.keys[0].length).toBeGreaterThanOrEqual(3);
    expect(h.combat.requestAction(asChar(h.player), 'light')).toBe(false);

    await flush();
    for (let i = 0; i < 10 * 60 && h.state.mode !== 'freeRoam'; i++) h.step();
    expect(boss.hp).toBe(0);
    expect(boss.combatState).toBe('ko');
    await expect(done).resolves.toEqual({ encounterId: 'sogo_boss', victory: true, moneyEarned: 3000 });
  });

  it('missing the prompt: 烏鴉 gets a second wind and floors the player', async () => {
    const h = harness();
    h.qte.pass = false;
    const boss = toFinisher(h);
    expect(h.qte.keys).toHaveLength(1);
    await flush();
    for (let i = 0; i < 5 * 60 && h.state.mode === 'heatAction'; i++) h.step();
    expect(h.state.mode).toBe('combat');
    expect(boss.hp).toBe(94 + 120);
    expect(boss.combatState).toBe('idle');
    expect(h.player.hp).toBe(175);
    expect(h.player.combatState).toBe('downed');
    // Back under 8% he kneels again, and the finisher is back on.
    expect(jabAt(h, boss, 100)).toBe(true);
    expect(boss.combatState).toBe('staggered');
  });

  it('game over mid-prompt drops the performance cleanly', async () => {
    const h = harness();
    toFinisher(h);
    expect(h.state.mode).toBe('heatAction');
    h.state.transition('gameOver');
    await flush();
    expect(h.chars.size).toBe(0);
    expect(h.engine.timeScale).toBe(1);
    expect(h.combat.heatActions.running).toBe(false);
    expect(h.combat.heatActions.qtePending).toBe(false);
  });
});

describe('difficulty: mashing gets punished, reading the tells pays', () => {
  // Lead's live targets for the J J J J K masher: the first alley >= 75%, typhoon_ambush >= 40%,
  // sogo_goons 50-70%. Live runs landed within a few percent of this harness (76% / 52% vs 75% / 51%).
  const SEEDS = [1, 2, 3, 4, 5, 6];

  function fight(id: EncounterId, bot: 'mash' | 'skilled', seeds = SEEDS): number[] {
    const hp: number[] = [];
    for (const seed of seeds) {
      Math.random = seeded(seed);
      const h = harness();
      h.combat.startEncounter(id);
      for (let i = 0; i < 150 * 60 && h.state.mode === 'combat' && h.player.isAlive(); i++) h.step(h[bot]);
      hp.push(h.player.hp);
    }
    return hp;
  }
  const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

  it('the first alley: the masher still walks out with 70% or more', () => {
    expect(avg(fight('prologue_alley', 'mash'))).toBeGreaterThanOrEqual(140);
  });

  it('typhoon_ambush: 笑面虎 waits for his boys; the masher survives with 40%, the careful player far more', () => {
    // A long fight with wide swings between runs: twelve of them, and not one may end in a KO.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const mashed = fight('typhoon_ambush', 'mash', seeds);
    expect(Math.min(...mashed)).toBeGreaterThan(0);
    expect(avg(mashed)).toBeGreaterThanOrEqual(80);
    expect(avg(fight('typhoon_ambush', 'skilled', seeds))).toBeGreaterThanOrEqual(avg(mashed) + 40);
  });

  it('sogo_goons costs the masher 35-60% of the bar; dodging the tells saves most of it', () => {
    const mashed = avg(fight('sogo_goons', 'mash'));
    expect(mashed).toBeGreaterThanOrEqual(80);
    expect(mashed).toBeLessThanOrEqual(130);
    expect(avg(fight('sogo_goons', 'skilled'))).toBeGreaterThanOrEqual(mashed + 40);
  });
});

describe('heat camera', () => {
  const asChar = (c: unknown): ICharacter => c as ICharacter;
  type Shot = { position: Vector3; lookAt: () => Vector3 };

  function rush(wall: (o: Vector3, d: Vector3, max: number) => number | null) {
    const h = harness();
    h.combat.startEncounter('prologue_alley');
    const e = h.combat.getActiveEnemies().find((c) => c.maxHp === 70) as ICharacter;
    // Square up facing +Z: the action's right is then -X.
    h.player.position.copy(e.position).add(new Vector3(0, 0, -1.3));
    h.player.facing = 0;
    (h.ctx.physics as { raycast: unknown }).raycast = (o: Vector3, d: Vector3, max: number) => {
      const dist = wall(o, d, max);
      return dist === null ? null : { distance: dist, point: new Vector3(), normal: new Vector3(), collider: null };
    };
    h.combat.addHeat(100);
    h.step();
    expect(h.combat.requestAction(asChar(h.player), 'heat')).toBe(true);
    return { h, e, shots: h.sequences[0] as Shot[] };
  }

  it('a wall on one side: the whole action is filmed from the other', () => {
    let wallX = 0;
    const { h, shots } = rush((o, d, max) => {
      const end = o.x + d.x * max;
      return end < wallX ? (wallX - o.x) / d.x : null;
    });
    wallX = h.player.position.x - 1;
    expect(shots.length).toBeGreaterThan(0);
    for (const s of shots) expect(s.position.x).toBeGreaterThan(wallX);
  });

  it('walls on both sides: the camera pulls in to the clear part of the line', () => {
    const { h, e, shots } = rush(() => 1);
    const mid = h.player.position.clone().add(e.position).multiplyScalar(0.5).setY(1);
    for (const s of shots) expect(s.position.distanceTo(mid)).toBeLessThan(1.5);
  });

  it('the gaze rides along with the pair', () => {
    const { e, shots } = rush(() => null);
    const before = shots[0].lookAt().clone();
    e.position.x += 2;
    expect(shots[0].lookAt().x).toBeCloseTo(before.x + 1);
  });
});
