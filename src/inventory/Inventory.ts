import type {
  GameContext, GameSystem, IInventory, ISaveable, ItemDef, ItemId, SfxId, ShopDef, ShopId,
} from '../core/types';
import { ITEMS, ITEM_IDS, isItemId } from './data/items';
import { SHOPS } from './data/shops';

export const START_MONEY = 500;

const USE_SFX: Readonly<Record<ItemDef['kind'], SfxId | null>> = {
  food: 'eat',
  drink: 'drink',
  medicine: 'pickup',
  key: null,
};

interface SaveData {
  money: number;
  items: Partial<Record<ItemId, number>>;
}

/**
 * Wallet + bag. Owns the 'inventory' saveable. Every mutation funnels through
 * setMoney()/setCount(), which are the only places that emit events.
 */
export class Inventory implements IInventory, GameSystem, ISaveable {
  readonly name = 'inventory';
  readonly saveKey = 'inventory';

  private cash = START_MONEY;
  private readonly counts = new Map<ItemId, number>();
  /** getItems() snapshot, rebuilt lazily after a change. */
  private listCache: ReadonlyArray<{ id: ItemId; count: number }> | null = null;

  constructor(private readonly ctx: GameContext) {}

  init(): void {
    this.ctx.save.register(this);
  }

  update(): void {}

  get money(): number {
    return this.cash;
  }

  addMoney(amount: number): void {
    this.setMoney(this.cash + amount);
  }

  spendMoney(amount: number): boolean {
    const cost = Math.round(amount);
    if (!(cost >= 0) || cost > this.cash) return false;
    this.setMoney(this.cash - cost);
    return true;
  }

  getItems(): ReadonlyArray<{ id: ItemId; count: number }> {
    this.listCache ??= ITEM_IDS
      .filter((id) => this.counts.has(id))
      .map((id) => ({ id, count: this.count(id) }));
    return this.listCache;
  }

  count(id: ItemId): number {
    return this.counts.get(id) ?? 0;
  }

  addItem(id: ItemId, count = 1): void {
    const n = Math.floor(count);
    if (n > 0) this.setCount(id, this.count(id) + n);
  }

  removeItem(id: ItemId, count = 1): boolean {
    const n = Math.floor(count);
    if (!(n > 0) || this.count(id) < n) return false;
    this.setCount(id, this.count(id) - n);
    return true;
  }

  useItem(id: ItemId): boolean {
    const def = this.getItemDef(id);
    if (def.kind === 'key' || this.count(id) < 1) return false;
    this.consume(def);
    this.setCount(id, this.count(id) - 1);
    return true;
  }

  getItemDef(id: ItemId): ItemDef {
    const def = ITEMS[id];
    if (!def) throw new Error(`[Inventory] unknown item "${id}"`);
    return def;
  }

  getShop(id: ShopId): ShopDef {
    const def = SHOPS[id];
    if (!def) throw new Error(`[Inventory] unknown shop "${id}"`);
    return def;
  }

  buy(shop: ShopId, item: ItemId, consumeNow: boolean): boolean {
    if (!this.getShop(shop).items.includes(item)) return false;
    const def = this.getItemDef(item);
    if (!this.spendMoney(def.price)) return false;
    this.ctx.audio.playSfx('money');
    if (consumeNow) this.consume(def);
    else this.addItem(item);
    return true;
  }

  // --- ISaveable -----------------------------------------------------------

  serialize(): SaveData {
    return { money: this.cash, items: Object.fromEntries(this.counts) };
  }

  deserialize(data: unknown): void {
    const save = parseSave(data);
    if (!save) {
      console.warn('[Inventory] invalid save data, resetting');
      this.reset();
      return;
    }
    this.setMoney(save.money);
    for (const id of ITEM_IDS) this.setCount(id, save.items[id] ?? 0);
  }

  reset(): void {
    this.setMoney(START_MONEY);
    for (const id of ITEM_IDS) this.setCount(id, 0);
  }

  // --- internals -----------------------------------------------------------

  /** Eat/drink/apply on the spot. Entities clamps and emits 'player:hp'. */
  private consume(def: ItemDef): void {
    const player = this.ctx.entities.player;
    if (def.heal) player.hp = Math.min(player.maxHp, player.hp + def.heal);
    if (def.heat) this.ctx.combat.addHeat(def.heat);
    const sfx = USE_SFX[def.kind];
    if (sfx) this.ctx.audio.playSfx(sfx);
  }

  private setMoney(value: number): void {
    const money = Math.max(0, Math.round(value));
    if (!Number.isFinite(money) || money === this.cash) return;
    const delta = money - this.cash;
    this.cash = money;
    this.ctx.events.emit('money:changed', { money, delta });
  }

  private setCount(id: ItemId, count: number): void {
    const delta = count - this.count(id);
    if (delta === 0) return;
    if (count > 0) this.counts.set(id, count);
    else this.counts.delete(id);
    this.listCache = null;
    this.ctx.events.emit('item:changed', { id, count, delta });
  }
}

/** Validate untrusted save JSON. Unknown item ids and bad counts are dropped. */
export function parseSave(data: unknown): SaveData | null {
  if (typeof data !== 'object' || data === null) return null;
  const { money, items } = data as { money?: unknown; items?: unknown };
  if (typeof money !== 'number' || !Number.isFinite(money)) return null;
  const out: SaveData = { money, items: {} };
  if (typeof items !== 'object' || items === null) return out;
  for (const [id, n] of Object.entries(items)) {
    if (isItemId(id) && Number.isInteger(n) && (n as number) > 0) out.items[id] = n as number;
  }
  return out;
}
