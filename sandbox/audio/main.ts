/**
 * Audio sandbox: drives the real AudioSystem through a stand-in GameContext.
 * Buttons for every SFX / track / mode, bus sliders, a movable listener, and
 * window.__audioLab for offline peak / RMS measurements.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import type { GameContext, GameEvents, GameModeId, SfxId, WeatherKind, ZoneId } from '../../src/core/types';
import { AudioSystem } from '../../src/assets/audio/AudioSystem';
import { BUSES } from '../../src/assets/audio/settings';
import { CITY } from '../../src/assets/audio/sfx/recipes/city';
import { COMBAT } from '../../src/assets/audio/sfx/recipes/combat';
import { HEAT } from '../../src/assets/audio/sfx/recipes/heat';
import { OBJECTS } from '../../src/assets/audio/sfx/recipes/objects';
import { STINGS } from '../../src/assets/audio/sfx/recipes/stings';
import { UI } from '../../src/assets/audio/sfx/recipes/ui';
import * as lab from './lab';

type Handler = (p: unknown) => void;
const handlers = new Map<string, Set<Handler>>();
const events = {
  on(type: string, h: Handler) {
    const set = handlers.get(type) ?? new Set<Handler>();
    handlers.set(type, set.add(h));
    return () => set.delete(h);
  },
};
function emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
  for (const h of handlers.get(type) ?? []) h(payload);
}

const game = { mode: 'boot' as GameModeId, zone: 'percy' as ZoneId, weather: 'rain' as WeatherKind };
const camera = new PerspectiveCamera(60, 1, 0.1, 500);
camera.position.set(-64, 1.7, -60);
const ctx = {
  events,
  engine: { camera },
  state: { get mode() { return game.mode; } },
  world: { get currentZone() { return game.zone; }, get weather() { return game.weather; } },
} as unknown as GameContext;

const audio = new AudioSystem(ctx);
audio.init();
Object.assign(window, { __audio: audio, __audioLab: lab });

const $ = (sel: string) => document.querySelector(sel)!;
function button(parent: Element, label: string, onClick: () => void): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    void audio.unlock();
    onClick();
  };
  parent.append(b);
}
function section(title: string): HTMLElement {
  const s = document.createElement('section');
  const h = document.createElement('h2');
  h.textContent = title;
  s.append(h);
  $('#panel').append(s);
  return s;
}

function setMode(to: GameModeId): void {
  const from = game.mode;
  game.mode = to;
  emit('state:changed', { from, to, payload: undefined });
}

// --- SFX -------------------------------------------------------------------
let spatial = false;
const spot = new Vector3();
function playAt(id: string): void {
  camera.getWorldDirection(spot).multiplyScalar(4).add(camera.position);
  spot.x += 3;
  audio.playSfx(id as SfxId, spatial ? { position: spot } : undefined);
}
const books = { Combat: COMBAT, Heat: HEAT, Objects: OBJECTS, UI, City: CITY, Stings: STINGS };
for (const [name, book] of Object.entries(books)) {
  const s = section(`SFX · ${name}`);
  for (const id of Object.keys(book)) button(s, id, () => playAt(id));
}
const toggle = section('SFX placement');
button(toggle, '2D / 3D (4 m ahead, 3 m right)', () => {
  spatial = !spatial;
});

// --- Music + flow --------------------------------------------------------------
const music = section('Music (manual)');
for (const id of lab.MUSIC_IDS) button(music, id, () => audio.playMusic(id));

const flow = section('Game flow (director)');
const modes: GameModeId[] = ['title', 'freeRoam', 'dialogue', 'cutscene', 'combat', 'heatAction', 'menu', 'shop', 'gameOver', 'credits'];
for (const m of modes) button(flow, `→ ${m}`, () => setMode(m));
button(flow, 'combat:start street', () => emit('combat:start', { encounterId: 'street' as never, enemyIds: [], isBoss: false }));
button(flow, 'combat:start boss', () => emit('combat:start', { encounterId: 'boss' as never, enemyIds: [], isBoss: true }));
button(flow, 'combat:end victory', () => emit('combat:end', { encounterId: 'x' as never, victory: true, moneyEarned: 0 }));
for (const phase of [1, 2, 3]) button(flow, `boss:phase ${phase}`, () => emit('boss:phase', { bossId: 'karasu', phase }));
button(flow, 'duck 0.5 × 2 s', () => audio.duck(0.5, 2));

// --- World -------------------------------------------------------------------
const world = section('World');
for (const z of ['percy', 'hennessy', 'sogo', 'typhoon'] as ZoneId[]) {
  button(world, `zone ${z}`, () => {
    const from = game.zone;
    game.zone = z;
    emit('zone:changed', { from, to: z });
  });
}
for (const w of ['clear', 'drizzle', 'rain'] as WeatherKind[]) button(world, `weather ${w}`, () => { game.weather = w; });
for (const [label, x, z] of [['Percy St', -64, -60], ['Hennessy', 0, 12], ['Typhoon', 0, -150]] as const) {
  button(world, `listener → ${label}`, () => camera.position.set(x, 1.7, z));
}

// --- Volumes -------------------------------------------------------------------
const vols = section('Volumes (persisted)');
for (const bus of BUSES) {
  const label = document.createElement('label');
  const input = Object.assign(document.createElement('input'), { type: 'range', min: '0', max: '1', step: '0.01' });
  input.value = String(audio.getVolume(bus));
  input.oninput = () => audio.setVolume(bus, Number(input.value));
  label.append(`${bus} `, input);
  vols.append(label);
}

// --- Loop --------------------------------------------------------------------------
const hud = $('#hud');
let last = performance.now();
let frame = 0;
function loop(now: number): void {
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = { dt: realDt, realDt, elapsed: now / 1000, realElapsed: now / 1000, frame: frame++ };
  camera.updateMatrixWorld();
  audio.update(time);
  audio.lateUpdate();
  const bank = (audio as unknown as { bank: { readyCount: number } | null }).bank;
  hud.textContent = `mode ${game.mode} · zone ${game.zone} · weather ${game.weather} · music ${audio.currentMusic}`
    + ` · sfx ready ${bank?.readyCount ?? 0} · 3D ${spatial} · listener ${camera.position.x},${camera.position.z}`;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
