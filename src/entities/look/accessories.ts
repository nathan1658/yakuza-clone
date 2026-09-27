/** Accessories as data: each one is a handful of parts on the right bone. */
import type { Accessory } from '../../core/types';
import { facePt, HEAD_R, headCentre, type Look } from './body';
import { MeshBuilder } from './MeshBuilder';

const GOLD = 0xd4a93a;
const DARK_LENS = 0x0c0c10;
const FRAME = 0x2a2a2a;
const INK = 0x24354a;
const BAND = 0xb02020;
const CAP = 0x2c3e66;
const WATCH = 0xb8b8c0;
const PAPER = 0xefeae0;
const EMBER = 0xff6a1a;

type AccessoryBuilder = (b: MeshBuilder, look: Look) => void;

const EAR_X = HEAD_R[0] - 0.002;

function templeArms(b: MeshBuilder, color: number): void {
  for (const x of [1, -1]) b.box('head', b.at('head', 0.078 * x, 0.12, -0.005), [0.004, 0.006, 0.09], color);
}

const sunglasses: AccessoryBuilder = (b) => {
  b.box('head', facePt(b, 0, 0.012, 0.006), [0.13, 0.026, 0.012], DARK_LENS);
  templeArms(b, DARK_LENS);
};

const glasses: AccessoryBuilder = (b) => {
  for (const x of [1, -1]) b.ring('head', facePt(b, 0.032 * x, 0.012, 0.008), 0.017, 0.0028, FRAME);
  b.box('head', facePt(b, 0, 0.016, 0.008), [0.028, 0.004, 0.004], FRAME);
  templeArms(b, FRAME);
};

const goldChain: AccessoryBuilder = (b) => {
  b.ring('chest', b.at('chest', 0, 0.2, 0.012), 0.078, 0.006, GOLD, { rot: [Math.PI / 2 + 0.45, 0, 0] });
};

const cigarette: AccessoryBuilder = (b) => {
  const a = facePt(b, 0.018, -0.054, 0.002);
  const tip: [number, number, number] = [a[0] + 0.03 * b.s, a[1] - 0.012 * b.s, a[2] + 0.055 * b.s];
  b.tube('head', a, tip, 0.0045, 0.0045, PAPER, { sides: 5 });
  const end: [number, number, number] = [tip[0] + 0.004 * b.s, tip[1] - 0.0016 * b.s, tip[2] + 0.007 * b.s];
  b.tube('head', tip, end, 0.0048, 0.0048, EMBER, { sides: 5, glow: 1.5 });
};

const watch: AccessoryBuilder = (b, look) => {
  const r = 0.036 * b.p.w.limb;
  b.ring('forearmL', b.at('handL', 0, 0.035), r, 0.008, WATCH, { rot: [Math.PI / 2, 0, 0] });
  b.box('forearmL', b.at('handL', r + 0.004, 0.035), [0.006, 0.024, 0.024], look.female ? GOLD : 0x202020);
};

const headband: AccessoryBuilder = (b) => {
  const c = headCentre(b);
  const lo: [number, number, number] = [c[0], c[1] + 0.03 * b.s, c[2]];
  const hi: [number, number, number] = [c[0], c[1] + 0.058 * b.s, c[2]];
  b.tube('head', lo, hi, HEAD_R[0] + 0.006, HEAD_R[0] + 0.003, BAND, { depth: HEAD_R[2] / HEAD_R[0], open: true, sides: 12 });
  for (const x of [0.012, -0.012]) b.box('head', b.at('head', x, 0.1, -0.1), [0.018, 0.09, 0.006], BAND, { rot: [0.35, 0, x * 12] });
};

const tattooArms: AccessoryBuilder = (b) => {
  const limb = b.p.w.limb;
  for (const s of ['L', 'R'] as const) {
    // Tubes along -Y are rotated pi about Z, so theta pi..2pi lands on the outer (+X) side of the left arm.
    // Half arcs of 4 sides put the ink's vertices on the 8-sided arm's, so a sleeve (+6 mm) always covers it.
    const sign = s === 'L' ? 1 : -1;
    const ink = { sides: 4, open: true, theta: [s === 'L' ? Math.PI : 0, Math.PI] as const };
    b.tube(`upperArm${s}`, b.at(`upperArm${s}`, 0, -0.03), b.at(`forearm${s}`, 0, 0.02), 0.052 * limb + 0.003, 0.043 * limb + 0.003, INK, ink);
    b.tube(`forearm${s}`, b.at(`forearm${s}`, 0, -0.03), b.at(`hand${s}`, 0, 0.02), 0.042 * limb + 0.003, 0.033 * limb + 0.003, INK, ink);
    b.box(`hand${s}`, b.at(`hand${s}`, sign * (0.025 * Math.sqrt(limb) + 0.002), -0.05), [0.004, 0.045, 0.05], INK);
  }
};

const earring: AccessoryBuilder = (b) => {
  b.ball('head', b.at('head', EAR_X + 0.004, 0.072, -0.004), [0.006, 0.006, 0.006], GOLD, { segs: 5 });
};

const cap: AccessoryBuilder = (b) => {
  const c = headCentre(b);
  b.ball('head', [c[0], c[1] + 0.012 * b.s, c[2]], [HEAD_R[0] * 1.12, HEAD_R[1] * 0.95, HEAD_R[2] * 1.1], CAP, { polar: [0, 0.5 * Math.PI], segs: 12 });
  b.box('head', b.at('head', 0, 0.118, 0.125), [0.15, 0.008, 0.09], CAP, { rot: [-0.12, 0, 0] });
};

const ACCESSORIES: Record<Accessory, AccessoryBuilder> = {
  sunglasses, goldChain, cigarette, watch, headband, tattooArms, earring, glasses, cap,
};

export function buildAccessories(b: MeshBuilder, look: Look): void {
  for (const a of look.accessories ?? []) ACCESSORIES[a](b, look);
}
