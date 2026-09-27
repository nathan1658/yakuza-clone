/**
 * UI sandbox: the real UIManager + Inventory over a stub context (no engine, no 3D).
 * Open /sandbox/ui.html and pick a scene from the buttons (or window.scene('hud')).
 * Input is the real core InputManager (real bindings and labels).
 * Keys: arrows/WASD menus · Enter confirm · Esc cancel/pause · I inventory · 1-4 choices
 *       J/K/Space QTE buttons · H hit enemy · G gain heat · M money.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { EventBus } from '../../src/core/EventBus';
import { InputManager } from '../../src/core/InputManager';
import type {
  GameContext, GameEvents, GameModeId, GameTime, ICharacter, IInteractable, MinimapData, QuestMarker,
  QuestView, ISaveable,
} from '../../src/core/types';
import { Inventory } from '../../src/inventory/Inventory';
import { UIManager } from '../../src/ui/UIManager';

class StubState {
  mode: GameModeId = 'boot';
  previous: GameModeId = 'boot';
  payload: unknown = undefined;
  timeInMode = 0;
  is(...modes: GameModeId[]): boolean { return modes.includes(this.mode); }
  can(): boolean { return true; }
  transition(to: GameModeId): boolean {
    this.previous = this.mode;
    this.mode = to;
    return true;
  }
  back(): boolean { return this.transition(this.previous); }
}

function character(id: string, name: string, x: number, z: number, role = 'thug'): ICharacter {
  return {
    id, displayName: name, role, position: new Vector3(x, 0, z), height: 1.8, hp: 80, maxHp: 100, facing: 0,
    isAlive: () => true,
  } as unknown as ICharacter;
}

const MINIMAP: MinimapData = {
  bounds: { minX: -80, minZ: -80, maxX: 80, maxZ: 80 },
  shapes: [],
  labels: [{ text: '崇光', x: 20, z: 30 }, { text: '波斯富街', x: -18, z: -10 }],
};

const QUESTS: QuestView[] = [
  { id: 'ch1', kind: 'main', titleZh: '第一章　銅鑼灣之虎', titleEn: 'The Tiger', status: 'active',
    objectiveZh: '去崇光門口搵山雞', descriptionZh: '山雞話有人喺波斯富街收錯數，叫浩南去睇下。' },
  { id: 'sub_pager', kind: 'substory', titleZh: '失落的傳呼機', titleEn: 'The Lost Pager', status: 'completed',
    objectiveZh: '', descriptionZh: '幫阿珍搵返部 call 機。' },
];

function buildContext(): { ctx: GameContext; enemies: ICharacter[]; hit: () => void } {
  const events = new EventBus<GameEvents>();
  const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
  camera.position.set(0, 2.4, -6);
  camera.lookAt(0, 1.2, 4);
  const time: GameTime = { dt: 0, realDt: 0, elapsed: 0, realElapsed: 0, frame: 0 } as unknown as GameTime;
  const player = character('player', '陳浩南', 0, 0, 'player');
  player.hp = 72;
  const enemies = [character('e1', '東星爛仔', -2.2, 5), character('e2', '東星打手', 1.8, 6.5), character('e3', '烏鴉', 0.2, 9, 'boss')];
  const volumes: Record<string, number> = { master: 0.8, music: 0.6, sfx: 0.9, ambience: 0.5 };
  const saveables: ISaveable[] = [];
  const combat = {
    inCombat: true, heat: 180, maxHeat: 300, lockTarget: enemies[0]!,
    heatActionAvailable: { nameZh: '摺凳之極', nameEn: 'Folding Chair Finisher' } as { nameZh: string; nameEn: string } | null,
    getActiveEnemies: () => enemies,
    addHeat(n: number) { this.heat = Math.min(this.maxHeat, this.heat + n); },
  };
  const prompt: IInteractable = {
    id: 'vendor', label: '購買', radius: 2, getPosition: () => new Vector3(3, 1.2, 4), isEnabled: () => true, interact: () => {},
  };
  const ctx = {
    events, input: new InputManager(document.getElementById('game-root')!), state: new StubState(),
    engine: { camera, time, paused: false, timeScale: 1, renderer: { info: { render: { calls: 0, triangles: 0 } } } },
    audio: {
      currentMusic: null, unlock: async () => {}, playSfx: (id: string) => console.debug('[sfx]', id),
      setVolume: (bus: string, v: number) => { volumes[bus] = v; }, getVolume: (bus: string) => volumes[bus] ?? 1,
    },
    entities: { player, getCharacters: () => [player, ...enemies] },
    combat,
    world: { currentZone: 'percy', getMinimapData: () => MINIMAP },
    cameraRig: { getYaw: () => 0 },
    interactions: { current: prompt },
    narrative: {
      getQuests: () => QUESTS,
      getTrackedObjective: () => ({ titleZh: '第一章　銅鑼灣之虎', objectiveZh: '去崇光門口搵山雞' }),
      getActiveMarkers: (): QuestMarker[] => [{ id: 'm1', kind: 'main', position: new Vector3(20, 0, 30) }],
    },
    save: {
      playTimeSec: 3725, hasSave: () => true, register: (s: ISaveable) => saveables.push(s),
      getMeta: () => ({ version: 1, timestamp: Date.now() - 3.6e6, chapterZh: '第一章', locationZh: '波斯富街', playTimeSec: 3725 }),
    },
    debug: { enabled: true, chapter: null, skipIntro: false, god: false },
  } as unknown as GameContext;
  (ctx as { inventory: unknown }).inventory = new Inventory(ctx);
  const hit = () => {
    const target = enemies[Math.floor(Math.random() * 2)]!;
    target.hp = Math.max(5, target.hp - 12);
    events.emit('combat:hit', {
      attackerId: 'player', targetId: target.id, damage: 12 + Math.round(Math.random() * 30),
      position: target.position.clone().setY(1.4), kind: Math.random() < 0.3 ? 'heavy' : 'light',
      blocked: false, knockdown: false,
    });
  };
  return { ctx, enemies, hit };
}

const { ctx, hit } = buildContext();
const ui = new UIManager(ctx, document.getElementById('ui-root')!);
const state = ctx.state as unknown as StubState;
const input = ctx.input;
const inventory = ctx.inventory as Inventory;

function hud(): void {
  state.transition('combat');
  ui.setHudVisible(true);
  ui.showBossBar('烏鴉', '東星五虎');
  events().emit('boss:hp', { bossId: 'e3', hp: 620, maxHp: 1000 });
}

function events() { return ctx.events; }

/** What GameInstance + world.onBuildProgress send: system names at i/n, the world's own labels in between. */
const BOOT: [number, string][] = [
  [0, 'save'], [0.1, 'audio'], [0.2, 'ui'], [0.3, 'cameraRig'], [0.4, 'world'],
  [0.25, '起樓'], [0.5, '掛招牌'], [0.75, '開霓虹燈'], [1, '落雨'],
  [0.5, 'entities'], [0.6, 'interactions'], [0.7, 'inventory'], [0.8, 'combat'], [0.9, 'narrative'],
];

