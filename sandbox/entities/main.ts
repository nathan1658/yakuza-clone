/**
 * Entities sandbox: every appearance preset (plus random pedestrians) in a
 * lineup, driven by the real CharacterRig + clip library.
 * URL params (for headless screenshots): ?clip=jab&t=0.45&view=side&only=hoNam,crow&props=1&zoom=2
 * &cam=x,y,z&at=x,y,z&fov=25 frames an exact close-up.
 * &night lights the lineup like the game's street (hemisphere + moon, sodium and
 * neon point lights, the city environment map, ACES); &wet=0..1 soaks the clothes.
 */
import {
  ACESFilmicToneMapping, AmbientLight, BoxGeometry, Color, DirectionalLight, GridHelper, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, PointLight, Scene, WebGLRenderer,
} from 'three';
import type { AnimClip } from '../../src/core/types';
import { CLIP_LIBRARY } from '../../src/entities/anim/library';
import { PRESETS, randomLook } from '../../src/entities/look/presets';
import { createUmbrella } from '../../src/entities/pedestrians/umbrella';
import { CharacterRig } from '../../src/entities/rig/CharacterRig';
import { characterLighting } from '../../src/entities/rig/materials';
import { createEnvironment } from '../../src/world/rendering/environment';

const q = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const clipSel = $<HTMLSelectElement>('clip');
const playBox = $<HTMLInputElement>('play');
const tSlider = $<HTMLInputElement>('t');
const viewSel = $<HTMLSelectElement>('view');
const propsBox = $<HTMLInputElement>('props');
const info = $<HTMLDivElement>('info');

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const night = q.has('night');
const scene = new Scene();
scene.background = new Color(night ? 0x0c0b14 : 0x2a3036);
if (night) {
  renderer.toneMapping = ACESFilmicToneMapping;
  characterLighting.envMap = createEnvironment(renderer);
  characterLighting.wet.value = Number(q.get('wet') ?? 1);
  scene.add(new HemisphereLight(0x3a4070, 0x1a1210, 4));
  const lamp = new PointLight(0xffac5c, 120, 18, 2);
  lamp.position.set(1.2, 5.5, 2.5);
  const pink = new PointLight(0xff2a9a, 30, 12, 2);
  pink.position.set(-3, 2.6, -2.2);
  const cyan = new PointLight(0x28d8ff, 24, 12, 2);
  cyan.position.set(3.2, 2.2, -2.6);
  scene.add(lamp, pink, cyan);
} else {
  scene.add(new HemisphereLight(0xcfd8e0, 0x3a3228, 1.2), new AmbientLight(0xffffff, 0.2));
}
const sun = new DirectionalLight(night ? 0x8a9cff : 0xffffff, night ? 0.8 : 2.2);
sun.position.set(night ? -3 : 4, 8, night ? 3.5 : 6);
sun.castShadow = true;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
const ground = new Mesh(new PlaneGeometry(60, 30), new MeshStandardMaterial({ color: night ? 0x1c1c22 : 0x4a4f55, roughness: night ? 0.4 : 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground, new GridHelper(60, 60, 0x666666, 0x555555));

const only = q.get('only')?.split(',');
const looks = [
  ...Object.entries(PRESETS),
  ['pedestrian1', randomLook()],
  ['pedestrian2', randomLook()],
  ['pedestrian3', randomLook()],
] as const;
const lineup = looks.filter(([name]) => !only || only.includes(name));
const rigs = lineup.map(([name, look], i) => {
  const rig = new CharacterRig(look);
  rig.root.name = name;
  rig.root.position.x = (i - (lineup.length - 1) / 2) * 1.15;
  scene.add(rig.root);
  return rig;
});

const stickGeo = new BoxGeometry(0.04, 0.8, 0.04).translate(0, 0.3, 0);
const stickMat = new MeshStandardMaterial({ color: 0xb08040 });
function setProps(on: boolean): void {
  for (const rig of rigs) {
    rig.attachToHand('right', on ? new Mesh(stickGeo, stickMat) : null);
    rig.attachToHand('left', on ? createUmbrella(Math.random()) : null);
  }
}

const clips = Object.keys(CLIP_LIBRARY) as AnimClip[];
clipSel.innerHTML = clips.map((c) => `<option>${c}</option>`).join('');
clipSel.value = q.get('clip') ?? 'idle';
viewSel.value = q.get('view') ?? 'front';
propsBox.checked = q.get('props') === '1';
if (q.has('t')) {
  playBox.checked = false;
  tSlider.value = q.get('t') ?? '0';
}

const camera = new PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 200);
const zoom = Number(q.get('zoom') ?? 1);
const vec = (key: string): [number, number, number] | null => {
  const v = q.get(key)?.split(',').map(Number);
  return v && v.length === 3 && v.every(Number.isFinite) ? [v[0], v[1], v[2]] : null;
};
function placeCamera(): void {
  const cam = vec('cam');
  if (cam) {
    camera.position.set(...cam);
    camera.lookAt(...(vec('at') ?? [0, 1.5, 0]));
    camera.fov = Number(q.get('fov') ?? 35);
    camera.updateProjectionMatrix();
    return;
  }
  const span = Math.max(3, lineup.length * 1.15) / zoom;
  const d = span * 1.35 + 1.5;
  const views: Record<string, [number, number, number]> = {
    front: [0, 1.3, d], side: [d, 1.3, 0.01], back: [0, 1.3, -d], top: [0, d, 0.01],
  };
  camera.position.set(...views[viewSel.value]);
  camera.lookAt(0, 0.95, 0);
}

function select(): void {
  const def = CLIP_LIBRARY[clipSel.value as AnimClip];
  for (const rig of rigs) rig.play(def, { restart: true, loop: playBox.checked ? true : def.loop, blend: 0 });
  info.textContent = `${def.name}: ${def.duration}s${def.loop ? ' loop' : ''}${def.impactAt !== undefined ? ` impact@${def.impactAt}` : ''}`;
  if (!playBox.checked) pose();
}

function pose(): void {
  const def = CLIP_LIBRARY[clipSel.value as AnimClip];
  for (const rig of rigs) {
    rig.play(def, { restart: true, blend: 0 });
    rig.update(Number(tSlider.value) * def.duration * 0.9999);
  }
}

clipSel.onchange = select;
playBox.onchange = select;
tSlider.oninput = () => (playBox.checked = false, pose());
viewSel.onchange = placeCamera;
propsBox.onchange = () => setProps(propsBox.checked);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

setProps(propsBox.checked);
Object.assign(window, { __sandbox: { scene, camera, renderer, rigs } });
placeCamera();
select();
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playBox.checked) for (const rig of rigs) rig.update(dt);
  renderer.render(scene, camera);
});
