import type { TrackDef } from '../types';

/** 72 bpm by the typhoon shelter: rippling guitar arpeggios, a dizi melody, a watery pad. */
export const exploreHarbour: TrackDef = {
  id: 'explore_harbour',
  bpm: 72,
  gain: 0.8,
  loop: true,
  space: 3.2,
  patterns: {
    arp: 'r:2 c3:2 c4:2 c2\':2 c3\':2 c2\':2 c4:2 c3:2',
    pad: 'C:16',
    sub: 'r:12 r:4?',
    ticks: { rim: '........o....... | ........o.....o.', hat: 'o...o...o...o... | o...o...o...o.o.' },
    dizi: 'A4:6 ~C5:2 D5:8 | F5:4 D5:4 C5:4 A4:4 | G4:6 A4:2 C5:4 ~D5:4 | D5:12 .:4'
      + ' | F5:6 G5:2 A5:8 | G5:4 F5:4 D5:4 C5:4 | A4:6 C5:2 D5:4 F5:4 | ~D5:16',
  },
  sections: {
    a: {
      bars: 4,
      chords: ['Dm9', 'Bbmaj7', 'Fadd9', 'Csus2'],
      layers: [
        { inst: 'guitar', pat: 'arp', vol: 0.9, pan: -0.15 },
        { inst: 'glass', pat: 'pad', oct: 12, vol: 0.8 },
        { inst: 'sub', pat: 'sub', oct: -12, vol: 0.6 },
      ],
    },
    b: {
      bars: 8,
      chords: ['Dm9', 'Bbmaj7', 'Fadd9', 'Csus2'],
      layers: [
        { inst: 'guitar', pat: 'arp', vol: 0.8, pan: -0.15 },
        { inst: 'glass', pat: 'pad', oct: 12, vol: 0.7 },
        { inst: 'sub', pat: 'sub', oct: -12, vol: 0.6 },
        { pat: 'ticks', vol: 0.35 },
        { inst: 'dizi', pat: 'dizi', vol: 1, pan: 0.15 },
      ],
    },
  },
  form: ['a', 'b'],
};
