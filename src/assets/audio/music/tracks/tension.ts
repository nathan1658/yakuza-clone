import type { TrackDef } from '../types';

/** 100 bpm suspense: A drone, ticking hats and wood block, a heartbeat kick, dissonant pulses; no melody. */
export const tension: TrackDef = {
  id: 'tension',
  bpm: 100,
  gain: 0.8,
  loop: true,
  space: 2.6,
  patterns: {
    drone: 'A2:64',
    clash: '.:32 Bb2:32',
    sub: 'A1:64',
    ticks: {
      hat: 'x.o.x.o.x.o.x.o. | x.o.x.o.x.o.x.oo',
      block: 'x...x...x...x... | x...x...x...x...',
      kick: 'X..x............ | X..x............',
    },
    toms: { tomLo: '................ | ................ | ................ | ........x...x.X.' },
    pulses: 'A3:3 . A3:3 . Bb3:3 . A3:3 . | A3:3 . Eb4:3 . D4:3 . Bb3:3 .',
  },
  sections: {
    a: {
      bars: 4,
      layers: [
        { inst: 'strings', pat: 'drone', vol: 0.8 },
        { inst: 'sub', pat: 'sub', vol: 0.6 },
        { pat: 'ticks', vol: 0.5 },
        { inst: 'pulse', pat: 'pulses', vol: 0.8, pan: 0.2 },
      ],
    },
    b: {
      bars: 4,
      layers: [
        { inst: 'strings', pat: 'drone', vol: 0.8 },
        { inst: 'strings', pat: 'clash', oct: 12, vol: 0.5, pan: -0.3 },
        { inst: 'sub', pat: 'sub', vol: 0.6 },
        { pat: 'ticks', vol: 0.5 },
        { pat: 'toms', vol: 0.6 },
        { inst: 'pulse', pat: 'pulses', vol: 0.8, pan: 0.2 },
      ],
    },
  },
  form: ['a', 'b'],
};
