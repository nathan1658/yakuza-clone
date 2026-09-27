/** Accessories as data, each sitting on the sculpted head or the torso/arm profiles. */
import type { Accessory } from '../../core/types';
import { arm, ringAt, surfaceAt, TAU, TORSO_BUMPS, torsoRings, torsoSkin, WRIST_DY, type Look } from './body';
import type { Head } from './head';
import { add, KIND, lerp, MeshBuilder, norm, paint, rigid, sub, type P, type Paint, type Ring, type V } from './MeshBuilder';

const GOLD = paint(0xd4a93a, KIND.metal, 0.28, 1);
const STEEL = paint(0xb8b8c0, KIND.metal, 0.32, 1);
const LENS = paint(0x07080b, KIND.glass, 0.04);
const FRAME = paint(0x111111, KIND.plain, 0.3);
const WIRE = paint(0x8c8578, KIND.metal, 0.35, 1);

type AccessoryBuilder = (b: MeshBuilder, look: Look, head: Head) => void;

const HEAD = rigid('head');

/** Temple arm from the frame's outer end back over the ear. */
function templeArms(head: Head, b: MeshBuilder, pt: Paint): void {
  for (const x of [1, -1]) {
    const rings: Ring[] = [
      { c: head.face(x * 0.061, 0.02, 0.012).p, rx: 0.0022, rz: 0.003, n: 3 },
      ...[1.05, 1.3, 1.56, 1.72].map((ph): Ring => ({ c: head.surf(1.38, x * ph, 0.0055), rx: 0.0024, rz: 0.0018, n: 3, f: head.normal(1.38, x * ph) })),
    ];
    b.sweep(rings, { sides: 6, sub: 2, capStart: true, capEnd: true, side: [0, 1, 0] }, HEAD, pt);
  }
}

const sunglasses: AccessoryBuilder = (b, _look, head) => {
  for (const x of [1, -1]) {
    const s = head.face(x * 0.033, 0.011, 0.017);
    b.ellipsoid(s.p, [0.0215, 0.0158, 0.0042], HEAD, LENS, { segs: 16, rot: [0, Math.atan2(s.n[0], s.n[2]) * 0.6, 0] });
  }
  const bar: Ring[] = [-0.061, -0.034, 0, 0.034, 0.061].map((x) => ({
    c: head.face(x, x === 0 ? 0.02 : 0.026, 0.018).p, rx: 0.0034, rz: 0.003, n: 3, f: [0, 0, 1],
  }));
  b.sweep(bar, { sides: 6, sub: 3, capStart: true, capEnd: true, side: [0, 1, 0] }, HEAD, FRAME);
  templeArms(head, b, FRAME);
};

const glasses: AccessoryBuilder = (b, _look, head) => {
  for (const x of [1, -1]) {
    const s = head.face(x * 0.032, 0.011, 0.014);
    b.torus(s.p, 0.0165, 0.0017, HEAD, WIRE, { rot: [0, Math.atan2(s.n[0], s.n[2]) * 0.6, 0], seg: 18, tube: 5 });
  }
  b.sweep([-0.016, 0, 0.016].map((x) => ({ c: head.face(x, 0.016, 0.014).p, rx: 0.0015, rz: 0.0015 })), { sides: 5, sub: 2 }, HEAD, WIRE);
  templeArms(head, b, WIRE);
};

/** A heavy chain lying on the chest, dipping at the front. */
const goldChain: AccessoryBuilder = (b, look) => {
  const base = torsoRings(look, b.p.w);
  const rings: Ring[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (TAU * i) / 40;
    const y = 1.462 - 0.07 * Math.max(0, Math.cos(a)) ** 3;
    const s = surfaceAt(base, TORSO_BUMPS, y, a, 0.02);
    rings.push({ c: s.p, rx: 0.0038, rz: 0.0038 });
  }
  rings[40] = { ...rings[0] };
  b.sweep(rings, { sides: 6 }, torsoSkin(b), GOLD);
};

const cigarette: AccessoryBuilder = (b, _look, head) => {
  const a = head.face(0.017, -0.0515, 0.001).p;
  const dir = norm([0.28, -0.22, 1]);
  const at = (d: number): V => add(a, [dir[0] * d, dir[1] * d, dir[2] * d]);
  const r = 0.0042;
  b.sweep([{ c: at(0), rx: r, rz: r }, { c: at(0.018), rx: r, rz: r }], { sides: 8 }, HEAD, paint(0xc89a5a, KIND.woven, 0.7));
  b.sweep([{ c: at(0.018), rx: r, rz: r }, { c: at(0.058), rx: r, rz: r }], { sides: 8 }, HEAD, paint(0xefeae0, KIND.woven, 0.8));
  b.sweep([{ c: at(0.058), rx: r, rz: r }, { c: at(0.062), rx: r * 0.96, rz: r * 0.96 }], { sides: 8 }, HEAD, paint(0x8a8680, KIND.plain, 0.9));
  b.sweep([{ c: at(0.062), rx: r * 0.95, rz: r * 0.95 }, { c: at(0.067), rx: r * 0.7, rz: r * 0.7 }], { sides: 8, capEnd: true }, HEAD, paint(0xff6a1a, KIND.plain, 0.9, 0, { glow: 2.2 }));
};

