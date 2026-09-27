import { describe, expect, it } from 'vitest';
import type { Accessory, BottomStyle, CharacterAppearance, HairStyle, TopStyle } from '../../core/types';
import { BONES } from '../rig/skeleton';
import { buildCharacterGeometry } from './build';
import { PRESETS, randomLook } from './presets';

const HAIR: HairStyle[] = ['long', 'short', 'slick', 'bald', 'spiky', 'perm', 'bun', 'crew'];
const TOPS: TopStyle[] = ['tshirt', 'shirt', 'hawaiian', 'tank', 'jacket', 'leather', 'suit', 'apron', 'vest', 'singlet'];
const BOTTOMS: BottomStyle[] = ['jeans', 'slacks', 'shorts', 'skirt'];
const ACCESSORIES: Accessory[] = ['sunglasses', 'goldChain', 'cigarette', 'watch', 'headband', 'tattooArms', 'earring', 'glasses', 'cap'];

/** The two custom looks narrative spawns (npcs.ts). */
const CUSTOM: CharacterAppearance[] = [
  { height: 1.68, build: 'heavy', skinTone: 0xb07a4f, hair: 'crew', hairColor: 0x1a1a1a, top: 'singlet', topColor: 0xf2efe6, bottom: 'shorts', bottomColor: 0x2f3b4c, shoeColor: 0x3a3a3a, accessories: ['watch'] },
  { height: 1.75, build: 'normal', skinTone: 0xc68e62, hair: 'short', hairColor: 0x111111, top: 'shirt', topColor: 0x1f2a44, topAccent: 0xffffff, bottom: 'jeans', bottomColor: 0x25324a, accessories: ['goldChain'] },
];

function check(a: CharacterAppearance): void {
  const { geometry: g, proportions: p } = buildCharacterGeometry(a);
  const n = g.getAttribute('position').count;
  expect(n).toBeGreaterThan(300);
  for (const name of ['normal', 'color', 'skinIndex', 'skinWeight', 'glow', 'hullNormal']) {
    expect(g.getAttribute(name).count, name).toBe(n);
  }
  const skin = g.getAttribute('skinIndex').array;
  expect(Math.max(...skin)).toBeLessThan(BONES.length);
  const idx = g.index!.array;
  expect(Math.max(...idx)).toBeLessThan(n);
  const pos = g.getAttribute('position');
  let top = -Infinity;
  let bottom = Infinity;
  for (let i = 0; i < n; i++) {
    expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
    top = Math.max(top, pos.getY(i));
    bottom = Math.min(bottom, pos.getY(i));
  }
  expect(bottom).toBeGreaterThan(-0.02);
  expect(bottom).toBeLessThan(0.03);
  expect(top).toBeGreaterThan(p.H * 0.95);
  expect(top).toBeLessThan(p.H * 1.12);
}

describe('look', () => {
  it('builds every preset', () => {
    for (const look of Object.values(PRESETS)) check(look);
  });

  it('builds the custom narrative looks', () => {
    for (const look of CUSTOM) check(look);
  });

  it('builds every hair, top, bottom and accessory', () => {
    const base = PRESETS.debtor;
    for (const hair of HAIR) check({ ...base, hair });
    for (const top of TOPS) check({ ...base, top });
    for (const top of TOPS) check({ ...base, top, topAccent: 0x808080 });
    for (const bottom of BOTTOMS) check({ ...base, bottom });
    check({ ...base, accessories: ACCESSORIES });
    check({ ...base, female: true, build: 'heavy' });
    for (const build of ['slim', 'normal', 'heavy', 'muscular'] as const) check({ ...base, build });
  });

  it('random looks are valid', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 40; i++) check(randomLook(rng));
  });
});
