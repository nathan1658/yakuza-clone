import type { ItemDef, ItemId } from '../../core/types';

/**
 * Every item in the game. Order here is the display order in menus.
 * Prices in HKD (1996 street prices, give or take); heat on a 0..100 gauge.
 */
export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  curry_fishball: {
    id: 'curry_fishball', nameZh: '咖喱魚蛋', nameEn: 'Curry Fish Balls', kind: 'food',
    price: 6, heal: 20,
    descZh: '竹籤串住五粒，咖喱汁辣到標汗。行過魚蛋檔唔食一串，都唔算嚟過銅鑼灣。',
  },
  siu_mai: {
    id: 'siu_mai', nameZh: '燒賣', nameEn: 'Fish Siu Mai', kind: 'food',
    price: 6, heal: 20,
    descZh: '黃色魚肉燒賣，淋埋豉油同辣椒油，一啖一粒，細路至愛。',
  },
  cart_noodles: {
    id: 'cart_noodles', nameZh: '車仔麵', nameEn: 'Cart Noodles', kind: 'food',
    price: 18, heal: 60,
    descZh: '粗麵加豬紅、蘿蔔、魚蛋，餸自己揀。食飽先有力打交。',
  },
  egg_waffle: {
    id: 'egg_waffle', nameZh: '雞蛋仔', nameEn: 'Egg Waffle', kind: 'food',
    price: 10, heal: 30,
    descZh: '外脆內軟，一格格熱辣辣，邊行邊食最正。',
  },
  pineapple_bun: {
    id: 'pineapple_bun', nameZh: '菠蘿包', nameEn: 'Pineapple Bun', kind: 'food',
    price: 5, heal: 25,
    descZh: '啱啱出爐，面層酥皮甜到入心。冇菠蘿㗎，唔好問。',
  },
  lemon_tea_iced: {
    id: 'lemon_tea_iced', nameZh: '凍檸茶', nameEn: 'Iced Lemon Tea', kind: 'drink',
    price: 8, heal: 25, heat: 10,
    descZh: '檸檬片篤到爛，冰凍透心涼，飲完成個人醒晒。',
  },
  milk_tea: {
    id: 'milk_tea', nameZh: '奶茶', nameEn: 'HK Milk Tea', kind: 'drink',
    price: 7, heal: 20, heat: 15,
    descZh: '絲襪拉出嚟嘅港式奶茶，茶底夠濃夠滑，醒神之選。',
  },
  yuenyeung: {
    id: 'yuenyeung', nameZh: '鴛鴦', nameEn: 'Yuenyeung', kind: 'drink',
    price: 8, heal: 20, heat: 20,
    descZh: '咖啡撈奶茶，一半一半。勁過打雞血，飲完即刻想郁手。',
  },
  vitasoy: {
    id: 'vitasoy', nameZh: '維他奶', nameEn: 'Vitasoy', kind: 'drink',
    price: 3, heal: 15,
    descZh: '玻璃樽裝，細細個飲到大。平、正、夠經典。',
  },
  beer: {
    id: 'beer', nameZh: '啤酒', nameEn: 'Beer', kind: 'drink',
    price: 12, heal: 10, heat: 35,
    descZh: '凍冰冰一罐落肚，膽都粗啲。打交之前飲，出手更加狠。',
  },
  typhoon_crab: {
    id: 'typhoon_crab', nameZh: '避風塘炒蟹', nameEn: 'Typhoon Shelter Crab', kind: 'food',
    price: 280, heal: 200, heat: 50,
    descZh: '炸蒜堆到成座山，辣到你喊。貴係貴啲，食完成個人充晒電。',
  },
  first_aid_plaster: {
    id: 'first_aid_plaster', nameZh: '膠布', nameEn: 'Plaster', kind: 'medicine',
    price: 20, heal: 50,
    descZh: '報紙檔有得賣嘅膠布，貼住個傷口頂住先。',
  },
  tiger_balm: {
    id: 'tiger_balm', nameZh: '虎標萬金油', nameEn: 'Tiger Balm', kind: 'medicine',
    price: 25, heal: 80,
    descZh: '周身骨痛？搽兩搽，即刻生猛返。香港人屋企必備。',
  },
  pager_lost: {
    id: 'pager_lost', nameZh: 'BB機', nameEn: 'Lost Pager', kind: 'key',
    price: 0,
    descZh: '喺街邊執到嘅BB機，不停震。應該有人搵緊佢。',
  },
  debt_iou: {
    id: 'debt_iou', nameZh: '借據', nameEn: 'IOU Note', kind: 'key',
    price: 0,
    descZh: '魚蛋佬欠落嗰筆數，白紙黑字，仲有手指模。',
  },
};

export const ITEM_IDS: readonly ItemId[] = Object.keys(ITEMS) as ItemId[];

export function isItemId(id: string): id is ItemId {
  return Object.hasOwn(ITEMS, id);
}
