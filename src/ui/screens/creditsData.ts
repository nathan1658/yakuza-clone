/**
 * The staff roll. Departments are credited to the teams (engine modules) that
 * built them — no personal names. Rendered top to bottom by Credits.ts.
 */
export type CreditEntry =
  | { kind: 'logo' }
  | { kind: 'role'; zh: string; en: string; names: readonly (readonly [string, string])[] }
  | { kind: 'note'; zh: string; en: string };

export const CREDITS: readonly CreditEntry[] = [
  { kind: 'logo' },
  { kind: 'role', zh: '監製', en: 'Producer', names: [['核心架構組', 'Core Architecture Team']] },
  { kind: 'role', zh: '導演 ・ 編劇', en: 'Director ・ Screenplay', names: [['劇情組', 'Narrative Team']] },
  { kind: 'role', zh: '動作指導', en: 'Action Director', names: [['戰鬥系統組', 'Combat Systems Team']] },
  { kind: 'role', zh: '美術指導', en: 'Art Director', names: [['世界建構組', 'World Building Team']] },
  { kind: 'role', zh: '角色造型 ・ 動作捕捉', en: 'Character Design ・ Animation', names: [['角色動畫組', 'Character & Animation Team']] },
  { kind: 'role', zh: '配樂 ・ 音效', en: 'Music ・ Sound', names: [['程序音效組', 'Procedural Audio Team']] },
  { kind: 'role', zh: '街招設計 ・ 字幕', en: 'Posters ・ Titles', names: [['介面組', 'Interface Team']] },
  { kind: 'role', zh: '道具 ・ 茶餐廳餐牌', en: 'Props ・ Menus', names: [['物品經濟組', 'Items & Economy Team']] },
  {
    kind: 'role', zh: '主要演員', en: 'Cast', names: [
      ['陳浩南', 'Chan Ho-nam'],
      ['山雞', 'Chicken'],
      ['烏鴉', 'Crow'],
      ['蝦叔', 'Uncle Shrimp'],
    ],
  },
  {
    kind: 'role', zh: '特約演員', en: 'Featuring', names: [
      ['洪興眾兄弟', 'The Hung Hing brothers'],
      ['東星眾打仔', 'The Tung Sing crew'],
      ['銅鑼灣街坊', 'The people of Causeway Bay'],
    ],
  },
  {
    kind: 'role', zh: '特別鳴謝', en: 'Special Thanks', names: [
      ['九十年代香港電影', 'Hong Kong cinema of the 1990s'],
      ['每一檔咖喱魚蛋', 'Every curry fishball cart'],
      ['每一間茶餐廳', 'Every cha chaan teng'],
      ['深夜嘅叮叮', 'The late-night trams'],
    ],
  },
  { kind: 'note', zh: '謹以此作 向九十年代香港電影致敬', en: 'Dedicated to the Hong Kong cinema of the nineties' },
  { kind: 'note', zh: '本故事純屬虛構 如有雷同 實屬巧合', en: 'All characters and events are fictitious' },
  { kind: 'note', zh: '多謝收看', en: 'Thank you for playing' },
];
