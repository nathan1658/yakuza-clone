/**
 * Plays the story headlessly through the public Narrative facade against a
 * fake GameContext: the real transition table, instant UI answers (first
 * enabled choice), and a combat stub the test wins or loses on demand.
 */
import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type {
  CharacterSpawnDef, DialogueLineView, EncounterId, GameContext, GameTime, HotspotDef, ICharacter,
  IInteractable, ISaveable,
} from '../core/types';
import { Narrative } from './Narrative';

type Payload = Record<string, unknown> | undefined;

/** Node's macrotask hook (tests run in the node environment; the project has no node typings). */
declare const setImmediate: (callback: () => void) => void;

class Bus {
  readonly log: Array<[string, Payload]> = [];
  private readonly handlers = new Map<string, Set<(p: Payload) => void>>();

  on(type: string, h: (p: Payload) => void): () => void {
    const set = this.handlers.get(type) ?? new Set();
    this.handlers.set(type, set.add(h));
    return () => void set.delete(h);
  }

  once(type: string, h: (p: Payload) => void): () => void {
    const off = this.on(type, (p) => {
      off();
      h(p);
    });
    return off;
  }

  emit(type: string, p?: Payload): void {
    this.log.push([type, p]);
    for (const h of [...(this.handlers.get(type) ?? [])]) h(p);
  }

  payloads(type: string): Payload[] {
    return this.log.filter(([t]) => t === type).map(([, p]) => p);
  }
}

const ALLOWED: Record<string, string[]> = {
  boot: ['title', 'freeRoam', 'cutscene'],
  title: ['cutscene', 'freeRoam', 'dialogue'],
  freeRoam: ['dialogue', 'combat', 'cutscene', 'menu', 'shop'],
  dialogue: ['freeRoam', 'combat', 'cutscene', 'shop', 'dialogue'],
  cutscene: ['freeRoam', 'combat', 'dialogue', 'credits', 'cutscene'],
  combat: ['heatAction', 'freeRoam', 'gameOver', 'cutscene', 'dialogue', 'menu'],
  heatAction: ['combat', 'freeRoam', 'cutscene', 'gameOver'],
  menu: ['freeRoam', 'combat', 'title'],
  shop: ['freeRoam', 'dialogue'],
  gameOver: ['title', 'freeRoam', 'cutscene'],
  credits: ['title', 'freeRoam'],
};

class Fsm {
  mode = 'boot';
  previous = 'boot';
  readonly illegal: string[] = [];

  constructor(private readonly bus: Bus) {}

  is(...modes: string[]): boolean {
    return modes.includes(this.mode);
  }

  can(to: string): boolean {
    return ALLOWED[this.mode].includes(to);
  }

  transition(to: string, payload?: Payload): boolean {
    if (!this.can(to)) {
      this.illegal.push(`${this.mode}->${to}`);
      return false;
    }
    const from = this.mode;
    this.previous = from;
    this.mode = to;
    this.bus.emit('state:changed', { from, to, payload });
    return true;
  }

  back(): boolean {
    return this.transition(this.previous);
  }
}

const LOCS: Record<string, [number, number, number]> = {
  player_start: [-63, -6, Math.PI], percy_curry_fishball: [-57.2, -24, -Math.PI / 2],
  percy_cha_chaan_teng: [-71.1, -37, Math.PI / 2], percy_payphone: [-58, -46, Math.PI / 2],
  percy_informant: [-58.5, -18, -0.4], percy_alley: [-83, -58, Math.PI / 2], percy_north: [-64, -108, Math.PI],
  hennessy_center: [-10, 2.4, Math.PI / 2], hennessy_newsstand: [-27.8, 1.4, 0], hennessy_payphone: [20, 21.9, 0],
  sogo_crossing: [82, 12, 0], sogo_plaza: [85, 33, Math.PI], sogo_plaza_entry: [85, 22.5, 0],
  sogo_payphone: [56, 21.9, 0], sogo_dai_pai_dong: [68, 42, Math.PI / 2], typhoon_entry: [-63, -152, Math.PI],
  typhoon_promenade: [-45, -163, Math.PI], typhoon_pier: [-31, -188, -Math.PI / 2],
  typhoon_payphone: [-80, -152.1, 0], typhoon_crab_boat: [20, -191.3, 0], substory_pager: [-40, 22.6, 0],
  substory_debt: [-118, 20.4, 0],
};

