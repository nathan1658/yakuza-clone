import type { QuestView } from '../../core/types';
import type { MenuItem } from '../MenuList';
import { el, toggle } from '../dom';
import { emptyTab, fillDetail, type PauseTabBuilder } from './pauseTab';

type Status = QuestView['status'];

const STATUS: Readonly<Record<Status, { zh: string; rank: number }>> = {
  active: { zh: '進行中', rank: 0 },
  available: { zh: '可以接', rank: 1 },
  completed: { zh: '已完成', rank: 2 },
  locked: { zh: '', rank: 3 },
};
const KIND = { main: { zh: '主線', rank: 0 }, substory: { zh: '支線', rank: 10 } } as const;

const rank = (q: QuestView): number => KIND[q.kind].rank + STATUS[q.status].rank;

/** 任務: main story first, then substories; active before completed. */
export const buildQuests: PauseTabBuilder = (env) => {
  const quests = env.ctx.narrative.getQuests()
    .filter((q) => q.status !== 'locked')
    .sort((a, b) => rank(a) - rank(b));
  if (quests.length === 0) return emptyTab(env, '暫時冇任務', '周圍行下，同街坊傾吓偈。');
  return quests.map((q): MenuItem => {
    const done = q.status === 'completed';
    const row = el('div', `yk-row yk-pquest is-${q.kind}`, env.list);
    el('span', 'yk-pquest-tag', row, KIND[q.kind].zh);
    el('span', 'yk-row-zh', row, q.titleZh);
    el('span', 'yk-row-en', row, q.titleEn);
    el('span', 'yk-pquest-mark', row, done ? '✓' : '');
    toggle(row, 'is-done', done);
    const objective = done ? '' : `目標：${q.objectiveZh}`;
    return {
      el: row,
      enabled: true,
      focus: () => fillDetail(env.detail, q.titleZh, `${KIND[q.kind].zh} ・ ${STATUS[q.status].zh} ・ ${q.titleEn}`,
        [objective, q.descriptionZh]),
    };
  });
};
