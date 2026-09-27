import type { TrackDef } from '../types';

/** 68 bpm Cantopop ballad: piano over a walking-down bass, strings, and the brotherhood theme on erhu (then dizi above it). */
export const ending: TrackDef = {
  id: 'ending',
  bpm: 68,
  gain: 1,
  loop: true,
  space: 3.2,
  patterns: {
    piano: 'r,:4 c1\':2 c2\':2 c3\':4 c2\':4',
    strings: 'C:16',
    root: 'r:16',
    theme: 'E5:6 D5:2 C5:4 D5:4 | ~E5:6 G5:2 D5:8 | C5:6 D5:2 E5:4 G5:4 | ~A5:4 G5:4 E5:8'
      + ' | A4:4 C5:4 F5:6 E5:2 | ~E5:4 D5:4 C5:4 E5:4 | D5:6 E5:2 F5:4 A5:4 | ~G5:12 .:4',
    drums: {
      kick: 'X.......X....... | X.......X.....x.',
      rim: '....x.......x... | ....x.......x...',
      hat: 'o.o.o.o.o.o.o.o. | o.o.o.o.o.o.o.o.',
    },
  },
  sections: {
    a: {
      bars: 8,
      chords: ['C', 'G/B', 'Am', 'Em/G', 'F', 'C/E', 'Dm7', 'G'],
      layers: [
        { inst: 'piano', pat: 'piano', vol: 1 },
        { inst: 'strings', pat: 'strings', vol: 0.5 },
      ],
    },
    b: {
      bars: 8,
      chords: ['C', 'G/B', 'Am', 'Em/G', 'F', 'C/E', 'Dm7', 'G'],
      layers: [
        { inst: 'piano', pat: 'piano', vol: 0.9 },
        { inst: 'strings', pat: 'strings', vol: 0.6 },
        { inst: 'erhu', pat: 'theme', vol: 1, pan: 0.1 },
      ],
    },
    c: {
      bars: 8,
      chords: ['C', 'G/B', 'Am', 'Em/G', 'F', 'C/E', 'Dm7', 'G'],
      layers: [
        { inst: 'piano', pat: 'piano', vol: 0.9 },
        { inst: 'strings', pat: 'strings', oct: 12, vol: 0.55 },
        { inst: 'sub', pat: 'root', oct: -12, vol: 0.5 },
        { pat: 'drums', vol: 0.45 },
        { inst: 'erhu', pat: 'theme', vol: 0.9, pan: 0.15 },
        { inst: 'dizi', pat: 'theme', oct: 12, vol: 0.6, pan: -0.2 },
      ],
    },
  },
  form: ['a', 'b', 'c'],
  loopFrom: 1,
};
