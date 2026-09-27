/** Hair styles as data. Everything is bound to the head bone. */
import type { HairStyle } from '../../core/types';
import { facePt, HEAD_R, headCentre, type Look } from './body';
import { MeshBuilder, shade, type P } from './MeshBuilder';

type HairBuilder = (b: MeshBuilder, color: number) => void;

/** Skull cap: an ellipsoid slice `grow` times the head, tilted back by `tilt`. */
function cap(b: MeshBuilder, color: number, grow: number, tilt: number, polar = 0.55 * Math.PI): void {
  const r: P = [HEAD_R[0] * grow, HEAD_R[1] * grow, HEAD_R[2] * grow];
  b.ball('head', headCentre(b), r, color, { polar: [0, polar], rot: [-tilt, 0, 0], segs: 12 });
}

/** Point on the head ellipsoid (scaled by `grow`) at polar angle `th` from the top, azimuth `ph` from the front. */
function onHead(b: MeshBuilder, th: number, ph: number, grow: number): P {
  const c = headCentre(b);
  const s = b.s * grow;
  return [
    c[0] + HEAD_R[0] * s * Math.sin(th) * Math.sin(ph),
    c[1] + HEAD_R[1] * s * Math.cos(th),
    c[2] + HEAD_R[2] * s * Math.sin(th) * Math.cos(ph),
  ];
}

const long: HairBuilder = (b, color) => {
  cap(b, color, 1.08, 0.2);
  for (const x of [1, -1]) {
    b.box('head', b.at('head', 0.084 * x, 0.075, 0.012), [0.026, 0.17, 0.085], color, { rot: [0, 0, -0.06 * x] });
    b.box('head', facePt(b, 0.036 * x, 0.075, 0.012), [0.06, 0.03, 0.022], color, { rot: [-0.35, 0, -0.45 * x] });
  }
  b.ball('head', b.at('head', 0, 0.06, -0.05), [0.086, 0.135, 0.058], color, { segs: 8 });
  b.box('head', b.at('head', 0, 0.2, 0.06), [0.004, 0.02, 0.05], shade(color, 0.6));
};

const spiky: HairBuilder = (b, color) => {
  cap(b, color, 1.05, 0.25);
  for (let i = 0; i < 12; i++) {
    const th = 0.25 + (i % 3) * 0.3;
    const ph = (i / 12) * Math.PI * 2 + (i % 3) * 0.4;
    const base = onHead(b, th, ph, 1.02);
    const tip = onHead(b, th * 0.85, ph, 1.55);
    b.tube('head', base, tip, 0.024, 0.003, color, { sides: 4 });
  }
};

const perm: HairBuilder = (b, color) => {
  cap(b, color, 1.1, 0.2);
  for (let ring = 0; ring < 4; ring++) {
    const th = 0.3 + ring * 0.38;
    const n = 6 + ring * 2;
    for (let i = 0; i < n; i++) {
      const ph = ((i + ring * 0.5) / n) * Math.PI * 2;
      if (ring === 3 && Math.cos(ph) > 0.2) continue;
      b.ball('head', onHead(b, th, ph, 1.12), [0.028, 0.028, 0.028], shade(color, 0.9 + (i % 2) * 0.15), { segs: 5 });
    }
  }
};

const HAIR: Record<HairStyle, HairBuilder> = {
  long,
  short: (b, c) => cap(b, c, 1.08, 0.25),
  slick: (b, c) => {
    cap(b, c, 1.07, 0.45);
    b.ball('head', b.at('head', 0, 0.13, -0.03), [0.083, 0.08, 0.09], c, { segs: 8 });
  },
  bald: () => {},
  spiky,
  perm,
  bun: (b, c) => {
    cap(b, c, 1.07, 0.3);
    b.ball('head', b.at('head', 0, 0.17, -0.1), [0.045, 0.045, 0.04], c, { segs: 8 });
  },
  crew: (b, c) => cap(b, c, 1.035, 0.3, 0.5 * Math.PI),
};

export function buildHair(b: MeshBuilder, look: Look): void {
  HAIR[look.hair](b, look.hairColor);
}
