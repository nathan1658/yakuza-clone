/**
 * Entities sandbox: every appearance preset (plus random pedestrians) in a
 * lineup, driven by the real CharacterRig + clip library.
 * URL params (for headless screenshots): ?clip=jab&t=0.45&view=side&only=hoNam,crow&props=1&zoom=2
 */
import {
  AmbientLight, BoxGeometry, Color, DirectionalLight, GridHelper, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer,
} from 'three';
import type { AnimClip } from '../../src/core/types';
import { CLIP_LIBRARY } from '../../src/entities/anim/library';
import { PRESETS, randomLook } from '../../src/entities/look/presets';
import { createUmbrella } from '../../src/entities/pedestrians/umbrella';
import { CharacterRig } from '../../src/entities/rig/CharacterRig';

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

const scene = new Scene();
scene.background = new Color(0x2a3036);
scene.add(new HemisphereLight(0xcfd8e0, 0x3a3228, 1.2), new AmbientLight(0xffffff, 0.2));
const sun = new DirectionalLight(0xffffff, 2.2);
sun.position.set(4, 8, 6);
sun.castShadow = true;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
const ground = new Mesh(new PlaneGeometry(60, 30), new MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.9 }));
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
function placeCamera(): void {
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
placeCamera();
select();
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playBox.checked) for (const rig of rigs) rig.update(dt);
  renderer.render(scene, camera);
});
