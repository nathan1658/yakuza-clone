import type { TrackDef } from '../types';

/** 88 bpm late-night city pop / lo-fi: FM electric piano, synth bass, soft swung drums, vinyl hiss, a sax-like lead. */
export const exploreNight: TrackDef = {
  id: 'explore_night',
  bpm: 88,
  gain: 0.75,
  swing: 0.14,
  loop: true,
  space: 1.8,
  patterns: {
    comp: 'C:4 . . C:2? C:6 . .',
    bass: 'r:3 r . r\':2 r:2 c3:2 . r:2 r\':2?',
    drums: {
      kick: 'X......x..X..... | X......x..X...x.',
      snare: '....x.......x... | ....x.......x..o',
      hat: 'x.o.x.o.x.o.x.oo | x.o.x.o.x.o.x.o.',
    },
    vinyl: 'C4:64',
    pad: 'C:16',
    saxA: '.:4 A4:2 C5:2 ~D5:4 E5:2 D5:2 | C5:3 A4:3 G4:2 A4:8 | .:8 E5:2 G5:2 A5:2 G5:2 | ~E5:6 D5:2 C5:8',
    saxB: '.:8 G5:2 A5:2 C6:4 | ~B5:4 A5:2 G5:2 E5:8 | .:4 D5:2 E5:2 G5:4 E5:4 | D5:4 C5:4 A4:8',
  },
  sections: {
    a: {
      bars: 4,
      chords: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
      layers: [
        { inst: 'ep', pat: 'comp', oct: 12, vol: 0.9 },
        { inst: 'bass', pat: 'bass', oct: -12, vol: 0.8 },
        { pat: 'drums', vol: 0.55 },
        { inst: 'vinyl', pat: 'vinyl', vol: 1 },
      ],
    },
    b: {
      bars: 4,
      chords: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
      layers: [
        { inst: 'ep', pat: 'comp', oct: 12, vol: 0.8 },
        { inst: 'bass', pat: 'bass', oct: -12, vol: 0.8 },
        { pat: 'drums', vol: 0.55 },
        { inst: 'vinyl', pat: 'vinyl', vol: 1 },
        { inst: 'sax', pat: 'saxA', vol: 0.9, pan: 0.15 },
      ],
    },
    c: {
      bars: 4,
      chords: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
      layers: [
        { inst: 'ep', pat: 'comp', oct: 12, vol: 0.7 },
        { inst: 'pad', pat: 'pad', oct: 12, vol: 0.6 },
        { inst: 'bass', pat: 'bass', oct: -12, vol: 0.8 },
        { pat: 'drums', vol: 0.55 },
        { inst: 'vinyl', pat: 'vinyl', vol: 1 },
        { inst: 'sax', pat: 'saxB', vol: 0.9, pan: -0.15 },
      ],
    },
  },
  form: ['a', 'b', 'a', 'c'],
};
