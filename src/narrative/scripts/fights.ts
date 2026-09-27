/**
 * Lines around story fights: the lead-in when a fight is resumed after a
 * retry (the cutscene is not replayed), and the line after the win.
 */
import type { EncounterId } from '../../core/types';
import type { SpeakerKey } from './speakers';

export interface FightLine {
  speaker: SpeakerKey;
  text: string;
}

export type StoryEncounter = Exclude<EncounterId, 'random_street'>;

export const LEAD_INS: Record<StoryEncounter, FightLine> = {
  prologue_alley: { speaker: 'goon', text: '又係你？今次唔會咁好彩！' },
  typhoon_ambush: { speaker: 'tiger', text: '嘿嘿，返嚟送死呀？' },
  sogo_goons: { speaker: 'goon', text: '烏鴉哥有令，洪興嘅人一個都唔准過！' },
  sogo_boss: { speaker: 'crow', text: '陳浩南！第二round！' },
  substory_debt: { speaker: 'collector', text: '魚蛋佬嘅數，今日一定要找！' },
};

export const AFTER_FIGHT: Partial<Record<StoryEncounter, FightLine>> = {
  typhoon_ambush: { speaker: 'tiger', text: '嘿，打得又點？烏鴉哥今晚要成個銅鑼灣。' },
  substory_debt: { speaker: 'collector', text: '借據喺度，唔好再打喇！' },
};
