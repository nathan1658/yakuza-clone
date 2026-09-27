import type { TrackDef } from '../types';

/** 150 bpm street brawl in E minor: palm-muted power-chord riffs, bass doubling, punchy drums, pentatonic lead hook, a bridge. */
export const combatStreet: TrackDef = {
  id: 'combat_street',
  bpm: 150,
  gain: 0.55,
  loop: true,
  space: 1.4,
  patterns: {
    hit: 'E2:16!',
    fill: {
      crash: 'X............... | ................',
      kick: 'X............... | X.......X...X...',
      tomHi: '................ | ....x.x.........',
      tomLo: '................ | ........x.x.....',
      snare: '................ | x.x.....x.x.XXXX',
    },
    riff: 'E2:2! E2 E2 E2:2 G2:2! E2 E2 A2:2! G2:2 D2:2 | E2:2! E2 E2 E2:2 B2:2! E2 E2 D3:2! B2:2 A2:2',
    drums: {
      kick: 'X.....x.X.x..... | X.....x.X.x...x.',
      snare: '....X.......X... | ....X.......X..o',
      hat: 'x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.x.',
    },
    drumsB: {
      crash: 'X............... | ................ | ................ | ................',
      kick: 'X.....x.X.x..... | X.....x.X.x...x. | X.....x.X.x..... | X.....x.X.x.X.X.',
      snare: '....X.......X... | ....X.......X... | ....X.......X... | ....X.......XxXX',
      ohat: '..x...x...x...x. | ..x...x...x...x. | ..x...x...x...x. | ..x...x.........',
    },
    hook: 'B4:2! D5:2 E5:4 ~G5:2 E5:2 D5:2 B4:2 | A4:3 B4:3 D5:2 ~E5:8'
      + ' | B4:2 D5:2 E5:4 G5:2 A5:2 G5:2 E5:2 | ~D5:4 B4:4 A4:2 G4:2 E4:4',
    bridge: 'C3:3! C3:3 C3:2 D3:3! D3:3 D3:2 | E3:3! E3:3 E3:2 E3 E3 G3:2 A3:2 B3:2',
    bridgeDrums: {
      kick: 'X...X...X...X... | X...X...X...X...',
      snare: '....X.......X... | ....X.......X.XX',
      tomHi: '................ | ........x.x.....',
      crash: 'X............... | ................',
    },
    bridgeLead: 'G5:6 E5:2 A5:8 | ~B5:8 A5:2 G5:2 E5:4',
  },
  sections: {
    intro: {
      bars: 2,
      layers: [
        { pat: 'fill', vol: 0.9 },
        { inst: 'power', pat: 'hit', vol: 0.8 },
        { inst: 'bass', pat: 'hit', vol: 0.7 },
      ],
    },
    a: {
      bars: 4,
      layers: [
        { pat: 'drums', vol: 0.9 },
        { inst: 'power', pat: 'riff', vol: 0.8, pan: -0.25 },
        { inst: 'bass', pat: 'riff', vol: 0.75 },
      ],
    },
    b: {
      bars: 4,
      layers: [
        { pat: 'drums', vol: 0.9 },
        { pat: 'drumsB', vol: 0.7 },
        { inst: 'power', pat: 'riff', vol: 0.7, pan: -0.25 },
        { inst: 'bass', pat: 'riff', vol: 0.75 },
        { inst: 'lead', pat: 'hook', vol: 1, pan: 0.2 },
      ],
    },
    bridge: {
      bars: 4,
      layers: [
        { pat: 'bridgeDrums', vol: 0.9 },
        { inst: 'power', pat: 'bridge', vol: 0.8, pan: -0.25 },
        { inst: 'bass', pat: 'bridge', oct: -12, vol: 0.75 },
        { inst: 'erhuHot', pat: 'bridgeLead', vol: 0.9, pan: 0.2 },
      ],
    },
  },
  form: ['intro', 'a', 'b', 'a', 'bridge', 'b'],
  loopFrom: 1,
};
