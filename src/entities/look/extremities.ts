/**
 * Hands and shoes, rigid on their bones. Hands are loose fists closed round
 * the palm socket (CharacterRig: grip along +Z, 6 cm below the wrist), so a
 * weapon or umbrella sits in the curl of the fingers. Shoes are lofted
 * uppers on a separate sole: leather dress shoes or canvas sneakers.
 */
import type { Look } from './body';
import { blend, KIND, luma, MeshBuilder, paint, rigid, shade, tint, type P, type Ring } from './MeshBuilder';

/** Finger paths in the hand's (x out, y down the arm) plane: palm, knuckle, first joint, second joint, tip. */
const CURL: readonly (readonly [number, number])[] = [
  [0.009, -0.074], [0.005, -0.093], [-0.017, -0.103], [-0.034, -0.091], [-0.038, -0.07], [-0.028, -0.058],
];
/** Per finger: z across the fist, length scale, knuckle drop, radius. Index first. */
const FINGERS: readonly (readonly [number, number, number, number])[] = [
  [0.026, 0.95, 0.002, 0.0092], [0.0085, 1, 0, 0.0095], [-0.0095, 0.97, 0.002, 0.009], [-0.0265, 0.82, 0.008, 0.0078],
];
const THUMB: readonly P[] = [[-0.006, -0.02, 0.03], [-0.026, -0.04, 0.045], [-0.043, -0.062, 0.038], [-0.049, -0.078, 0.02], [-0.047, -0.085, 0.007]];

/** Knuckles and finger joints read a touch darker than the backs of the fingers. */
const jointShade = (_p: P, u: number): number => 1 - 0.08 * Math.exp(-(((u - 0.2) / 0.08) ** 2)) - 0.05 * Math.exp(-(((u - 0.6) / 0.08) ** 2));

export function buildHands(b: MeshBuilder, look: Look): void {
  // Hands are a little drier and rougher than the face.
  const skin = paint(look.skinTone, KIND.skin, 0.58);
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    const w = b.at(`hand${side}`);
    const bone = rigid(`hand${side}`);
    const k = Math.sqrt(b.p.w.limb);
    const at = (px: number, py: number, pz: number): P => [w[0] + px * x * k, w[1] + py, w[2] + pz * k];
    b.box(at(0.004, -0.047, 0.004), [0.02 * k, 0.041, 0.04 * k], bone, skin, { round: 0.45, segs: 16 });
    b.ellipsoid(at(-0.014, -0.032, 0.022), [0.014 * k, 0.022, 0.017 * k], bone, skin, { segs: 10 });
    for (const [z, scale, drop, r] of FINGERS) {
      const base = CURL[1];
      const rings: Ring[] = CURL.map(([cx, cy], i) => {
        const rr = r * k * (i === 1 ? 1.08 : 1 - i * 0.03);
        return { c: at(base[0] + (cx - base[0]) * scale, base[1] + (cy - base[1]) * scale - drop, z), rx: rr, rz: rr };
      });
      b.sweep(rings, { sides: 8, sub: 2, capEnd: true, shade: jointShade }, bone, skin);
    }
    const thumb: Ring[] = THUMB.map((p, i) => ({ c: at(p[0], p[1], p[2]), rx: (0.0118 - i * 0.0006) * k, rz: (0.0105 - i * 0.0005) * k }));
    b.sweep(thumb, { sides: 9, sub: 2, capEnd: true, shade: jointShade }, bone, skin);
  }
}

/** Shoe upper stations heel → toe: z from the ankle, half width, height above the ground, inward shift of the toe box. */
const SHOE: readonly (readonly [number, number, number, number])[] = [
  [-0.074, 0.024, 0.05, 0], [-0.066, 0.036, 0.07, 0], [-0.045, 0.04, 0.084, 0], [-0.015, 0.041, 0.094, -0.001],
  [0.02, 0.043, 0.092, -0.002], [0.06, 0.047, 0.078, -0.004], [0.1, 0.05, 0.058, -0.006], [0.14, 0.05, 0.045, -0.008],
  [0.172, 0.045, 0.037, -0.01], [0.196, 0.034, 0.031, -0.011], [0.21, 0.018, 0.025, -0.011],
];

export function buildFeet(b: MeshBuilder, look: Look): void {
  const color = look.shoeColor ?? 0x1a1a1a;
  const sneaker = luma(color) > 0.5 || look.bottom === 'shorts';
  const upper = sneaker ? paint(color, KIND.woven, 0.85) : paint(color, KIND.leather, 0.3);
  const soleColor = sneaker ? blend(0xe8e4dc, color, 0.15) : shade(color, 0.6);
  const sole = paint(soleColor, KIND.rubber, sneaker ? 0.85 : 0.6);
  const lace = paint(sneaker ? tint(color, 0.9, 0.9, 0.9) : shade(color, 0.7), KIND.woven, 0.8);
  const soleH = sneaker ? 0.022 : 0.012;
  const k = Math.sqrt(b.p.w.limb);
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    const a = b.at(`foot${side}`);
    const bone = rigid(`foot${side}`);
    const ring = (z: number, hw: number, y0: number, y1: number, cx: number, n: number): Ring => ({
      c: [a[0] + cx * x * k, (y0 + y1) / 2, a[2] + z], rx: hw * k, rz: Math.max(0.002, (y1 - y0) / 2), n,
    });
    const opts = { sides: 16, sub: 2, capStart: true, capEnd: true, front: [0, 1, 0] as P, side: [1, 0, 0] as P };
    b.sweep(SHOE.map(([z, hw, ht, cx]) => ring(z, hw, soleH - 0.002, ht, cx, 2.5)), opts, bone, upper);
    b.sweep(SHOE.map(([z, hw, , cx]) => ring(z * 1.015, hw + 0.004, 0, soleH, cx, 5)), { ...opts, sides: 14 }, bone, sole);
    if (!sneaker) b.box([a[0], 0.014, a[2] - 0.05], [0.034 * k, 0.014, 0.024], bone, sole, { round: 0.3 });
    // Laces (or a strap seam on dress shoes) across the instep.
    for (let i = 0; i < (sneaker ? 4 : 2); i++) {
      const z = 0.012 + i * 0.022;
      const top = 0.094 - i * 0.008 - (sneaker ? 0 : 0.006);
      b.box([a[0] - 0.002 * x, top, a[2] + z], [0.017 * k, 0.0022, 0.0035], bone, lace, { round: 0.5, segs: 8, rot: [0.5, 0, 0] });
    }
  }
}
