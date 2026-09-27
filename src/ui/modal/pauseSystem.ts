import type { IAudioSystem } from '../../core/types';
import type { MenuItem } from '../MenuList';
import { menuRow } from '../MenuList';
import { el, setText, toggle } from '../dom';
import { formatPlayTime } from '../logic/format';
import { fillDetail, type PauseTabBuilder, type PauseTabEnv } from './pauseTab';

type Bus = Parameters<IAudioSystem['setVolume']>[0];

const BUSES: readonly { bus: Bus; zh: string; en: string }[] = [
  { bus: 'master', zh: '總音量', en: 'MASTER' },
  { bus: 'music', zh: '音樂', en: 'MUSIC' },
  { bus: 'sfx', zh: '音效', en: 'SOUND FX' },
  { bus: 'ambience', zh: '環境聲', en: 'AMBIENCE' },
];
const STEP = 0.1;

/** 系統: resume, four volume sliders, controls, quit to title (press twice). */
export const buildSystem: PauseTabBuilder = (env) => {
  const saveLine = describeSave(env);
  /** Focus handler: landing on any row also cancels a half-confirmed quit. */
  const describe = (zh: string, en: string, line: string) => () => {
    quit.disarm();
    fillDetail(env.detail, zh, en, [line, saveLine]);
  };
  const rows: MenuItem[] = [
    {
      el: menuRow(env.list, '繼續遊戲', 'RESUME'),
      enabled: true,
      activate: () => env.close(),
      focus: describe('繼續遊戲', 'RESUME', '返回銅鑼灣。'),
    },
    ...BUSES.map(({ bus, zh, en }) => sliderRow(env, bus, zh, en, describe(zh, en, '[←→] 或者拖動調校音量。'))),
    {
      el: menuRow(env.list, '操作說明', 'CONTROLS'),
      enabled: true,
      activate: () => env.showControls(),
      focus: describe('操作說明', 'CONTROLS', '睇返所有按鍵。'),
    },
  ];
  // menuRow appends as it creates, so the quit row is built last to sit last.
  const quit = quitRow(env, describe('返回標題', 'QUIT TO TITLE', '返回標題畫面。未儲存嘅進度會冇咗。'));
  return [...rows, quit.item];
};

function sliderRow(env: PauseTabEnv, bus: Bus, zh: string, en: string, focus: () => void): MenuItem {
  const { audio } = env.ctx;
  const row = menuRow(env.list, zh, en);
  row.classList.add('yk-pslider');
  const range = el('input', 'yk-pslider-range', row);
  Object.assign(range, { type: 'range', min: '0', max: '1', step: '0.05', tabIndex: -1 });
  const value = el('span', 'yk-pslider-value', row);
  const show = (v: number) => {
    range.value = String(v);
    range.style.setProperty('--fill', String(v));
    setText(value, `${Math.round(v * 100)}%`);
  };
  show(audio.getVolume(bus));
  range.addEventListener('input', () => {
    audio.setVolume(bus, Number(range.value));
    show(audio.getVolume(bus));
  });
  return {
    el: row,
    enabled: true,
    focus,
    horizontal: (dir) => {
      const v = Math.min(1, Math.max(0, Math.round((audio.getVolume(bus) + dir * STEP) * 20) / 20));
      audio.setVolume(bus, v);
      show(v);
      audio.playSfx('ui_move');
    },
  };
}

/** Quitting loses progress since the last save, so it takes two presses. */
function quitRow(env: PauseTabEnv, focus: () => void): { item: MenuItem; disarm(): void } {
  const row = menuRow(env.list, '返回標題', 'QUIT TO TITLE', '');
  const sub = el('span', 'yk-row-sub', row);
  let armed = false;
  const arm = (on: boolean) => {
    armed = on;
    toggle(row, 'is-armed', on);
    setText(sub, on ? '再撳一次確認 ・ 未儲存嘅進度會冇咗' : '');
  };
  return {
    disarm: () => arm(false),
    item: {
      el: row,
      enabled: true,
      focus,
      activate: () => {
        if (!armed) {
          arm(true);
          return;
        }
        arm(false);
        return env.ctx.state.transition('title');
      },
    },
  };
}

function describeSave(env: PauseTabEnv): string {
  const meta = env.ctx.save.getMeta();
  const played = `遊戲時間 ${formatPlayTime(env.ctx.save.playTimeSec)}`;
  if (!meta) return `${played} ・ 未有存檔`;
  return `${played} ・ 上次存檔：${meta.chapterZh} ・ ${meta.locationZh}`;
}
