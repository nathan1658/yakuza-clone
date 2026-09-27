/** Chapter metadata, per-chapter environment, and the debug chapter-skip plan. */
import type { ItemId, LocationId, WeatherKind } from '../../core/types';
import type { FlagValue } from '../dialogue/types';
import type { QuestId } from '../scripts/quests';
import { BEATS, beatIndex, type BeatId, type ChapterNo } from './beats';

export interface ChapterMeta {
  /** '第一章' */
  numberZh: string;
  titleZh: string;
  titleEn: string;
  /** Save-slot label. */
  saveLabel: string;
  weather: WeatherKind;
  pedestrianDensity: number;
  /** Where the player stands when this chapter is started via ?chapter=N. */
  skipStart: LocationId;
}

export const CHAPTERS: Record<ChapterNo, ChapterMeta> = {
  1: {
    numberZh: '第一章',
    titleZh: '波斯富街',
    titleEn: 'Percy Street',
    saveLabel: '第一章 波斯富街',
    weather: 'rain',
    pedestrianDensity: 1,
    skipStart: 'player_start',
  },
  2: {
    numberZh: '第二章',
    titleZh: '避風塘',
    titleEn: 'Typhoon Shelter',
    saveLabel: '第二章 避風塘',
    weather: 'drizzle',
    pedestrianDensity: 1,
    skipStart: 'percy_north',
  },
  3: {
    numberZh: '第三章',
    titleZh: '崇光對決',
    titleEn: 'Showdown at Sogo',
    saveLabel: '第三章 崇光對決',
    weather: 'rain',
    pedestrianDensity: 0.3,
    skipStart: 'hennessy_center',
  },
  4: {
    numberZh: '',
    titleZh: '自由探索',
    titleEn: 'Free Roam',
    saveLabel: '通關後 自由探索',
    weather: 'clear',
    pedestrianDensity: 1,
    skipStart: 'player_start',
  },
};

/** HK$ handed out per skipped chapter, roughly what its fights would have paid. */
export const SKIP_MONEY_PER_CHAPTER = 1500;

/** Items the story itself hands over in each chapter (kept in sync by tests). */
export const STORY_ITEMS: Record<1 | 2 | 3, Array<[ItemId, number]>> = {
  1: [['curry_fishball', 2]],
  2: [['first_aid_plaster', 2]],
  3: [],
};

export interface SkipPlan {
  chapter: 1 | 2 | 3;
  beat: BeatId;
  flags: Record<string, FlagValue>;
  completed: QuestId[];
  unlocked: QuestId[];
  items: Array<[ItemId, number]>;
  money: number;
  start: LocationId;
}

/** Everything the beats before chapter `n` would have done, as data. */
export function chapterSkipPlan(n: number): SkipPlan {
  const chapter = (n >= 1 && n <= 3 ? Math.floor(n) : 1) as 1 | 2 | 3;
  const first = BEATS.find((b) => b.chapter === chapter);
  if (!first) throw new Error(`[narrative] chapter ${chapter} has no beats`);
  const done = BEATS.slice(0, beatIndex(first.id));
  const plan: SkipPlan = {
    chapter,
    beat: first.id,
    flags: {},
    completed: [],
    unlocked: [],
    items: [],
    money: (chapter - 1) * SKIP_MONEY_PER_CHAPTER,
    start: CHAPTERS[chapter].skipStart,
  };
  for (const b of done) {
    Object.assign(plan.flags, b.sets);
    plan.unlocked.push(...(b.unlocks ?? []));
    if (b.quest && b.quest.id !== first.quest?.id && !plan.completed.includes(b.quest.id)) plan.completed.push(b.quest.id);
  }
  for (let c = 1; c < chapter; c++) plan.items.push(...STORY_ITEMS[c as 1 | 2]);
  return plan;
}
