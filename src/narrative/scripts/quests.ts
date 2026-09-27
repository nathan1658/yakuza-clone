/** Quest definitions: one main quest per chapter plus the two substories. */
import type { QuestKind } from '../../core/types';

export type QuestId = 'main_ch1' | 'main_ch2' | 'main_ch3' | 'sub_debt' | 'sub_pager';

export interface QuestStage {
  id: string;
  objectiveZh: string;
}

export interface QuestDef {
  id: QuestId;
  kind: QuestKind;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  /** First stage is the objective shown while the quest is available. */
  stages: QuestStage[];
}

export const QUESTS: readonly QuestDef[] = [
  {
    id: 'main_ch1',
    kind: 'main',
    titleZh: '第一章 波斯富街',
    titleEn: 'Chapter 1 · Percy Street',
    descriptionZh: '落大雨嘅夜晚，浩南返到銅鑼灣。山雞約咗喺波斯富街等，話有要緊嘢講。東星嘅人最近喺街口出出入入，好似有啲唔對路。',
    stages: [
      { id: 'find_chicken', objectiveZh: '去波斯富街搵山雞' },
      { id: 'alley', objectiveZh: '去後巷睇吓發生咩事' },
      { id: 'aftermath', objectiveZh: '睇吓魚蛋嬸有冇事' },
    ],
  },
  {
    id: 'main_ch2',
    kind: 'main',
    titleZh: '第二章 避風塘',
    titleEn: 'Chapter 2 · Typhoon Shelter',
    descriptionZh: '烏鴉要插旗銅鑼灣。避風塘嘅蝦叔喺海上撈咗幾十年，東星有咩風吹草動，佢一定知。',
    stages: [
      { id: 'find_shrimp', objectiveZh: '去避風塘搵蝦叔' },
      { id: 'promenade', objectiveZh: '沿住海旁行去碼頭' },
      { id: 'pier', objectiveZh: '去碼頭同蝦叔傾吓' },
    ],
  },
  {
    id: 'main_ch3',
    kind: 'main',
    titleZh: '第三章 崇光對決',
    titleEn: 'Chapter 3 · Showdown at Sogo',
    descriptionZh: '烏鴉今晚喺崇光門口伏擊大佬B。浩南要趕喺佢哋動手之前殺到去。',
    stages: [
      { id: 'to_sogo', objectiveZh: '去崇光救大佬B' },
      { id: 'plaza', objectiveZh: '入崇光廣場搵烏鴉' },
      { id: 'ending', objectiveZh: '了結同烏鴉嘅恩怨' },
    ],
  },
  {
    id: 'sub_debt',
    kind: 'substory',
    titleZh: '魚蛋佬嘅債',
    titleEn: "The Fishball Man's Debt",
    descriptionZh: '魚蛋嬸個老公借咗東星大耳窿兩千蚊，利疊利，收數佬日日上門。佢一家人就快連檔口都保唔住。',
    stages: [
      { id: 'meet', objectiveZh: '同魚蛋佬傾吓' },
      { id: 'settle', objectiveZh: '幫魚蛋佬解決筆數' },
      { id: 'iou', objectiveZh: '將借據交返畀魚蛋佬' },
    ],
  },
  {
    id: 'sub_pager',
    kind: 'substory',
    titleZh: '失落嘅BB機',
    titleEn: 'The Lost Pager',
    descriptionZh: '軒尼詩道有個女仔唔見咗部BB機，入面有男朋友留畀佢嘅留言。喺呢個年代，唔見咗BB機，即係唔見咗個人。',
    stages: [
      { id: 'meet', objectiveZh: '同軒尼詩道嘅阿芝傾吓' },
      { id: 'find', objectiveZh: '喺附近搵返阿芝部BB機' },
      { id: 'owner', objectiveZh: '搵返BB機嘅主人' },
      { id: 'return', objectiveZh: '將BB機還畀阿芝' },
    ],
  },
];

export function questDef(id: QuestId): QuestDef {
  const q = QUESTS.find((d) => d.id === id);
  if (!q) throw new Error(`[narrative] unknown quest ${id}`);
  return q;
}
