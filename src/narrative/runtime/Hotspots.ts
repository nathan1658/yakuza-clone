/**
 * The world owns the stalls, payphones and the lost pager; this decides what
 * using them does: vendors open their shop, payphones save, the pager is
 * picked up for 「失落嘅BB機」.
 */
import type { DialogueLineView, HotspotDef, HotspotKind } from '../../core/types';
import type { Run } from '../story/Run';
import { inDialogue, openShop, saveGame } from './Converse';
import { giveItem, type Rt } from './Env';

const LABELS: Record<HotspotKind, string> = { vendor: '購買', payphone: '打電話', pickup: '拾起' };

const PAYPHONE_PROMPT: DialogueLineView = {
  speaker: '',
  text: '要唔要打個電話返去報平安？（記錄進度）',
  gloss: 'Call home to say you are safe? (Save progress)',
  choices: [{ text: '記錄' }, { text: '唔使住' }],
};
const SAVED_TOAST = '已儲存';

async function payphone(r: Run): Promise<void> {
  const { rt, alive } = r;
  rt.ctx.audio.playSfx('payphone_pickup');
  await inDialogue(rt, 'payphone', null, alive, async () => {
    const pick = await rt.ctx.ui.presentLine(PAYPHONE_PROMPT);
    if (pick !== 0 || !alive()) return;
    rt.ctx.audio.playSfx('save');
    saveGame(rt, SAVED_TOAST);
  });
}

/** Whether the lost pager can be picked up right now. */
export function pagerAvailable(rt: Rt): boolean {
  const { story } = rt;
  return Boolean(story.getFlag('substories_unlocked')) && !story.getFlag('pager_picked') && story.quests.status('sub_pager') !== 'completed';
}

function pickUpPager(rt: Rt): void {
  const { ctx, story } = rt;
  story.setFlag('pager_picked', true);
  ctx.audio.playSfx('pickup');
  giveItem(ctx, 'pager_lost');
  story.quests.advance('sub_pager', story.quests.isActive('sub_pager', 'find') ? 'return' : 'owner');
}

async function use(r: Run, hs: HotspotDef): Promise<void> {
  if (hs.kind === 'vendor' && hs.shopId) return openShop(r.rt, hs.shopId, r.alive);
  if (hs.kind === 'payphone') return payphone(r);
  if (hs.kind === 'pickup' && pagerAvailable(r.rt)) pickUpPager(r.rt);
}

/** `run` executes a story task (one at a time, with resync afterwards). */
export function registerHotspots(rt: Rt, run: (task: (r: Run) => Promise<void>) => void): void {
  for (const hs of rt.ctx.world.getHotspots()) {
    rt.ctx.interactions.register({
      id: hs.id,
      label: hs.label || LABELS[hs.kind],
      radius: hs.radius,
      getPosition: () => hs.position,
      isEnabled: () => hs.kind !== 'pickup' || pagerAvailable(rt),
      interact: () => run((r) => use(r, hs)),
    });
  }
}
