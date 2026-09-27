/** Every dialogue graph, keyed by id (keys must equal graph.id; a test checks). */
import type { DialogueGraph } from '../dialogue/types';
import { CH1_AFTER, CH1_ALLEY, CH1_CHICKEN, CH1_STALL, INTRO } from './ch1';
import { CH2_AMBUSH, CH2_CARD, CH2_SHRIMP, CHICKEN_CH2, SHRIMP_CH3 } from './ch2';
import { CH3_CROSSING, CH3_CROW, CHICKEN_POST, ENDING, ENDING_BROTHERS, ENDING_RAIN, SHRIMP_POST } from './ch3';
import { DEBT_AFTER_FIGHT, DEBT_AGAIN, DEBT_COLLECTORS, DEBT_INTRO } from './substoryDebt';
import { PAGER_INTRO, PAGER_RETURN, PAGER_RETURN_SURPRISE, PAGER_WAITING } from './substoryPager';

export const DIALOGUES = {
  intro: INTRO,
  ch1_chicken: CH1_CHICKEN,
  ch1_alley: CH1_ALLEY,
  ch1_after: CH1_AFTER,
  ch1_stall: CH1_STALL,
  ch2_card: CH2_CARD,
  ch2_ambush: CH2_AMBUSH,
  ch2_shrimp: CH2_SHRIMP,
  chicken_ch2: CHICKEN_CH2,
  shrimp_ch3: SHRIMP_CH3,
  ch3_crossing: CH3_CROSSING,
  ch3_crow: CH3_CROW,
  ending: ENDING,
  ending_brothers: ENDING_BROTHERS,
  ending_rain: ENDING_RAIN,
  chicken_post: CHICKEN_POST,
  shrimp_post: SHRIMP_POST,
  debt_intro: DEBT_INTRO,
  debt_again: DEBT_AGAIN,
  debt_after_fight: DEBT_AFTER_FIGHT,
  debt_collectors: DEBT_COLLECTORS,
  pager_intro: PAGER_INTRO,
  pager_waiting: PAGER_WAITING,
  pager_return_surprise: PAGER_RETURN_SURPRISE,
  pager_return: PAGER_RETURN,
} as const satisfies Record<string, DialogueGraph>;

export type DialogueId = keyof typeof DIALOGUES;

/** Dialogues that belong to the main story (items must match STORY_ITEMS; no flags). */
export const MAIN_STORY_DIALOGUES: readonly DialogueId[] = [
  'intro', 'ch1_chicken', 'ch1_alley', 'ch1_after', 'ch1_stall',
  'ch2_card', 'ch2_ambush', 'ch2_shrimp', 'ch3_crossing', 'ch3_crow', 'ending', 'ending_brothers', 'ending_rain',
];
