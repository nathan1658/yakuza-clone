/**
 * Every voice in the scripts. `name` is what the dialogue box shows and must
 * match the character's displayName when `characterId` is omitted (combat
 * spawns 東星 thugs, 笑面虎, 收數佬 and 烏鴉 under those names).
 */
import type { AnimClip } from '../../core/types';

export interface Speaker {
  name: string;
  color: string;
  /** Fixed character id; otherwise the speaker is found by displayName. */
  characterId?: string;
  /** Gesture used when a line doesn't specify one. */
  gesture: AnimClip;
}

export const SPEAKERS = {
  narrator: { name: '', color: '#c8c8c8', gesture: 'idle' },
  hoNam: { name: '浩南', color: '#7fc8ff', characterId: 'player', gesture: 'talk' },
  chicken: { name: '山雞', color: '#ffd24a', characterId: 'npc_chicken', gesture: 'talk' },
  shrimp: { name: '蝦叔', color: '#8fd18f', characterId: 'npc_shrimp', gesture: 'talk' },
  auntie: { name: '魚蛋嬸', color: '#ff9f68', characterId: 'npc_auntie', gesture: 'talk' },
  debtor: { name: '魚蛋佬', color: '#e0b27a', characterId: 'npc_debtor', gesture: 'talk' },
  ahChi: { name: '阿芝', color: '#ff8fc7', characterId: 'npc_pager_owner', gesture: 'talk' },
  cttBoss: { name: '冰室老闆', color: '#c9a66b', characterId: 'npc_ctt_boss', gesture: 'talk' },
  newsUncle: { name: '報紙檔伯伯', color: '#b8b8b8', characterId: 'npc_newsstand', gesture: 'talk' },
  crabKeung: { name: '炒蟹強', color: '#f28c28', characterId: 'npc_crab', gesture: 'talk' },
  brother: { name: '洪興兄弟', color: '#6fa8dc', characterId: 'npc_brother_1', gesture: 'talk' },
  goon: { name: '東星打仔', color: '#d96b6b', gesture: 'talkAngry' },
  tiger: { name: '笑面虎', color: '#ff8a3d', gesture: 'taunt' },
  collector: { name: '收數佬', color: '#c77dff', gesture: 'talkAngry' },
  crow: { name: '烏鴉', color: '#ff3b3b', characterId: 'boss_crow', gesture: 'talkAngry' },
} as const satisfies Record<string, Speaker>;

export type SpeakerKey = keyof typeof SPEAKERS;

export function speaker(key: SpeakerKey): Speaker {
  return SPEAKERS[key];
}
