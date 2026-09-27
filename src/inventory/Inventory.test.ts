import { describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../core/types';
import { Inventory, START_MONEY, parseSave } from './Inventory';

function setup(hp = 100, maxHp = 200) {
  const player = { hp, maxHp };
  const emit = vi.fn();
  const playSfx = vi.fn();
  const addHeat = vi.fn();
  const register = vi.fn();
  const ctx = {
    events: { emit },
    audio: { playSfx },
    save: { register },
    entities: { player },
    combat: { addHeat },
  } as unknown as GameContext;
  const inv = new Inventory(ctx);
  inv.init();
  return { inv, player, emit, playSfx, addHeat, register };
}

describe('Inventory money', () => {
  it('starts with HK$500 and registers its saveable', () => {
    const { inv, register } = setup();
    expect(inv.money).toBe(START_MONEY);
    expect(register).toHaveBeenCalledWith(inv);
    expect(inv.saveKey).toBe('inventory');
  });

  it('adds and spends, emitting money:changed with the delta', () => {
    const { inv, emit } = setup();
    inv.addMoney(120);
    expect(emit).toHaveBeenLastCalledWith('money:changed', { money: 620, delta: 120 });
    expect(inv.spendMoney(20)).toBe(true);
    expect(emit).toHaveBeenLastCalledWith('money:changed', { money: 600, delta: -20 });
  });

  it('refuses to overspend or spend negative amounts, without side effects', () => {
    const { inv, emit } = setup();
    expect(inv.spendMoney(501)).toBe(false);
    expect(inv.spendMoney(-5)).toBe(false);
    expect(inv.spendMoney(Number.NaN)).toBe(false);
    expect(inv.money).toBe(500);
    expect(emit).not.toHaveBeenCalled();
  });

  it('never goes below zero and ignores no-op changes', () => {
    const { inv, emit } = setup();
    inv.addMoney(-9999);
    expect(inv.money).toBe(0);
    emit.mockClear();
    inv.addMoney(0);
    inv.addMoney(Number.NaN);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('Inventory items', () => {
  it('adds, counts, removes and lists in catalogue order', () => {
    const { inv, emit } = setup();
    inv.addItem('beer', 2);
    inv.addItem('curry_fishball');
    expect(emit).toHaveBeenLastCalledWith('item:changed', { id: 'curry_fishball', count: 1, delta: 1 });
    expect(inv.getItems()).toEqual([
      { id: 'curry_fishball', count: 1 },
      { id: 'beer', count: 2 },
    ]);
    expect(inv.removeItem('beer', 3)).toBe(false);
    expect(inv.removeItem('beer', 2)).toBe(true);
    expect(inv.count('beer')).toBe(0);
    expect(inv.getItems()).toEqual([{ id: 'curry_fishball', count: 1 }]);
  });

  it('returns a stable list until something changes', () => {
    const { inv } = setup();
    inv.addItem('vitasoy');
    const a = inv.getItems();
    expect(inv.getItems()).toBe(a);
    inv.addItem('vitasoy');
    expect(inv.getItems()).not.toBe(a);
  });

  it('ignores zero or negative counts', () => {
    const { inv, emit } = setup();
    inv.addItem('beer', 0);
    inv.addItem('beer', -3);
    expect(inv.removeItem('beer', 0)).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('Inventory useItem', () => {
  it('heals through player.hp (clamped), adds heat, plays sfx, removes one', () => {
    const { inv, player, addHeat, playSfx } = setup(150, 200);
    inv.addItem('typhoon_crab', 2);
    expect(inv.useItem('typhoon_crab')).toBe(true);
    expect(player.hp).toBe(200);
    expect(addHeat).toHaveBeenCalledWith(50);
    expect(playSfx).toHaveBeenCalledWith('eat');
    expect(inv.count('typhoon_crab')).toBe(1);
  });

  it('uses the matching sound per item kind and skips heat when there is none', () => {
    const { inv, playSfx, addHeat } = setup();
    inv.addItem('milk_tea');
    inv.addItem('tiger_balm');
    inv.useItem('milk_tea');
    expect(playSfx).toHaveBeenLastCalledWith('drink');
    inv.useItem('tiger_balm');
    expect(playSfx).toHaveBeenLastCalledWith('pickup');
    expect(addHeat).toHaveBeenCalledTimes(1);
  });

  it('refuses key items and items not owned', () => {
    const { inv, player } = setup(100);
    inv.addItem('pager_lost');
    expect(inv.useItem('pager_lost')).toBe(false);
    expect(inv.count('pager_lost')).toBe(1);
    expect(inv.useItem('beer')).toBe(false);
    expect(player.hp).toBe(100);
  });
});

describe('Inventory buy', () => {
  it('stores the item when not consumed on the spot', () => {
    const { inv, playSfx, player } = setup(100);
    expect(inv.buy('shop_curry_fishball', 'cart_noodles', false)).toBe(true);
    expect(inv.money).toBe(482);
    expect(inv.count('cart_noodles')).toBe(1);
    expect(player.hp).toBe(100);
    expect(playSfx).toHaveBeenCalledWith('money');
  });

  it('eats on the spot when consumeNow', () => {
    const { inv, player, addHeat } = setup(100);
    expect(inv.buy('shop_cha_chaan_teng', 'yuenyeung', true)).toBe(true);
    expect(inv.money).toBe(492);
    expect(inv.count('yuenyeung')).toBe(0);
    expect(player.hp).toBe(120);
    expect(addHeat).toHaveBeenCalledWith(20);
  });

  it('fails without money or when the shop does not stock the item', () => {
    const { inv, playSfx } = setup();
    inv.spendMoney(400);
    expect(inv.buy('shop_crab_boat', 'typhoon_crab', true)).toBe(false);
    expect(inv.buy('shop_newsstand', 'curry_fishball', false)).toBe(false);
    expect(inv.money).toBe(100);
    expect(playSfx).not.toHaveBeenCalled();
  });
});

describe('Inventory save', () => {
  it('round-trips money and items', () => {
    const a = setup();
    a.inv.addMoney(234);
    a.inv.addItem('beer', 3);
    a.inv.addItem('debt_iou');
    const data = JSON.parse(JSON.stringify(a.inv.serialize()));

    const b = setup();
    b.inv.addItem('vitasoy');
    b.inv.deserialize(data);
    expect(b.inv.money).toBe(734);
    expect(b.inv.getItems()).toEqual([
      { id: 'beer', count: 3 },
      { id: 'debt_iou', count: 1 },
    ]);
    expect(b.emit).toHaveBeenCalledWith('item:changed', { id: 'vitasoy', count: 0, delta: -1 });
  });

  it('reset restores the new-game wallet and empties the bag', () => {
    const { inv } = setup();
    inv.addMoney(1000);
    inv.addItem('beer');
    inv.reset();
    expect(inv.money).toBe(START_MONEY);
    expect(inv.getItems()).toEqual([]);
  });

  it('treats garbage as a reset and drops unknown or bad entries', () => {
    const { inv } = setup();
    inv.addItem('beer');
    inv.deserialize('nonsense');
    expect(inv.getItems()).toEqual([]);
    expect(parseSave({ money: 10, items: { beer: 2, whisky: 1, vitasoy: -1, milk_tea: 1.5 } }))
      .toEqual({ money: 10, items: { beer: 2 } });
    expect(parseSave({ money: 'lots' })).toBeNull();
  });
});
