import type { ShopDef, ShopId } from '../../core/types';

export const SHOPS: Readonly<Record<ShopId, ShopDef>> = {
  shop_curry_fishball: {
    id: 'shop_curry_fishball', nameZh: '魚蛋檔', nameEn: 'Fish Ball Stall',
    greetingZh: '靚仔，咖喱魚蛋新鮮熱辣，嚟串啦！',
    items: ['curry_fishball', 'siu_mai', 'egg_waffle', 'cart_noodles'],
  },
  shop_cha_chaan_teng: {
    id: 'shop_cha_chaan_teng', nameZh: '冰室', nameEn: 'Cha Chaan Teng',
    greetingZh: '坐低先啦！凍檸茶少甜定走冰呀？',
    items: ['lemon_tea_iced', 'milk_tea', 'yuenyeung', 'pineapple_bun'],
  },
  shop_newsstand: {
    id: 'shop_newsstand', nameZh: '報紙檔', nameEn: 'Newsstand',
    greetingZh: '報紙、汽水、萬金油，乜都有！隨便睇。',
    items: ['vitasoy', 'beer', 'first_aid_plaster', 'tiger_balm'],
  },
  shop_crab_boat: {
    id: 'shop_crab_boat', nameZh: '避風塘炒蟹', nameEn: 'Typhoon Shelter Crab Boat',
    greetingZh: '上船啦後生仔！今晚隻蟹肥到爆膏！',
    items: ['typhoon_crab', 'beer', 'lemon_tea_iced'],
  },
};
