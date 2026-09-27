/** Named character looks and the random civilian generator. */
import type { Accessory, AppearancePreset, BottomStyle, HairStyle, TopStyle } from '../../core/types';
import type { Look } from './body';

type Named = Exclude<AppearancePreset, 'pedestrian'>;

export const PRESETS: Record<Named, Look> = {
  hoNam: {
    height: 1.78, build: 'slim', skinTone: 0xd09a70, hair: 'long', hairColor: 0x0d0d0f,
    top: 'shirt', topColor: 0x151515, topAccent: 0xe8e8e8, bottom: 'jeans', bottomColor: 0x2e4a6e, shoeColor: 0x1a1a1a,
  },
  chicken: {
    height: 1.75, build: 'normal', skinTone: 0xc68e62, hair: 'spiky', hairColor: 0xe8d27a,
    top: 'hawaiian', topColor: 0xd8342a, topAccent: 0xf2d23c, bottom: 'slacks', bottomColor: 0xcfc6a8, shoeColor: 0x6a4a2a,
    accessories: ['goldChain', 'earring'],
  },
  crow: {
    height: 1.88, build: 'muscular', skinTone: 0xb98258, hair: 'slick', hairColor: 0x0a0a0a,
    top: 'leather', topColor: 0x121212, topAccent: 0xa01818, bottom: 'slacks', bottomColor: 0x1a1a1a, shoeColor: 0x0e0e0e,
    accessories: ['sunglasses', 'goldChain', 'cigarette', 'tattooArms'],
  },
  tsGoonA: {
    height: 1.76, build: 'muscular', skinTone: 0xb07a4f, hair: 'crew', hairColor: 0x151515,
    top: 'tank', topColor: 0x1c1c1c, bottom: 'jeans', bottomColor: 0x33475e, accessories: ['tattooArms'],
  },
  tsGoonB: {
    height: 1.73, build: 'normal', skinTone: 0xc68e62, hair: 'short', hairColor: 0x1a1410,
    top: 'hawaiian', topColor: 0x2a6a8a, topAccent: 0xe0b040, bottom: 'slacks', bottomColor: 0x2a2a2a, accessories: ['goldChain'],
  },
  tsGoonC: {
    height: 1.72, build: 'slim', skinTone: 0xd6a07a, hair: 'spiky', hairColor: 0x121212,
    top: 'tshirt', topColor: 0x7a1d1d, bottom: 'jeans', bottomColor: 0x3a4a5a, accessories: ['headband'],
  },
  tsGoonD: {
    height: 1.8, build: 'heavy', skinTone: 0xb98258, hair: 'short', hairColor: 0xd8c48a,
    top: 'vest', topColor: 0x2d2d2d, topAccent: 0xd0d0d0, bottom: 'jeans', bottomColor: 0x223344, accessories: ['earring', 'cigarette'],
  },
  tsLieutenant: {
    height: 1.86, build: 'heavy', skinTone: 0xc08a60, hair: 'slick', hairColor: 0x101010,
    top: 'suit', topColor: 0x2a2a30, topAccent: 0xd0d0d0, bottom: 'slacks', bottomColor: 0x2a2a30, shoeColor: 0x0e0e0e,
    accessories: ['sunglasses', 'watch'],
  },
  vendorAuntie: {
    height: 1.56, build: 'heavy', female: true, skinTone: 0xd6a07a, hair: 'perm', hairColor: 0x2a2018,
    top: 'apron', under: 'tshirt', topColor: 0x6f8fb0, topAccent: 0xc86a7a, bottom: 'slacks', bottomColor: 0x3a3a44, shoeColor: 0x2a2a2a,
  },
  chaChaanTengBoss: {
    height: 1.7, build: 'heavy', skinTone: 0xc68e62, hair: 'crew', hairColor: 0x1a1a1a,
    top: 'apron', under: 'singlet', topColor: 0xe0dcd0, topAccent: 0xf2f2f2, bottom: 'slacks', bottomColor: 0x2e2e2e,
    accessories: ['watch'],
  },
  newsstandUncle: {
    height: 1.66, build: 'slim', skinTone: 0xc08a60, hair: 'short', hairColor: 0x8a8a8a,
    top: 'shirt', topColor: 0x9aa38a, bottom: 'slacks', bottomColor: 0x4a4238, shoeColor: 0x3a2a20, accessories: ['glasses', 'cap'],
  },
  fishermanUncle: {
    height: 1.64, build: 'slim', skinTone: 0xb07a52, hair: 'bald', hairColor: 0x9a9a9a,
    top: 'singlet', topColor: 0xefefe8, bottom: 'shorts', bottomColor: 0x4a5a6a, shoeColor: 0x3a2a20,
  },
  debtor: {
    height: 1.7, build: 'slim', skinTone: 0xd0a07a, hair: 'short', hairColor: 0x1c1a18,
    top: 'shirt', topColor: 0x8c8466, bottom: 'slacks', bottomColor: 0x3d3a33, shoeColor: 0x2a2520,
  },
  pagerOwner: {
    height: 1.62, build: 'slim', female: true, skinTone: 0xe0b08a, hair: 'long', hairColor: 0x1e1612,
    top: 'jacket', topColor: 0x4a6fa5, topAccent: 0xf0f0f0, bottom: 'skirt', bottomColor: 0x1a1a1a, shoeColor: 0x1a1a1a,
    accessories: ['earring'],
  },
};