const watch: AccessoryBuilder = (b, look) => {
  const a = arm(b, 'L', look);
  const y = a.top[1] + WRIST_DY + 0.032;
  const ring = ringAt(a.rings, y);
  const rings: Ring[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (TAU * i) / 24;
    rings.push({ c: [ring.c[0] + Math.sin(t) * (ring.rx + 0.004), y, ring.c[2] + Math.cos(t) * (ring.rz + 0.004)], rx: 0.009, rz: 0.0028, n: 4, f: [Math.sin(t), 0, Math.cos(t)] });
  }
  rings[24] = { ...rings[0] };
  const strap = look.female ? GOLD : paint(0x241a14, KIND.leather, 0.5);
  b.sweep(rings, { sides: 6, side: [0, 1, 0] }, a.skin, strap);
  const face: P = [ring.c[0] + ring.rx + 0.007, y, ring.c[2]];
  b.ellipsoid(face, [0.004, 0.0155, 0.0155], a.skin, look.female ? GOLD : STEEL, { segs: 14 });
  b.ellipsoid(add(face, [0.0028, 0, 0]), [0.0018, 0.012, 0.012], a.skin, paint(0xe8e4d8, KIND.glass, 0.06), { segs: 14 });
};

/** A tied band round the forehead with two tails at the back. */
const headband: AccessoryBuilder = (b, _look, head) => {
  const red = paint(0xb02020, KIND.woven, 0.8);
  const line = (ph: number) => lerp(0.96, 1.3, (1 - Math.cos(ph)) / 2);
  const rings: Ring[] = [];
  for (let i = 0; i <= 40; i++) {
    const ph = (TAU * i) / 40;
    rings.push({ c: head.surf(line(ph), ph, 0.013), rx: 0.013, rz: 0.003, n: 3, f: head.normal(line(ph), ph) });
  }
  rings[40] = { ...rings[0] };
  b.sweep(rings, { sides: 6, side: [0, 1, 0] }, HEAD, red);
  const knot = head.surf(line(Math.PI), Math.PI, 0.018);
  for (const x of [1, -1]) {
    b.sweep([
      { c: knot, rx: 0.011, rz: 0.0025, n: 3, f: [0, 0, -1] },
      { c: add(knot, [x * 0.012, -0.05, -0.012]), rx: 0.01, rz: 0.0025, n: 3, f: [0, 0.2, -1] },
      { c: add(knot, [x * 0.02, -0.095, -0.01]), rx: 0.008, rz: 0.0025, n: 3, f: [0, 0, -1] },
    ], { sides: 6, sub: 3, side: [1, 0, 0] }, HEAD, red);
  }
};

const earring: AccessoryBuilder = (b, _look, head) => {
  const th = Math.PI / 2 + 0.04;
  const ph = Math.PI / 2 + 0.13;
  const lobe = add(head.surf(th, ph, 0.004), [0.002, -0.035, 0.004]);
  b.torus(lobe, 0.0065, 0.0013, HEAD, GOLD, { rot: [0, Math.PI / 2 - 0.3, 0], seg: 14, tube: 5 });
};

/** Baseball cap: a crown over the hair and a curved brim. */
const cap: AccessoryBuilder = (b, _look, head) => {
  const navy = paint(0x2c3e66, KIND.woven, 0.8);
  const edge = (ph: number) => lerp(1.02, 1.3, (1 - Math.cos(ph)) / 2);
  const pts: V[][] = [];
  const hints: V[][] = [];
  for (let i = 0; i <= 10; i++) {
    const row: V[] = [];
    const hint: V[] = [];
    for (let k = 0; k < 40; k++) {
      const ph = (TAU * k) / 40;
      const th = (edge(ph) * i) / 10;
      row.push(head.surf(th, ph, 0.02 - 0.004 * (i / 10) ** 2));
      hint.push(head.normal(th, ph));
    }
    pts.push(row);
    hints.push(hint);
  }
  b.grid(pts, hints, HEAD, navy);
  const brim: Ring[] = [-0.9, -0.45, 0, 0.45, 0.9].map((ph): Ring => {
    const e = head.surf(edge(ph) - 0.02, ph, 0.02);
    const out = norm(sub(e, head.c));
    const forward = norm([out[0] * 0.6, -0.12, Math.max(0.4, out[2])]);
    return { c: add(e, [forward[0] * 0.036, forward[1] * 0.036 - Math.abs(ph) * 0.008, forward[2] * 0.036]), rx: 0.038, rz: 0.003, n: 4, f: [0, 1, -0.12] };
  });
  b.sweep(brim, { sides: 8, sub: 3, capStart: true, capEnd: true, side: [0, 0, 1] }, HEAD, navy);
  b.ellipsoid(head.surf(0, 0, 0.022), [0.007, 0.004, 0.007], HEAD, navy, { segs: 8 });
};

/** Tattoos are painted on the arm skin by the shader (body.ts gives it the tattoo kind); nothing to add here. */
const tattooArms: AccessoryBuilder = () => {};

const ACCESSORIES: Readonly<Record<Accessory, AccessoryBuilder>> = {
  sunglasses, goldChain, cigarette, watch, headband, tattooArms, earring, glasses, cap,
};

export function buildAccessories(b: MeshBuilder, look: Look, head: Head): void {
  for (const a of look.accessories ?? []) ACCESSORIES[a](b, look, head);
}
