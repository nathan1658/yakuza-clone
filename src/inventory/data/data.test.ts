import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../core/types';
import { ITEMS, ITEM_IDS, isItemId } from './items';
import { SHOPS } from './shops';

/** [price, heal, heat] straight from the design sheet. */
const SHEET: Record<ItemId, [number, number | undefined, number | undefined]> = {
  curry_fishball: [6, 20, undefined],
  siu_mai: [6, 20, undefined],
  cart_noodles: [18, 60, undefined],
  egg_waffle: [10, 30, undefined],
  pineapple_bun: [5, 25, undefined],
  lemon_tea_iced: [8, 25, 10],
  milk_tea: [7, 20, 15],
  yuenyeung: [8, 20, 20],
  vitasoy: [3, 15, undefined],
  beer: [12, 10, 35],
  typhoon_crab: [280, 200, 50],
  first_aid_plaster: [20, 50, undefined],
  tiger_balm: [25, 80, undefined],
  pager_lost: [0, undefined, undefined],
  debt_iou: [0, undefined, undefined],
};

describe('item data', () => {
  it('has exactly the 15 contract items, keyed by their own id', () => {
    expect(ITEM_IDS).toHaveLength(15);
    expect(new Set(ITEM_IDS)).toEqual(new Set(Object.keys(SHEET)));
    for (const id of ITEM_IDS) expect(ITEMS[id].id).toBe(id);
  });

  it('matches the design sheet prices and effects', () => {
    for (const id of ITEM_IDS) {
      const [price, heal, heat] = SHEET[id];
      expect({ id, price: ITEMS[id].price, heal: ITEMS[id].heal, heat: ITEMS[id].heat })
        .toEqual({ id, price, heal, heat });
    }
  });

  it('key items are free and do nothing; consumables heal', () => {
    for (const def of Object.values(ITEMS)) {
      const isKey = def.kind === 'key';
      expect(isKey).toBe(def.id === 'pager_lost' || def.id === 'debt_iou');
      if (isKey) expect(def.heal ?? def.heat).toBeUndefined();
      else expect(def.heal).toBeGreaterThan(0);
    }
    expect(ITEMS.first_aid_plaster.kind).toBe('medicine');
    expect(ITEMS.tiger_balm.kind).toBe('medicine');
  });

  it('every item has Chinese + English names and a description', () => {
    for (const def of Object.values(ITEMS)) {
      expect(def.nameZh.length).toBeGreaterThan(0);
      expect(def.nameEn.length).toBeGreaterThan(0);
      expect(def.descZh.length).toBeGreaterThan(4);
    }
  });

  it('isItemId accepts only real ids', () => {
    expect(isItemId('beer')).toBe(true);
    expect(isItemId('toString')).toBe(false);
    expect(isItemId('whisky')).toBe(false);
  });
});

describe('shop data', () => {
  it('has the four shops with their stock lists', () => {
    expect(SHOPS.shop_curry_fishball.items).toEqual(['curry_fishball', 'siu_mai', 'egg_waffle', 'cart_noodles']);
    expect(SHOPS.shop_cha_chaan_teng.items).toEqual(['lemon_tea_iced', 'milk_tea', 'yuenyeung', 'pineapple_bun']);
    expect(SHOPS.shop_newsstand.items).toEqual(['vitasoy', 'beer', 'first_aid_plaster', 'tiger_balm']);
    expect(SHOPS.shop_crab_boat.items).toEqual(['typhoon_crab', 'beer', 'lemon_tea_iced']);
  });

  it('sells only real, purchasable items and is keyed by id', () => {
    for (const [key, shop] of Object.entries(SHOPS)) {
      expect(shop.id).toBe(key);
      expect(shop.greetingZh.length).toBeGreaterThan(0);
      for (const id of shop.items) {
        expect(isItemId(id)).toBe(true);
        expect(ITEMS[id].kind).not.toBe('key');
        expect(ITEMS[id].price).toBeGreaterThan(0);
      }
    }
  });
});
