import type { TrackDef } from '../types';

/** 70 bpm. A gong, low strings, then a heroic minor erhu theme over Am–F–G–Em that builds. */
export const title: TrackDef = {
  id: 'title',
  bpm: 70,
  gain: 0.8,
  loop: true,
  space: 3,
  patterns: {
    hold: 'C:16',
    root: 'r:16',
    gongIntro: {
      gong: 'X............... | ................',
      luo: '................ | ........x...x.X.',
      taiko: '................ | X.......x.x.xxxX',
    },
    pulse: { taiko: 'X.......x.....x. | X.......x...x.x.' },
    march: {
      taiko: 'X.......x.....x. | X.......x...X.x.',
      kick: 'X.......X.....x. | X.......X.......',
      snare: '....X.......X... | ....X.......X.xx',
      hat: 'x.o.x.o.x.o.x.o. | x.o.x.o.x.o.x.o.',
    },
    crash4: {
      crash: 'X............... | ................ | ................ | ................',
      gong: '................ | ................ | ................ | ........X.......',
    },
    swell: 'C:8 C:8!',
    themeA: 'E5:6 G5:2 A5:4 G5:2 E5:2 | D5:6 E5:2 C5:4 A4:4 | ~B4:4 D5:4 G5:6 E5:2 | E5:12 .:4',
    themeB: 'A5:6 C6:2 B5:4 A5:2 G5:2 | A5:6 G5:2 E5:4 C5:4 | D5:4 E5:4 G5:4 ~A5:4 | B5:8 ~A5:4 E5:4',
  },
  sections: {
    intro: {
      bars: 2,
      chords: ['Am'],
      layers: [
        { pat: 'gongIntro', vol: 0.9 },
        { inst: 'strings', pat: 'hold', vol: 0.8 },
        { inst: 'sub', pat: 'root', oct: -12, vol: 0.7 },
      ],
    },
    a: {
      bars: 4,
      chords: ['Am', 'F', 'G', 'Em'],
      layers: [
        { pat: 'pulse', vol: 0.6 },
        { inst: 'strings', pat: 'hold', vol: 0.8 },
        { inst: 'sub', pat: 'root', oct: -12, vol: 0.7 },
        { inst: 'erhu', pat: 'themeA', vol: 1, pan: 0.1 },
      ],
    },
    b: {
      bars: 4,
      chords: ['Am', 'F', 'G', 'Em'],
      layers: [
        { pat: 'march', vol: 0.75 },
        { pat: 'crash4', vol: 0.7 },
        { inst: 'strings', pat: 'hold', oct: 12, vol: 0.6, pan: -0.2 },
        { inst: 'brass', pat: 'swell', vol: 0.8 },
        { inst: 'bass', pat: 'root', oct: -12, vol: 0.6 },
        { inst: 'erhu', pat: 'themeB', vol: 1, pan: 0.1 },
      ],
    },
  },
  form: ['intro', 'a', 'a', 'b', 'b'],
  loopFrom: 1,
};
