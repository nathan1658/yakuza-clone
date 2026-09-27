/**
 * The night street as an image-based light: dark sky, the city's glow along
 * the horizon, neon and shop fronts all round, sodium lamps overhead and
 * their smeared reflections in the wet asphalt below. Rendered once into a
 * prefiltered (PMREM) map, so characters and props pick up coloured fill,
 * reflections and rim light from the city instead of a flat ambient.
 */
import {
  BackSide, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene, SphereGeometry,
  type Texture, type WebGLRenderer,
} from 'three';

const R = 20;

/** [azimuth, elevation, width, height] in radians, colour (sRGB hex) and HDR multiplier. */
type Panel = readonly [az: number, el: number, w: number, h: number, color: number, k: number];

const NEON: readonly Panel[] = [
  [0.2, 0.18, 0.18, 0.1, 0xff2a9a, 3.2], [0.75, 0.32, 0.1, 0.22, 0x28d8ff, 2.6], [1.3, 0.12, 0.22, 0.08, 0xff3020, 2.8],
  [1.9, 0.26, 0.12, 0.16, 0x40ff80, 2], [2.5, 0.16, 0.2, 0.09, 0xffa030, 2.6], [3.1, 0.34, 0.09, 0.2, 0xff4fa3, 2.8],
  [3.7, 0.2, 0.2, 0.1, 0x3050ff, 2.4], [4.3, 0.1, 0.16, 0.07, 0xfff0a0, 2.6], [4.9, 0.28, 0.12, 0.18, 0x28d8ff, 2.4],
  [5.6, 0.14, 0.18, 0.08, 0xff2a9a, 3],
];
/** Lit shop fronts along the street, warm and low. */
const SHOPS: readonly Panel[] = [[0.9, 0.03, 0.45, 0.07, 0xffd9a8, 1.3], [2.8, 0.03, 0.5, 0.07, 0xcfe6ff, 1.1], [4.6, 0.03, 0.4, 0.07, 0xffd9a8, 1.2]];
/** Sodium street lamps overhead. */
const LAMPS: readonly Panel[] = [[0.4, 0.75, 0.07, 0.045, 0xffac5c, 7], [2.2, 0.68, 0.07, 0.045, 0xffac5c, 6], [3.9, 0.8, 0.07, 0.045, 0xffac5c, 7], [5.3, 0.66, 0.07, 0.045, 0xffac5c, 6]];

/** Sky and ground by elevation (linear RGB). */
function skyColor(el: number, out: Color): Color {
  const zenith = new Color(0.006, 0.006, 0.014);
  const upper = new Color(0.022, 0.018, 0.04);
  const glow = new Color(0.085, 0.048, 0.07);
  const ground = new Color(0.012, 0.01, 0.013);
  if (el >= 0.08) return out.copy(upper).lerp(zenith, Math.min(1, (el - 0.08) / 1.2));
  if (el >= 0) return out.copy(glow).lerp(upper, el / 0.08);
  return out.copy(glow).multiplyScalar(0.45).lerp(ground, Math.min(1, -el / 0.12));
}

function panel(scene: Scene, [az, el, w, h, color, k]: Panel, disposables: { dispose(): void }[]): void {
  const g = new PlaneGeometry(2 * R * Math.tan(w / 2), 2 * R * Math.tan(h / 2));
  const m = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(k), side: DoubleSide });
  const mesh = new Mesh(g, m);
  mesh.position.set(Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, Math.cos(az) * Math.cos(el) * R);
  mesh.lookAt(0, 0, 0);
  scene.add(mesh);
  disposables.push(g, m);
}

export function createEnvironment(renderer: WebGLRenderer): Texture {
  const scene = new Scene();
  const disposables: { dispose(): void }[] = [];
  const sky = new SphereGeometry(40, 48, 24);
  const pos = sky.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) skyColor(Math.asin(pos.getY(i) / 40), c).toArray(colors, i * 3);
  sky.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const skyMat = new MeshBasicMaterial({ vertexColors: true, side: BackSide });
  scene.add(new Mesh(sky, skyMat));
  disposables.push(sky, skyMat);
  for (const p of [...NEON, ...SHOPS, ...LAMPS]) panel(scene, p, disposables);
  // The wet street mirrors the neon as long dim smears below the horizon.
  for (const [az, el, w, h, color, k] of NEON) panel(scene, [az, -0.03 - el * 0.4, w * 0.8, h * 2.2, color, k * 0.22], disposables);
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  for (const d of disposables) d.dispose();
  return target.texture;
}
