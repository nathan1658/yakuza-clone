/**
 * One-liners NPCs call out when the player walks past. Per NPC the first
 * matching entry wins, so specific entries go before the fallback.
 */
import type { BeatId } from '../story/beats';

export interface BarkDef {
  npc: string;
  /** Beat range [from, until). */
  from?: BeatId;
  until?: BeatId;
  /** Only while this story flag is truthy. */
  flag?: string;
  lines: readonly string[];
}

export const BARKS: readonly BarkDef[] = [
  { npc: 'npc_chicken', from: 'ch1_alley', until: 'ch1_aftermath', lines: ['後巷嗰邊呀南哥！', '快啲啦，啲錢俾人攞晒喇！'] },
  { npc: 'npc_auntie', from: 'ch1_alley', until: 'ch1_aftermath', lines: ['成日嘅錢俾佢哋搶晒，點算呀！'] },
  { npc: 'npc_auntie', lines: ['咖喱魚蛋，新鮮滾起！', '靚仔，食串魚蛋先啦！'] },
  { npc: 'npc_ctt_boss', lines: ['凍檸茶少甜，走冰都得！', '菠蘿油啱啱出爐呀！'] },
  { npc: 'npc_newsstand', lines: ['東方日報、蘋果日報，今日頭條勁呀！', '維他奶，凍嘅！'] },
  { npc: 'npc_crab', lines: ['避風塘炒蟹，辣到你喊！', '今朝啱啱返嚟嘅肉蟹，好肥呀！'] },
  { npc: 'npc_shrimp', from: 'ch2_go_typhoon', until: 'ch2_shrimp', lines: ['海風轉咗，今晚唔太平。'] },
  { npc: 'npc_debtor', flag: 'debt_done', lines: ['浩南哥，大恩不言謝！'] },
  { npc: 'npc_pager_owner', flag: 'pager_done', lines: ['浩南哥，多謝你！佢今晚約咗我睇戲呀！'] },
];

/** Speaker label for overheard passers-by. */
export const PASSERBY_NAME = '路人';

/** Overheard from pedestrians near the player; same matching rules, `npc` is always 'pedestrian'. */
export const PASSERBY: readonly BarkDef[] = [
  {
    npc: 'pedestrian', until: 'ch1_aftermath',
    lines: ['落咁大雨，的士都截唔到。', '收工去唔去唱K呀？', '今期六合彩又冇中，激死人。', '喂，你部BB機響緊呀！', '恒指今日又插咗兩百點。', '九七之後，唔知香港會點呢。'],
  },
  {
    npc: 'pedestrian', from: 'ch1_aftermath', until: 'postgame',
    lines: ['嗰個咪洪興陳浩南？好型呀！', '聽講東星班友喺波斯富街後巷俾人打到飛起。', '行開啲啦，唔好阻住洪興啲人。', '今晚唔好去崇光嗰頭，聽講有大茶飯。', '落咁大雨，的士都截唔到。', '收工去唔去唱K呀？'],
  },
  {
    npc: 'pedestrian', from: 'postgame',
    lines: ['烏鴉都俾人收皮，銅鑼灣終於太平啲。', '浩南哥！可唔可以同你影張相呀？', '收工去唔去唱K呀？', '今晚天氣好，去維園行吓啦。'],
  },
];
