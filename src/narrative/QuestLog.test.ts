import { describe, expect, it } from 'vitest';
import { QuestLog, type QuestChange } from './QuestLog';

function logWithEvents(): { log: QuestLog; events: QuestChange[] } {
  const events: QuestChange[] = [];
  return { log: new QuestLog((c) => events.push(c)), events };
}

describe('QuestLog', () => {
  it('starts with chapter 1 active and everything else locked', () => {
    const { log } = logWithEvents();
    const byId = Object.fromEntries(log.views().map((v) => [v.id, v.status]));
    expect(byId).toEqual({
      main_ch1: 'active',
      main_ch2: 'locked',
      main_ch3: 'locked',
      sub_debt: 'locked',
      sub_pager: 'locked',
    });
    expect(log.tracked()).toEqual({ titleZh: '第一章 波斯富街', objectiveZh: '去波斯富街搵山雞' });
  });

  it('emits updated on unlock/start/advance and completed on completion', () => {
    const { log, events } = logWithEvents();
    log.unlock('sub_debt');
    log.start('sub_debt', 'settle');
    log.advance('sub_debt', 'iou');
    log.complete('sub_debt');
    expect(events.map((e) => (e.type === 'updated' ? `${e.from}>${e.status}` : 'done'))).toEqual([
      'locked>available',
      'available>active',
      'active>active',
      'active>completed',
      'done',
    ]);
    expect(log.objective('sub_debt')).toBe('已完成');
  });

  it('ignores unknown stages, repeated states and restarting completed quests', () => {
    const { log, events } = logWithEvents();
    log.advance('main_ch1', 'nonsense');
    log.start('main_ch1');
    log.complete('main_ch1');
    log.start('main_ch1', 'alley');
    log.complete('main_ch1');
    expect(events.filter((e) => e.type === 'completed')).toHaveLength(1);
    expect(log.status('main_ch1')).toBe('completed');
  });

  it('tracks an active substory when no main quest is active', () => {
    const { log } = logWithEvents();
    log.complete('main_ch1');
    expect(log.tracked()).toBeNull();
    log.start('sub_pager', 'find');
    expect(log.tracked()).toEqual({ titleZh: '失落嘅BB機', objectiveZh: '喺附近搵返阿芝部BB機' });
  });

  it('round-trips through serialize/deserialize and rejects garbage', () => {
    const { log } = logWithEvents();
    log.complete('main_ch1');
    log.start('main_ch2', 'pier');
    const copy = new QuestLog();
    copy.deserialize(JSON.parse(JSON.stringify(log.serialize())));
    expect(copy.views()).toEqual(log.views());

    copy.deserialize({ main_ch2: { status: 'active', stage: 'bogus' }, sub_debt: { status: 'weird', stage: 'meet' } });
    expect(copy.status('main_ch1')).toBe('active');
    expect(copy.stage('main_ch2')).toBe('find_shrimp');
    expect(copy.status('sub_debt')).toBe('locked');
    copy.deserialize('not a save');
    expect(copy.status('main_ch1')).toBe('active');
  });
});
