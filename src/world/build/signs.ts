/**
 * Sign boards: lit faces in one mesh on the sign shader, board bodies and
 * wall brackets in the flat batch, and the steadier, brighter signs as
 * light sources for the rig.
 */
import { BufferGeometry, Color, Float32BufferAttribute, Mesh, Uint16BufferAttribute, Uint32BufferAttribute } from 'three';
import type { ShaderMaterial } from 'three';
import { textCells } from '../data/signs';
import type { SignDef, SignMode } from '../data/signs';
import type { Batcher } from '../rendering/Batcher';
import type { LightSource } from '../rendering/LightRig';
import type { MatKey } from '../rendering/materials';
import type { AtlasRect, SignAtlas } from '../rendering/signAtlas';
import { createSignMaterial } from '../rendering/signMaterial';
import type { WorldUniforms } from '../rendering/uniforms';

const MODE: Readonly<Record<SignMode, number>> = { steady: 0, flicker: 1, blink: 2, chaseX: 3, chaseY: 4, rotate: 5 };
/** Faces float this far off the board body so they never z-fight it. */
const FACE_OFFSET = 0.02;
const BODY = 0x1a1a1c;
const STEEL = 0x3a3a3c;
const BAR = 0.03;

class Faces {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly local: number[] = [];
  readonly col: number[] = [];
  readonly pan: number[] = [];
  readonly dat: number[] = [];
  readonly idx: number[] = [];
  private readonly color = new Color();
  private readonly panel = new Color();

  /** One face at local depth lz; `back` mirrors it so its text still reads left to right. */
  add(s: SignDef, r: AtlasRect, lz: number, back: boolean): void {
    const cos = Math.cos(s.yaw);
    const sin = Math.sin(s.yaw);
    const hw = back ? -s.w / 2 : s.w / 2;
    const hh = s.h / 2;
    const corners = [
      [-hw, -hh, 0, 0, r.u0, r.v1],
      [hw, -hh, 1, 0, r.u1, r.v1],
      [hw, hh, 1, 1, r.u1, r.v0],
      [-hw, hh, 0, 1, r.u0, r.v0],
    ] as const;
    this.color.setHex(s.color);
    this.panel.setHex(s.panel);
    const chars = s.shape === 'bat' ? 1 : s.vertical ? [...s.text].length : textCells(s.text);
    const kind = s.kind === 'box' ? 1 : 0;
    const base = this.pos.length / 3;
    for (const [lx, ly, a, b, u, v] of corners) {
      this.pos.push(s.x + lx * cos + lz * sin, s.y + ly, s.z - lx * sin + lz * cos);
      this.uv.push(u, v);
      this.local.push(a, b);
      this.col.push(this.color.r, this.color.g, this.color.b);
      this.pan.push(this.panel.r, this.panel.g, this.panel.b);
      this.dat.push(MODE[s.mode] + 8 * kind, chars, s.phase, s.power);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('local', new Float32BufferAttribute(this.local, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('panel', new Float32BufferAttribute(this.pan, 3));
    g.setAttribute('data', new Float32BufferAttribute(this.dat, 4));
    const big = this.pos.length / 3 > 65535;
    g.setIndex(big ? new Uint32BufferAttribute(this.idx, 1) : new Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Board body, and for a projecting board the two brackets back to its wall. */
function hardware(b: Batcher<MatKey>, s: SignDef): void {
  const m = b.at('flat', s.x, s.z).data(0);
  if (s.shape === 'board') m.color(BODY).box(s.x, s.y, s.z, s.w / 2, s.h / 2, s.depth / 2, s.yaw);
  if (s.mount === 0) return;
  const edge = Math.sign(s.mount) * (s.w / 2);
  const lx = (s.mount + edge) / 2;
  const half = Math.abs(s.mount - edge) / 2 + 0.05;
  const cos = Math.cos(s.yaw);
  const sin = Math.sin(s.yaw);
  m.color(STEEL);
  for (const ly of [s.h / 2 - 0.12, -s.h / 2 + 0.12]) m.box(s.x + lx * cos, s.y + ly, s.z - lx * sin, half, BAR, BAR, s.yaw);
}

/** Steady signs light the street round them; blinkers and dying tubes would need animated lights. */
function light(s: SignDef): LightSource | null {
  if (s.power < 1 || s.mode === 'flicker' || s.mode === 'blink') return null;
  const area = s.w * s.h;
  const neon = s.kind === 'neon';
  const intensity = neon ? Math.min(60, area * 6) : Math.min(60, area * 2);
  if (intensity < 12) return null;
  // A flat board lights what is in front of it; a projecting one hangs in the open.
  const out = s.mount === 0 ? 0.8 : 0;
  return {
    x: s.x + Math.sin(s.yaw) * out,
    y: s.y - (s.mount === 0 ? 0 : s.h / 2 + 0.3),
    z: s.z + Math.cos(s.yaw) * out,
    color: neon ? s.color : s.panel,
    intensity,
  };
}

function addFaces(faces: Faces, s: SignDef, atlas: SignAtlas): void {
  const r = atlas.rect(s);
  const lz = s.depth / 2 + FACE_OFFSET;
  faces.add(s, r, lz, false);
  if (s.twoSided) faces.add(s, r, -lz, true);
}

/** Only the lit faces, in the signs' own frame: boards riding on something that moves. */
export function signFaces(signs: readonly SignDef[], atlas: SignAtlas): BufferGeometry {
  const faces = new Faces();
  for (const s of signs) addFaces(faces, s, atlas);
  return faces.build();
}

export interface SignBuild {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly lights: LightSource[];
}

export function buildSigns(b: Batcher<MatKey>, signs: readonly SignDef[], atlas: SignAtlas, u: WorldUniforms): SignBuild {
  const faces = new Faces();
  const lights: LightSource[] = [];
  for (const s of signs) {
    addFaces(faces, s, atlas);
    hardware(b, s);
    const l = light(s);
    if (l) lights.push(l);
  }
  const mesh = new Mesh(faces.build(), createSignMaterial(u, atlas.texture));
  mesh.name = 'world:signs';
  mesh.layers.enable(1);
  mesh.matrixAutoUpdate = false;
  return { mesh, lights };
}