const SCENES: Record<string, () => void> = {
  loading: () => {
    let i = 0;
    const id = setInterval(() => {
      const step = BOOT[i++];
      if (step) ui.showLoading(...step);
      else { clearInterval(id); ui.hideLoading(); }
    }, 250);
  },
  title: () => { state.transition('title'); void ui.showTitleScreen(true).then((r) => console.log('title →', r)); },
  hud,
  banners: () => {
    hud();
    ui.showLocationBanner('hennessy');
    ui.toast('收到 $500', 'money');
    ui.toast('攞到 咖喱魚蛋 ×1', 'item');
    ui.toast('小心！差佬巡緊', 'warning');
    setTimeout(() => ui.showHeatActionName('摺凳之極', 'Folding Chair Finisher'), 600);
    setTimeout(() => events().emit('quest:completed', { questId: 'sub_pager', kind: 'substory' }), 2400);
  },
  chapter: () => { state.transition('cutscene'); ui.setLetterbox(true); void ui.showChapterTitle('第一章', '銅鑼灣之虎', 'THE TIGER OF CAUSEWAY BAY'); },
  subtitle: () => { state.transition('cutscene'); ui.setLetterbox(true); ui.showSubtitle('今晚之後，銅鑼灣只有一個話事人。', '烏鴉', 4); },
  dialogue: async () => {
    state.transition('dialogue');
    await ui.presentLine({ speaker: '山雞', speakerColor: '#e8b54a', text: '浩南，東星嗰班友又喺波斯富街收陀地喇！', gloss: 'Nam, those Tung Sing guys are collecting protection money on Percy Street again!' });
    const pick = await ui.presentLine({ speaker: '陳浩南', text: '點做好？', choices: [{ text: '即刻過去搞掂佢' }, { text: '問清楚先' }, { text: '唔關我事', disabled: true }] });
    await ui.presentLine({ speaker: '', text: `（你揀咗第 ${pick + 1} 個。）` });
    ui.hideDialogue();
  },
  qte: () => { hud(); void ui.runQTE(['lightAttack', 'heavyAttack', 'dodge'], 1.4).then((ok) => ui.toast(ok ? 'QTE 成功' : 'QTE 失敗', ok ? 'quest' : 'warning')); },
  pause: () => { state.transition('freeRoam'); ui.openPauseMenu('inventory'); },
  shop: () => { state.transition('shop'); void ui.openShop('shop_curry_fishball'); },
  system: () => { state.transition('freeRoam'); ui.openPauseMenu('system'); },
  gameover: () => { state.transition('gameOver'); void ui.showGameOver().then((r) => console.log('gameover →', r)); },
  credits: () => { state.transition('credits'); void ui.showCredits(); },
};

ui.showLoading(0.2, 'ui');
ui.init();
inventory.init();
inventory.addMoney(3800);
inventory.addItem('curry_fishball', 3);
inventory.addItem('milk_tea');
inventory.addItem('tiger_balm', 2);
inventory.addItem('pager_lost');
ui.hideLoading();

const bar = document.getElementById('scenes')!;
for (const name of Object.keys(SCENES)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => { location.hash = name; location.reload(); };
  bar.append(b);
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyH') hit();
  if (e.code === 'KeyG') ctx.combat.addHeat(40);
  if (e.code === 'KeyM') inventory.addMoney(Math.random() < 0.5 ? 250 : -120);
});
Object.assign(window, { scene: (n: string) => SCENES[n]?.(), ui, ctx, hit });

const scene = location.hash.slice(1) || 'hud';
SCENES[scene]?.();

let last = performance.now();
const t = ctx.engine.time as { realDt: number; frame: number; realElapsed: number };
function frame(now: number): void {
  t.realDt = Math.min(0.1, (now - last) / 1000);
  t.realElapsed += t.realDt;
  t.frame++;
  last = now;
  input.beginFrame(t.realDt);
  ui.update(ctx.engine.time);
  ui.lateUpdate();
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
