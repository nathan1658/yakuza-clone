/** Bottoms as data: leg coverage plus belt/pocket/hem details. */
import type { BottomStyle } from '../../core/types';
import type { Dress, Look } from './body';
import { MeshBuilder, shade } from './MeshBuilder';

interface BottomSpec {
  /** Fraction of the leg (hip to ankle) covered. */
  leg: number;
  belt?: number;
  pockets?: boolean;
  cuffs?: boolean;
  skirt?: boolean;
}

const BOTTOMS: Record<BottomStyle, BottomSpec> = {
  jeans: { leg: 1, belt: 0x3a2616, pockets: true, cuffs: true },
  slacks: { leg: 1, belt: 0x141414 },
  shorts: { leg: 0.36, belt: 0x2a2a2a },
  skirt: { leg: 0, skirt: true },
};

export function bottomDress(look: Look): Pick<Dress, 'leg' | 'pants'> {
  return { leg: BOTTOMS[look.bottom].leg, pants: look.bottomColor };
}

export function buildBottom(b: MeshBuilder, look: Look): void {
  const spec = BOTTOMS[look.bottom];
  const w = b.p.w;
  const r = 0.15 * w.hip;
  const depth = 0.7 * w.depth / w.torso;
  if (spec.belt !== undefined) {
    b.tube('hips', b.at('hips', 0, 0.03), b.at('hips', 0, 0.065), r + 0.012, r + 0.01, spec.belt, { depth, open: true });
    b.box('hips', b.at('hips', 0, 0.047, r * depth + 0.012), [0.04, 0.03, 0.01], 0xb8a060);
  }
  if (spec.pockets) {
    for (const x of [0.06, -0.06]) b.box('hips', b.at('hips', x * w.hip, -0.06, -r * depth - 0.004), [0.07, 0.07, 0.006], shade(look.bottomColor, 0.82));
  }
  if (spec.cuffs) {
    for (const s of ['L', 'R'] as const) {
      const foot = `foot${s}` as const;
      b.tube(`shin${s}`, b.at(foot, 0, 0.07), b.at(foot, 0, 0.02), 0.05 * w.limb, 0.05 * w.limb, shade(look.bottomColor, 1.15), { sides: 9, open: true });
    }
  }
  if (spec.skirt) {
    b.tube('hips', b.at('hips', 0, 0.02), b.at('hips', 0, -0.44), r + 0.01, 0.2 * w.hip, look.bottomColor, { depth, open: true, sides: 12 });
  }
}
