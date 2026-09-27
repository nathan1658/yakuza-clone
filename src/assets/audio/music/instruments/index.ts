import type { InstId, Instrument } from '../types';
import { clap, closedHat, crash, kick, openHat, rim, snare, tomHi, tomLo } from './drums';
import { guitar, power } from './guitars';
import { bass, bell, ep, piano, sub } from './keys';
import { dizi, erhu, erhuHot, lead, sax } from './leads';
import { brass, choir, glass, pad, pulse, strings, vinyl } from './pads';
import { block, gong, luo, taiko } from './perc';

export const INSTRUMENTS: Readonly<Record<InstId, Instrument>> = {
  kick, snare, hat: closedHat, ohat: openHat, clap, tomHi, tomLo, rim, crash,
  bass, sub, ep, piano, bell,
  pad, strings, choir, glass, brass, pulse, vinyl,
  erhu, erhuHot, dizi, sax, lead,
  guitar, power,
  taiko, gong, luo, block,
};

/**
 * Pitch-less one-shot hits: the only voices allowed in drum grids. (vinyl ignores
 * pitch too, but it is a sustained bed that needs a note length, so it lives in note patterns.)
 */
export const UNPITCHED: ReadonlySet<InstId> = new Set<InstId>([
  'kick', 'snare', 'hat', 'ohat', 'clap', 'tomHi', 'tomLo', 'rim', 'crash', 'taiko', 'gong', 'luo', 'block',
]);