function loc(id: string): { position: Vector3; yaw: number } {
  const l = LOCS[id];
  if (!l) throw new Error(`unknown location ${id}`);
  return { position: new Vector3(l[0], 0, l[1]), yaw: l[2] };
}

function hotspot(id: string, kind: HotspotDef['kind'], x: number, z: number, shopId?: string): HotspotDef {
  return { id, kind, position: new Vector3(x, 0, z), radius: 1.6, label: '', shopId } as HotspotDef;
}

const HOTSPOTS = [
  hotspot('hs_curry_fishball', 'vendor', -60, -24, 'shop_curry_fishball'),
  hotspot('hs_crab_boat', 'vendor', 20, -187.8, 'shop_crab_boat'),
  hotspot('hs_payphone_percy', 'payphone', -57.7, -46),
  hotspot('hs_lost_pager', 'pickup', -40, 22.6),
];

const ENEMIES: Record<EncounterId, Array<[string, string]>> = {
  prologue_alley: [['goon_a', '東星打仔'], ['goon_b', '東星打仔'], ['goon_c', '東星打仔']],
  typhoon_ambush: [['tiger', '笑面虎'], ['goon_d', '東星打仔']],
  sogo_goons: [['goon_e', '東星打仔'], ['goon_f', '東星打仔']],
  sogo_boss: [['boss_crow', '烏鴉']],
  substory_debt: [['collector_a', '收數佬'], ['collector_b', '收數佬']],
  random_street: [],
};

type FakeChar = ICharacter & { ko(): void };

