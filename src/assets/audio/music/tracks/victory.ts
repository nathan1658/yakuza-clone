import type { TrackDef } from '../types';

/** Four-bar D major fanfare that plays once: brass hits, erhu call, taiko, a final gong. */
export const victory: TrackDef = {
  id: 'victory',
  bpm: 132,
  gain: 0.8,
  loop: false,
  space: 2.4,
  patterns: {
    brass: 'C:4! C:2 C:2 C:8 | C:4! C:2 C:2 C:8 | C:4! C:2 C:2 C:8 | C:16!',
    bass: 'r:4! r:4 r:8 | r:4! r:4 r:8 | r:4! r:4 r:8 | r:16!',
    call: 'D5:2! F#5:2 A5:4 D6:8 | B5:2 G5:2 D5:4 B5:8 | C#6:2 A5:2 E5:4 ~A5:8 | D6:16!',
    drums: {
      taiko: 'X.......X....... | X.......X....... | X.......X...X.X. | X...............',
      kick: 'X.....x.X....... | X.....x.X....... | X.....x.X....... | X...............',
      snare: '....X.......X... | ....X.......X... | ....X.......xxxx | ................',
      crash: 'X............... | ................ | ................ | X...............',
      gong: '................ | ................ | ................ | X...............',
    },
  },
  sections: {
    fanfare: {
      bars: 4,
      chords: ['D', 'G', 'A', 'D'],
      layers: [
        { pat: 'drums', vol: 0.8 },
        { inst: 'brass', pat: 'brass', oct: 12, vol: 0.9 },
        { inst: 'bass', pat: 'bass', oct: -12, vol: 0.7 },
        { inst: 'erhu', pat: 'call', vol: 1 },
      ],
    },
  },
  form: ['fanfare'],
};