type Rng = () => number;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length) % xs.length];

const SKIN = [0xe0b08a, 0xd6a07a, 0xd09a70, 0xc68e62, 0xb98258, 0xb07a4f] as const;
const HAIR_COLORS = [0x0d0d0f, 0x151210, 0x1e1612, 0x2a2018, 0x3a2a1c, 0x6a6a6a] as const;
const CLOTH = [0xe8e8e0, 0x2a2a2a, 0x3a4a6a, 0x6a2a2a, 0x2f5a3a, 0x8a7a5a, 0x5a5a6a, 0xa8b8c8, 0xc8a878, 0x4a3a5a, 0x7a8a9a] as const;
const DENIM = [0x2e4a6e, 0x3a4a5a, 0x223344, 0x2a2a2a, 0x4a4238, 0x5a5448, 0x1e1e24] as const;
const SHOES = [0x1a1a1a, 0x3a2a20, 0xe8e8e0, 0x2a2a2a, 0x5a4030] as const;

interface Wardrobe {
  hair: readonly HairStyle[];
  top: readonly TopStyle[];
  bottom: readonly BottomStyle[];
  height: readonly [number, number];
}

const MEN: Wardrobe = {
  hair: ['short', 'short', 'crew', 'slick', 'bald', 'spiky'],
  top: ['tshirt', 'tshirt', 'shirt', 'shirt', 'jacket', 'singlet', 'suit', 'vest'],
  bottom: ['jeans', 'slacks', 'slacks', 'shorts'],
  height: [1.62, 1.82],
};

const WOMEN: Wardrobe = {
  hair: ['long', 'long', 'bun', 'perm', 'short'],
  top: ['tshirt', 'shirt', 'jacket', 'vest'],
  bottom: ['jeans', 'slacks', 'skirt', 'skirt'],
  height: [1.52, 1.68],
};

const BUILDS = ['slim', 'slim', 'normal', 'normal', 'normal', 'heavy'] as const;
const EXTRAS: readonly (readonly [Accessory, number])[] = [['glasses', 0.15], ['watch', 0.3], ['cap', 0.1], ['cigarette', 0.05]];

export function randomLook(rng: Rng = Math.random): Look {
  const female = rng() < 0.45;
  const w = female ? WOMEN : MEN;
  const top = pick(rng, w.top);
  const open = top === 'jacket' || top === 'vest' || top === 'suit';
  return {
    height: w.height[0] + rng() * (w.height[1] - w.height[0]),
    build: pick(rng, BUILDS),
    female,
    skinTone: pick(rng, SKIN),
    hair: pick(rng, w.hair),
    hairColor: pick(rng, HAIR_COLORS),
    top,
    topColor: pick(rng, CLOTH),
    topAccent: open ? pick(rng, CLOTH) : undefined,
    bottom: pick(rng, w.bottom),
    bottomColor: pick(rng, DENIM),
    shoeColor: pick(rng, SHOES),
    accessories: EXTRAS.filter(([, p]) => rng() < p).map(([a]) => a),
  };
}