function makeGame(debug: { chapter?: number; skipIntro?: boolean } = {}) {
  const bus = new Bus();
  const state = new Fsm(bus);
  const scene = new Object3D();
  const chars = new Map<string, FakeChar>();
  const interactables = new Map<string, IInteractable>();
  const saveables = new Map<string, ISaveable>();
  const toasts: string[] = [];
  const lines: DialogueLineView[] = [];
  const sfx: string[] = [];
  const titles: string[] = [];
  const saves: string[] = [];
  const items = new Map<string, number>();
  let money = 500;
  let stored: string | null = null;

  function makeChar(id: string, name: string, role: string): FakeChar {
    const object3d = new Object3D();
    scene.add(object3d);
    let alive = true;
    const c = {
      id, kind: 'character', role, faction: 'neutral', displayName: name, object3d, position: object3d.position,
      facing: 0, brain: null, idleClip: 'idle', combatState: 'idle', hp: 100, maxHp: 100,
      rig: { getClipDef: (clip: string) => ({ loop: clip === 'idle' }) },
      isAlive: () => alive,
      ko: () => void (alive = false),
      getForward: (out = new Vector3()) => out.set(Math.sin(c.facing), 0, Math.cos(c.facing)),
      faceTowards: (p: Vector3) => void (c.facing = Math.atan2(p.x - c.position.x, p.z - c.position.z)),
      teleport: (p: Vector3, yaw?: number) => {
        c.position.copy(p);
        if (yaw !== undefined) c.facing = yaw;
      },
      moveTo: async (p: Vector3) => void c.position.copy(p),
      playAnim: () => undefined,
      setVisible: () => undefined,
    };
    const fake = c as unknown as FakeChar;
    chars.set(id, fake);
    return fake;
  }

  const player = makeChar('player', '浩南', 'player');
  const entities = {
    player, playerInputEnabled: true, density: 1,
    spawnCharacter: (def: CharacterSpawnDef) => {
      const c = makeChar(def.id ?? `char_${chars.size}`, def.name, def.role);
      c.teleport(def.position, def.yaw);
      return c;
    },
    despawn: (id: string) => {
      const c = chars.get(id);
      if (c) scene.remove(c.object3d);
      chars.delete(id);
    },
    getCharacter: (id: string) => chars.get(id) ?? null,
    getCharacters: (f: { role?: string; alive?: boolean } = {}) =>
      [...chars.values()].filter((c) => (!f.role || c.role === f.role) && (f.alive === undefined || c.isAlive() === f.alive)),
    setPedestrianDensity: (d: number) => void (entities.density = d),
  };

  const combat = {
    started: [] as string[],
    randomEnabled: false,
    autoWin: false,
    active: null as EncounterId | null,
    resolve: null as ((r: { encounterId: EncounterId; victory: boolean; moneyEarned: number }) => void) | null,
    prepareEncounter: (id: EncounterId) =>
      ENEMIES[id].map(([cid, name], i) =>
        chars.get(cid) ?? entities.spawnCharacter({
          id: cid, name, role: 'enemy', faction: 'tungStar', appearance: 'goon',
          position: player.position.clone().add(new Vector3(i * 1.5, 0, 6)),
        } as unknown as CharacterSpawnDef)),
    startEncounter: (id: EncounterId) => {
      combat.prepareEncounter(id);
      combat.active = id;
      combat.started.push(id);
      state.transition('combat');
      bus.emit('combat:start', { encounterId: id, enemyIds: [], isBoss: id === 'sogo_boss' });
    },
    waitForEncounter: (id: EncounterId) =>
      new Promise((resolve: (r: { encounterId: EncounterId; victory: boolean; moneyEarned: number }) => void) => {
        expect(combat.active).toBe(id);
        combat.resolve = resolve;
        if (combat.autoWin) setImmediate(() => combat.finish(true));
      }),
    finish: (victory: boolean) => {
      const id = combat.active;
      if (!id || !combat.resolve) throw new Error('no fight to finish');
      for (const [cid] of ENEMIES[id]) {
        if (cid === 'boss_crow') chars.get(cid)?.ko();
        else if (victory) entities.despawn(cid);
      }
      state.transition(victory ? 'freeRoam' : 'gameOver');
      const result = { encounterId: id, victory, moneyEarned: 0 };
      bus.emit('combat:end', result);
      combat.active = null;
      combat.resolve(result);
    },
    setRandomEncountersEnabled: (on: boolean) => void (combat.randomEnabled = on),
  };

  const save = {
    register: (s: ISaveable) => void saveables.set(s.saveKey, s),
    save: (meta: { chapterZh: string; locationZh: string }) => {
      const data: Record<string, unknown> = {};
      for (const [k, s] of saveables) data[k] = s.serialize();
      stored = JSON.stringify(data);
      saves.push(`${meta.chapterZh}/${meta.locationZh}`);
      bus.emit('save:done', { meta });
    },
    load: () => {
      if (!stored) return false;
      const data = JSON.parse(stored) as Record<string, unknown>;
      for (const [k, s] of saveables) s.deserialize(data[k]);
      return true;
    },
    resetAll: () => saveables.forEach((s) => s.reset()),
  };

  const done = Promise.resolve();
  const ctx = {
    debug: { enabled: true, chapter: debug.chapter ?? null, skipIntro: debug.skipIntro ?? false, god: false },
    engine: { scene },
    events: bus,
    input: { getLabel: (a: string) => a.toUpperCase() },
    state,
    cameraRig: {
      setDialogueFraming: () => undefined, playSequence: () => done, stopSequence: () => undefined,
      snapBehindTarget: () => undefined, shake: () => undefined,
    },
    interactions: { register: (i: IInteractable) => void interactables.set(i.id, i) },
    audio: { playSfx: (id: string) => void sfx.push(id), playMusic: () => undefined },
    world: {
      currentZone: 'percy', weather: 'rain',
      getLocation: loc, getHotspots: () => HOTSPOTS, isWalkable: () => true, getZoneAt: () => 'percy',
      setWeather: (k: string) => void (ctx.world.weather = k),
    },
    entities,
    combat,
    inventory: {
      get money() {
        return money;
      },
      count: (id: string) => items.get(id) ?? 0,
      addItem: (id: string, n = 1) => void items.set(id, (items.get(id) ?? 0) + n),
      removeItem: (id: string, n = 1) => {
        if ((items.get(id) ?? 0) < n) return false;
        items.set(id, (items.get(id) ?? 0) - n);
        return true;
      },
      addMoney: (n: number) => void (money += n),
      spendMoney: (n: number) => {
        if (money < n) return false;
        money -= n;
        return true;
      },
      getShop: (id: string) => ({ id, nameZh: id }),
      getItemDef: (id: string) => ({ id, nameZh: id }),
    },
    ui: {
      presentLine: (view: DialogueLineView) => {
        lines.push(view);
        const pick = view.choices ? view.choices.findIndex((c) => !c.disabled) : 0;
        return Promise.resolve(pick);
      },
      hideDialogue: () => undefined,
      showSubtitle: (text: string) => void lines.push({ speaker: '', text }),
      toast: (text: string) => void toasts.push(text),
      showChapterTitle: (chapter: string) => {
        titles.push(chapter);
        return done;
      },
      showCredits: () => done,
      openShop: () => done,
      setLetterbox: () => undefined,
      setHudVisible: () => undefined,
      fade: () => done,
    },
    save,
  };

  const narrative = new Narrative(ctx as unknown as GameContext);
  Object.assign(ctx, { narrative });
  narrative.init();

  const time: GameTime = { dt: 0.25, realDt: 0.25, elapsed: 0, realElapsed: 0, frame: 0 };
  const step = async (): Promise<void> => {
    time.frame += 1;
    time.realElapsed += time.realDt;
    narrative.update(time);
    await new Promise<void>((r) => setImmediate(r));
  };

  return {
    ctx, bus, state, narrative, player, combat, toasts, lines, sfx, titles, saves, items, entities,
    beat: () => (saveables.get('narrative')?.serialize() as { beat: string }).beat,
    pendingFight: () => (saveables.get('narrative')?.serialize() as { pendingFight: string | null }).pendingFight,
    interactable: (id: string) => {
      const i = interactables.get(id);
      if (!i) throw new Error(`no interactable ${id}`);
      return i;
    },
    goTo: (at: string) => player.teleport(loc(at).position),
    stored: () => stored,
    restore: (data: string | null) => void (stored = data),
    async until(pred: () => boolean, maxSteps = 4000): Promise<void> {
      for (let i = 0; i < maxSteps; i++) {
        if (pred()) return;
        await step();
      }
      const recent = bus.log.slice(-8).map(([t, p]) => `${t} ${JSON.stringify(p ?? {})}`).join('\n');
      throw new Error(`timed out in state ${state.mode}, beat ${this.beat()}; last events:\n${recent}`);
    },
    async advance(sec: number): Promise<void> {
      for (let t = 0; t < sec; t += time.realDt) await step();
    },
  };
}

