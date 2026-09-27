/**
 * The state flow around free-roam conversations, shop visits and saves.
 * Scripts decide WHAT is said; this decides which mode the game is in
 * while it is said, and always puts the game back afterwards.
 */
import { Object3D } from 'three';
import { ZONE_NAMES, type GameContext, type ICharacter, type ShopId } from '../../core/types';
import { canAct, runDialogue } from '../dialogue/DialogueManager';
import { DIALOGUES, type DialogueId } from '../scripts/index';
import { beatDef } from '../story/beats';
import { CHAPTERS } from '../story/chapters';
import type { Rt } from './Env';

/** Distance of the stand-in camera target when the player talks to nobody in particular. */
const FOCUS_AHEAD = 2;

const focusByScene = new WeakMap<object, Object3D>();

/**
 * The dialogue camera needs two objects in the scene graph (it falls back to
 * the follow camera for detached ones), so a lone speaker gets a scene-owned
 * marker a couple of metres in front of them.
 */
function framingTarget(ctx: GameContext, partner: ICharacter | null): Object3D {
  if (partner) return partner.object3d;
  let focus = focusByScene.get(ctx.engine.scene);
  if (!focus) {
    focus = new Object3D();
    focus.name = 'narrative_dialogue_focus';
    ctx.engine.scene.add(focus);
    focusByScene.set(ctx.engine.scene, focus);
  }
  const player = ctx.entities.player;
  focus.position.copy(player.position).addScaledVector(player.getForward(), FOCUS_AHEAD);
  return focus;
}

function faceEachOther(player: ICharacter, partner: ICharacter | null): void {
  if (!partner) return;
  if (canAct(player)) player.faceTowards(partner.position);
  if (canAct(partner)) partner.faceTowards(player.position);
}

/**
 * Enter 'dialogue' around `body`, framed on the player and `partner`, and
 * always clean up: box hidden, 'dialogue:end' emitted, back to free roam
 * unless `keep(result)` says the caller carries on from the dialogue state
 * (a fight, a cutscene or a shop follows). Null when 'dialogue' could not start.
 */
export async function inDialogue<T>(
  rt: Rt, dialogueId: string, partner: ICharacter | null, alive: () => boolean,
  body: () => Promise<T>, keep?: (result: NonNullable<T>) => boolean,
): Promise<T | null> {
  const { ctx } = rt;
  ctx.cameraRig.setDialogueFraming(ctx.entities.player.object3d, framingTarget(ctx, partner));
  faceEachOther(ctx.entities.player, partner);
  if (!ctx.state.transition('dialogue', { dialogueId })) return null;
  ctx.events.emit('dialogue:start', { dialogueId });
  let result: T | null = null;
  try {
    result = await body();
  } finally {
    if (alive()) ctx.ui.hideDialogue();
    ctx.events.emit('dialogue:end', { dialogueId });
    const carryOn = result != null && keep !== undefined && keep(result);
    if (alive() && ctx.state.is('dialogue') && !carryOn) ctx.state.transition('freeRoam');
  }
  return result;
}

/**
 * Run dialogue `id` with `partner`. Inside a cutscene only the lines play;
 * otherwise it is wrapped by inDialogue. Returns the end tag ('' when the
 * dialogue ended without one), or null when it could not start.
 */
export async function converse(
  rt: Rt, id: DialogueId, partner: ICharacter | null, alive: () => boolean,
  keep?: (end: string) => boolean,
): Promise<string | null> {
  const run = (): Promise<string | null> => runDialogue(rt.ctx, DIALOGUES[id], rt.env, { partner, alive });
  if (!rt.ctx.state.is('cutscene')) return inDialogue(rt, id, partner, alive, run, keep);
  const end = await run();
  if (alive()) rt.ctx.ui.hideDialogue();
  return end;
}

/** Shop menu: narrative owns the state, the UI only shows the menu. */
export async function openShop(rt: Rt, shop: ShopId, alive: () => boolean): Promise<void> {
  const { ctx } = rt;
  if (!ctx.state.transition('shop', { shopId: shop })) return;
  await ctx.ui.openShop(shop);
  if (alive() && ctx.state.is('shop')) ctx.state.transition('freeRoam');
}

/** Write the save slot; `toast` confirms a successful write (the UI reports failures itself). */
export function saveGame(rt: Rt, toast: string): void {
  const { ctx, story } = rt;
  const zone = ctx.world.getZoneAt(ctx.entities.player.position);
  const meta = { chapterZh: CHAPTERS[beatDef(story.beat).chapter].saveLabel, locationZh: ZONE_NAMES[zone].zh };
  const off = ctx.events.once('save:done', () => ctx.ui.toast(toast, 'info'));
  ctx.save.save(meta);
  off();
}
