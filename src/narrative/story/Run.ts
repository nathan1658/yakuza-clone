/**
 * What a story task (a beat, a side talk, a substory fight) can do. Every
 * step respects the task's liveness, so a task superseded by a load or a
 * new game quietly stops.
 */
import { playScene } from '../cutscene/Cutscene';
import { SCENES, type SceneId } from '../cutscene/scenes';
import { converse, saveGame } from '../runtime/Converse';
import type { Rt } from '../runtime/Env';
import type { Npcs } from '../runtime/Npcs';
import { AFTER_FIGHT, LEAD_INS, type StoryEncounter } from '../scripts/fights';
import type { DialogueId } from '../scripts/index';
import { speaker } from '../scripts/speakers';

export const AUTOSAVE_TOAST = '自動儲存';
/** How long the resumed fight's taunt stays up; the fight starts part-way through it. */
const LEAD_IN_SEC = 3;
const AFTER_FIGHT_SEC = 4;

export class Run {
  constructor(
    readonly rt: Rt,
    readonly alive: () => boolean,
    private readonly npcs: Npcs,
  ) {}

  /** `keepState`: stay in 'cutscene' afterwards (a fight or the credits follow). */
  scene(id: SceneId, keepState = false): Promise<boolean> {
    return playScene(this.rt, id, SCENES[id], { keepState, alive: this.alive });
  }

  /** End tag ('' for none), or null when the dialogue could not start. */
  talk(id: DialogueId, npc: string | null, keep?: (end: string) => boolean): Promise<string | null> {
    return converse(this.rt, id, npc ? this.npcs.get(npc) : null, this.alive, keep);
  }

  /** Autosave, fight, and report whether the player won (a loss hands over to the game-over flow). */
  async fight(id: StoryEncounter): Promise<boolean> {
    const { ctx, story } = this.rt;
    story.pendingFight = id;
    saveGame(this.rt, AUTOSAVE_TOAST);
    ctx.combat.startEncounter(id);
    const result = await ctx.combat.waitForEncounter(id);
    if (!result.victory || !this.alive()) return false;
    story.pendingFight = null;
    return true;
  }

  /** The pre-fight scene, or, when resuming a saved fight, just the enemies' taunt. Then the fight. */
  async sceneThenFight(scene: SceneId, id: StoryEncounter): Promise<boolean> {
    const ready = this.rt.story.pendingFight === id ? await this.leadIn(id) : await this.scene(scene, true);
    return ready && this.fight(id);
  }

  afterFight(id: StoryEncounter): void {
    const line = AFTER_FIGHT[id];
    if (line) this.rt.ctx.ui.showSubtitle(line.text, speaker(line.speaker).name, AFTER_FIGHT_SEC);
  }

  private async leadIn(id: StoryEncounter): Promise<boolean> {
    const { ctx, clock } = this.rt;
    ctx.combat.prepareEncounter(id);
    ctx.audio.playMusic('tension');
    const line = LEAD_INS[id];
    ctx.ui.showSubtitle(line.text, speaker(line.speaker).name, LEAD_IN_SEC);
    await clock.wait(LEAD_IN_SEC / 2);
    return this.alive() && this.rt.ctx.state.is('freeRoam');
  }
}