type Game = ReturnType<typeof makeGame>;

const quest = (g: Game, id: string) => g.narrative.getQuests().find((q) => q.id === id)?.status;

async function talkTo(g: Game, npc: string): Promise<void> {
  const talk = g.interactable(`talk_${npc}`);
  expect(talk.isEnabled()).toBe(true);
  const ended = g.bus.payloads('dialogue:end').length;
  talk.interact();
  await g.until(() => g.state.is('freeRoam') && g.bus.payloads('dialogue:end').length > ended);
}

/** New game straight into free roam, 山雞 talked to, standing in the 後巷 fight. */
async function toAlleyFight(g: Game): Promise<void> {
  await g.narrative.startNewGame();
  await talkTo(g, 'npc_chicken');
  await g.until(() => g.beat() === 'ch1_alley');
  g.goTo('percy_alley');
  await g.until(() => g.combat.active === 'prologue_alley');
}

describe('Narrative (headless playthrough)', () => {
  it('starts a new game in free roam with 山雞 marked', async () => {
    const g = makeGame({ skipIntro: true });
    await g.narrative.startNewGame();
    expect(g.state.mode).toBe('freeRoam');
    expect(g.narrative.getTrackedObjective()?.objectiveZh).toBeTruthy();
    const main = g.narrative.getActiveMarkers().find((m) => m.kind === 'main');
    expect(main?.position).toBe(g.entities.getCharacter('npc_chicken')?.position);
    expect(g.narrative.getActiveMarkers()).toBe(g.narrative.getActiveMarkers());
  });

  it('plays the intro cutscene with the chapter card', async () => {
    const g = makeGame();
    void g.narrative.startNewGame();
    await g.until(() => g.bus.payloads('cutscene:end').length === 1);
    expect(g.titles).toContain('第一章');
    expect(g.state.mode).toBe('freeRoam');
  });

  it('plays chapter 1 end to end: talk, autosave, fight, tutorial, chapter 2', async () => {
    const g = makeGame({ skipIntro: true });
    await toAlleyFight(g);
    expect(g.pendingFight()).toBe('prologue_alley');
    expect(g.toasts).toContain('自動儲存');
    await g.advance(20);
    expect(g.toasts.some((t) => t.includes('輕擊'))).toBe(true);
    g.bus.emit('heat:changed', { heat: 40, maxHeat: 100 });
    expect(g.toasts.some((t) => t.includes('極道必殺技'))).toBe(true);
    g.combat.finish(true);
    await g.until(() => g.beat() === 'ch2_go_typhoon' && g.state.is('freeRoam') && g.combat.randomEnabled);
    expect(quest(g, 'main_ch1')).toBe('completed');
    expect(quest(g, 'main_ch2')).toBe('active');
    expect(quest(g, 'sub_debt')).toBe('available');
    expect(g.bus.payloads('chapter:start')).toEqual([{ chapter: 2, titleZh: expect.any(String) }]);
    expect(g.narrative.getFlag('ch1_done')).toBe(true);
    expect(g.pendingFight()).toBeNull();
    expect(g.state.illegal).toEqual([]);
  });

  it('retries a lost fight from its autosave without replaying the cutscene', async () => {
    const g = makeGame({ skipIntro: true });
    await toAlleyFight(g);
    g.combat.finish(false);
    await g.advance(1);
    expect(g.ctx.save.load()).toBe(true);
    void g.narrative.continueGame();
    await g.until(() => g.combat.active === 'prologue_alley');
    expect(g.combat.started).toEqual(['prologue_alley', 'prologue_alley']);
    const alleyScenes = g.bus.payloads('cutscene:start').filter((p) => p?.cutsceneId === 'ch1_alley');
    expect(alleyScenes).toHaveLength(1);
    g.combat.finish(true);
    await g.until(() => g.beat() === 'ch2_go_typhoon' && g.state.is('freeRoam'));
    expect(g.state.illegal).toEqual([]);
  });

  it('continues a title-screen load into the saved fight', async () => {
    const a = makeGame({ skipIntro: true });
    await toAlleyFight(a);
    const b = makeGame();
    b.restore(a.stored());
    b.state.transition('title');
    expect(b.ctx.save.load()).toBe(true);
    void b.narrative.continueGame();
    await b.until(() => b.combat.active === 'prologue_alley');
    expect(b.bus.payloads('cutscene:start')).toHaveLength(0);
  });

  it('saves at a payphone', async () => {
    const g = makeGame({ skipIntro: true });
    await g.narrative.startNewGame();
    g.interactable('hs_payphone_percy').interact();
    await g.until(() => g.toasts.includes('已儲存') && g.state.is('freeRoam'));
    expect(g.saves).toEqual(['第一章 波斯富街/波斯富街']);
    expect(g.sfx).toContain('save');
  });

  it('opens a stall menu and returns to free roam', async () => {
    const g = makeGame({ skipIntro: true });
    await g.narrative.startNewGame();
    g.interactable('hs_curry_fishball').interact();
    await g.until(() => g.bus.payloads('state:changed').some((p) => p?.to === 'shop') && g.state.is('freeRoam'));
    expect(g.state.illegal).toEqual([]);
  });

  it('skips to a chapter silently', async () => {
    const g = makeGame({ chapter: 3 });
    await g.narrative.startNewGame();
    expect(g.beat()).toBe('ch3_crossing');
    expect(quest(g, 'main_ch2')).toBe('completed');
    expect(quest(g, 'main_ch3')).toBe('active');
    expect(g.bus.payloads('quest:completed')).toHaveLength(0);
    expect(g.titles).toEqual(['第三章']);
    expect(g.state.mode).toBe('freeRoam');
    expect(g.combat.randomEnabled).toBe(true);
  });

  it('settles 魚蛋佬嘅債 by paying', async () => {
    const g = makeGame({ chapter: 2 });
    await g.narrative.startNewGame();
    expect(g.ctx.inventory.money).toBeGreaterThanOrEqual(2000);
    const before = g.ctx.inventory.money;
    await talkTo(g, 'npc_debtor');
    expect(quest(g, 'sub_debt')).toBe('completed');
    expect(g.ctx.inventory.money).toBe(before - 2000);
    expect(g.narrative.getFlag('debt_done')).toBe(true);
    expect(g.interactable('talk_npc_debtor').isEnabled()).toBe(false);
  });

  it('settles 魚蛋佬嘅債 by fighting the 收數佬', async () => {
    const g = makeGame({ chapter: 2 });
    await g.narrative.startNewGame();
    g.ctx.inventory.spendMoney(g.ctx.inventory.money);
    g.combat.autoWin = true;
    g.interactable('talk_npc_debtor').interact();
    await g.until(() => g.items.get('debt_iou') === 1 && g.state.is('freeRoam'));
    expect(g.combat.started).toEqual(['substory_debt']);
    expect(g.pendingFight()).toBeNull();
    expect(g.toasts).toContain('自動儲存');
    await talkTo(g, 'npc_debtor');
    expect(quest(g, 'sub_debt')).toBe('completed');
    expect(g.items.get('debt_iou')).toBe(0);
    expect(g.ctx.inventory.money).toBe(500);
    expect(g.state.illegal).toEqual([]);
  });

  it('returns 失落嘅BB機 to its owner', async () => {
    const g = makeGame({ chapter: 2 });
    await g.narrative.startNewGame();
    const pickup = g.interactable('hs_lost_pager');
    await talkTo(g, 'npc_pager_owner');
    expect(g.narrative.getActiveMarkers().some((m) => m.kind === 'substory')).toBe(true);
    expect(pickup.isEnabled()).toBe(true);
    pickup.interact();
    await g.until(() => g.items.get('pager_lost') === 1);
    await g.advance(0.5);
    expect(g.narrative.getFlag('pager_picked')).toBe(true);
    expect(pickup.isEnabled()).toBe(false);
    await talkTo(g, 'npc_pager_owner');
    expect(quest(g, 'sub_pager')).toBe('completed');
    expect(g.items.get('pager_lost')).toBe(0);
    expect(g.interactable('talk_npc_pager_owner').isEnabled()).toBe(false);
  });

  it('lets stall keepers and passers-by chatter, throttled', async () => {
    const g = makeGame({ skipIntro: true });
    await g.narrative.startNewGame();
    g.goTo('percy_curry_fishball');
    await g.advance(1);
    expect(g.lines.map((l) => l.text)).toEqual(['咖喱魚蛋，新鮮滾起！']);
    g.entities.spawnCharacter({
      id: 'ped_1', name: '路人', role: 'pedestrian', position: g.player.position.clone(),
    } as unknown as CharacterSpawnDef);
    await g.advance(4);
    expect(g.lines).toHaveLength(1);
    await g.advance(6);
    expect(g.lines.map((l) => l.text)).toEqual(['咖喱魚蛋，新鮮滾起！', '落咁大雨，的士都截唔到。']);
  });

  it('plays the whole main story through the credits', async () => {
    const g = makeGame({ skipIntro: true });
    g.combat.autoWin = true;
    await toAlleyFight(g);
    await g.until(() => g.beat() === 'ch2_go_typhoon' && g.state.is('freeRoam'));
    g.goTo('typhoon_entry');
    await g.until(() => g.beat() === 'ch2_ambush' && g.state.is('freeRoam'));
    g.goTo('typhoon_promenade');
    await g.until(() => g.beat() === 'ch2_shrimp' && g.state.is('freeRoam'));
    await talkTo(g, 'npc_shrimp');
    await g.until(() => g.beat() === 'ch3_crossing' && g.state.is('freeRoam'));
    g.goTo('sogo_crossing');
    await g.until(() => g.beat() === 'ch3_boss' && g.state.is('freeRoam'));
    g.goTo('sogo_plaza_entry');
    await g.until(() => g.beat() === 'postgame' && g.state.is('freeRoam'));
    expect(g.combat.started).toEqual(['prologue_alley', 'typhoon_ambush', 'sogo_goons', 'sogo_boss']);
    expect(g.bus.payloads('state:changed').some((p) => p?.to === 'credits')).toBe(true);
    expect(g.entities.getCharacter('boss_crow')).toBeNull();
    expect(quest(g, 'main_ch3')).toBe('completed');
    expect(g.narrative.getFlag('game_cleared')).toBe(true);
    expect(g.state.illegal).toEqual([]);
  });
});
