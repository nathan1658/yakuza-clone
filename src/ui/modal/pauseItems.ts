import type { MenuItem } from '../MenuList';
import { el } from '../dom';
import { effectText, emptyTab, fillDetail, type PauseTabBuilder } from './pauseTab';

/** 物品: everything in the pockets; confirm eats/drinks/applies it. */
export const buildItems: PauseTabBuilder = (env) => {
  const { inventory, input } = env.ctx;
  const stacks = inventory.getItems();
  if (stacks.length === 0) return emptyTab(env, '身上冇嘢', '街邊小食檔、冰室同報紙檔都有嘢買。');
  const useHint = `[${input.getLabel('confirm')}] 使用`;
  return stacks.map(({ id, count }): MenuItem => {
    const def = inventory.getItemDef(id);
    const row = el('div', 'yk-row yk-pitem', env.list);
    el('span', 'yk-row-zh', row, def.nameZh);
    el('span', 'yk-row-en', row, def.nameEn);
    el('span', 'yk-pitem-count', row, `×${count}`);
    const usage = def.kind === 'key' ? '重要物品 ・ 唔可以用' : `${effectText(def)}　${useHint}`;
    return {
      el: row,
      enabled: true,
      focus: () => fillDetail(env.detail, def.nameZh, def.nameEn, [def.descZh, usage]),
      activate: () => {
        const used = inventory.useItem(id);
        if (used) env.refresh();
        return used;
      },
    };
  });
};
