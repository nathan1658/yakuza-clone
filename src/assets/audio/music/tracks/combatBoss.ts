import type { TrackDef } from '../types';

/**
 * 160 bpm boss fight in A harmonic minor: taiko, choir, screaming erhu.
 * Level = boss phase: 2 adds distorted power chords, 3 adds string stabs and
 * cymbals and modulates the whole track up a whole tone.
 */
export const combatBoss: TrackDef = {
  id: 'combat_boss',
  bpm: 160,
  gain: 0.5,
  loop: true,
  space: 2.4,
  levelTranspose: [0, 0, 0, 2],
  patterns: {
    drums: {
      taiko: 'X...x..xX...x.x. | X...x..xX...xXxX',
      kick: 'X.x...x.X.x...x. | X.x...x.X.x...x.',
      snare: '....X.......X... | ....X.......X.xx',
      hat: 'x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.x.',
    },
    luo: { luo: '................ | ................ | ................ | ............X...' },
    cymbals: {
      crash: 'X............... | ................',
      ohat: '..x...x...x...x. | ..x...x...x...x.',
    },
    choir: 'C:16',
    bass: 'r:2! r r r:2 r r r:2 r r r:2 r:2',
    stabs: 'C:2! .:6 C:2! .:2 C:2 .:2',
    themeA: 'A5:4! ~C6:2 B5:2 A5:4 E5:4 | F5:4 A5:4 ~C6:6 A5:2 | G5:4 ~B5:4 D6:4 B5:4 | ~G#5:8 E5:4 B5:4',
    themeB: 'E6:4! D6:2 C6:2 B5:4 A5:4 | C6:4 A5:4 F5:4 ~A5:4 | B5:4 G5:4 D5:4 G5:4 | ~B5:6 A5:2 G#5:8',
  },
  sections: {
    a: {
      bars: 4,
      chords: ['Am', 'F', 'G', 'E'],
      layers: [
        { pat: 'drums', vol: 0.85 },
        { pat: 'luo', vol: 0.6 },
        { pat: 'cymbals', vol: 0.6, min: 3 },
        { inst: 'choir', pat: 'choir', oct: 12, vol: 0.8 },
        { inst: 'bass', pat: 'bass', oct: -12, vol: 0.75 },
        { inst: 'power', pat: 'bass', oct: -12, vol: 0.7, pan: -0.25, min: 2 },
        { inst: 'strings', pat: 'stabs', oct: 12, vol: 0.9, pan: 0.25, min: 3 },
        { inst: 'erhuHot', pat: 'themeA', vol: 1, pan: 0.1 },
      ],
    },
    b: {
      bars: 4,
      chords: ['F', 'G', 'Am', 'E'],
      layers: [
        { pat: 'drums', vol: 0.85 },
        { pat: 'luo', vol: 0.6 },
        { pat: 'cymbals', vol: 0.6, min: 3 },
        { inst: 'choir', pat: 'choir', oct: 12, vol: 0.8 },
        { inst: 'bass', pat: 'bass', oct: -12, vol: 0.75 },
        { inst: 'power', pat: 'bass', oct: -12, vol: 0.7, pan: -0.25, min: 2 },
        { inst: 'strings', pat: 'stabs', oct: 12, vol: 0.9, pan: 0.25, min: 3 },
        { inst: 'erhuHot', pat: 'themeB', vol: 1, pan: 0.1 },
      ],
    },
  },
  form: ['a', 'b'],
};
