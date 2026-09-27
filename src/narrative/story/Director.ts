/**
 * Runs the story: fires the current beat from its trigger (talk, zone or
 * auto), advances the beat table, and owns the one-at-a-time story task.
 * Beats are re-entrant: nothing advances until a beat's script finishes,
 * so after a load the current beat simply fires again (a saved pending
 * fight resumes straight into the fight).
 */
import { openShop, saveGame } from '../runtime/Converse';
import { giveItem, type Rt } from '../runtime/Env';
import type { Npcs } from '../runtime/Npcs';
import { talkOption, type TalkState } from '../runtime/Talk';
import type { DialogueId } from '../scripts/index';
import { beatDef, nextBeat, type BeatId, type ChapterNo } from './beats';
import { CHAPTERS } from './chapters';
import { AUTOSAVE_TOAST, Run } from './Run';

type BeatScript = (r: Run) => Promise<boolean>;

const CHAPTER_WEATHER_SEC = 8;
const CREDITS_FADE_SEC = 1.5;

async function talkBeat(r: Run, id: DialogueId, npc: string): Promise<boolean> {
  return (await r.talk(id, npc)) !== null && r.alive();
}

async function ambush(r: Run): Promise<boolean> {
  const won = await r.sceneThenFight('ch2_ambush', 'typhoon_ambush');
  if (won) r.afterFight('typhoon_ambush');
  return won;
}

/** 蝦叔 offers 炒蟹強's crab; saying yes opens the boat's menu straight from the talk. */
async function meetShrimp(r: Run): Promise<boolean> {
  const end = await r.talk('ch2_shrimp', 'npc_shrimp', (e) => e === 'crab');
  if (end === 'crab' && r.alive()) await openShop(r.rt, 'shop_crab_boat', r.alive);
  return end !== null && r.alive();
}

async function rollCredits(r: Run): Promise<void> {
  const { ctx } = r.rt;
  ctx.audio.playMusic('ending');
  if (!ctx.state.transition('credits')) return;
  ctx.entities.playerInputEnabled = false;
  try {
    await ctx.ui.showCredits();
  } finally {
    ctx.entities.playerInputEnabled = true;
  }
}

async function ending(r: Run): Promise<boolean> {
  const { ctx } = r.rt;
  if (!(await r.scene('ending', true))) return false;
  await rollCredits(r);
  if (!r.alive()) return false;
  if (ctx.entities.getCharacter('boss_crow')) ctx.entities.despawn('boss_crow');
  ctx.state.transition('freeRoam');
  ctx.cameraRig.snapBehindTarget();
  void ctx.ui.fade(false, CREDITS_FADE_SEC);
  return true;
}

const BEAT_SCRIPTS: Record<BeatId, BeatScript> = {
  ch1_meet_chicken: (r) => talkBeat(r, 'ch1_chicken', 'npc_chicken'),
  ch1_alley: (r) => r.sceneThenFight('ch1_alley', 'prologue_alley'),
  ch1_aftermath: (r) => r.scene('ch1_after'),
  ch2_go_typhoon: (r) => r.scene('ch2_card'),
  ch2_ambush: ambush,
  ch2_shrimp: meetShrimp,
  ch3_crossing: (r) => r.sceneThenFight('ch3_crossing', 'sogo_goons'),
  ch3_boss: (r) => r.sceneThenFight('ch3_crow', 'sogo_boss'),
  ch3_ending: ending,
  postgame: async () => false,
};

/** 收數佬 turn up after 魚蛋佬 refuses to pay; beating them wins the IOU. */
async function debtFight(r: Run): Promise<void> {
  if (!(await r.sceneThenFight('debt_collectors', 'substory_debt'))) return;
  r.afterFight('substory_debt');
  giveItem(r.rt.ctx, 'debt_iou');
  r.rt.story.quests.advance('sub_debt', 'iou');
  saveGame(r.rt, AUTOSAVE_TOAST);
}

function distXZ(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class Director {
  constructor(
    private readonly rt: Rt,
    private readonly npcs: Npcs,
    private readonly talkState: TalkState,
    /** Story state changed: resync NPCs and markers. */
    private readonly changed: () => void,
  ) {}

  /** Run a story task; ignored while another one owns the story. */
  run(task: (r: Run) => Promise<unknown>): Promise<void> {
    const { ctx, session } = this.rt;
    if (session.busy) return Promise.resolve();
    return session.exclusive(async (alive) => {
      ctx.combat.setRandomEncountersEnabled(false);
      try {
        await task(new Run(this.rt, alive, this.npcs));
      } finally {
        if (alive()) this.settle();
      }
    });
  }

  /** Back to a playable free roam after a task (or a load). */
  settle(): void {
    const { ctx, story } = this.rt;
    if (ctx.state.is('cutscene', 'dialogue', 'shop')) ctx.state.transition('freeRoam');
    ctx.combat.setRandomEncountersEnabled(Boolean(story.getFlag('random_on')));
    this.changed();
  }

  /** Zone triggers are polled: robust even when the player is already standing inside. */
  update(): void {
    const { ctx, session, story } = this.rt;
    if (session.busy || !ctx.state.is('freeRoam')) return;
    const trigger = beatDef(story.beat).trigger;
    if (trigger.kind !== 'zone') return;
    const at = ctx.world.getLocation(trigger.at).position;
    if (distXZ(ctx.entities.player.position, at) <= trigger.radius) void this.playBeat();
  }

  talk(npc: string): void {
    const opt = talkOption(npc, this.talkState);
    if (!opt) return;
    if (opt.kind === 'beat') {
      void this.playBeat();
      return;
    }
    void this.run(async (r) => {
      const end = await r.talk(opt.id, npc, (e) => e === 'fight');
      if (end === 'fight' && r.alive()) await debtFight(r);
    });
  }

  /** Play the current beat, then any 'auto' beats after it; autosave once the chain stops. */
  playBeat(): Promise<void> {
    return this.run(async (r) => {
      let advanced = false;
      do {
        const beat = this.rt.story.beat;
        if (!(await BEAT_SCRIPTS[beat](r)) || !r.alive()) break;
        this.complete(beat);
        advanced = true;
      } while (beatDef(this.rt.story.beat).trigger.kind === 'auto');
      if (advanced && r.alive()) saveGame(this.rt, AUTOSAVE_TOAST);
    });
  }

  /** After a load: resume a saved fight, or an 'auto' beat that was interrupted. */
  resume(): Promise<void> {
    const { story } = this.rt;
    if (story.pendingFight === 'substory_debt') return this.run(debtFight);
    const def = beatDef(story.beat);
    if (story.pendingFight !== def.encounter) story.pendingFight = null;
    if (story.pendingFight || def.trigger.kind === 'auto') return this.playBeat();
    return Promise.resolve();
  }

  chapterEnv(n: ChapterNo, transitionSec: number): void {
    const { ctx } = this.rt;
    ctx.world.setWeather(CHAPTERS[n].weather, transitionSec);
    ctx.entities.setPedestrianDensity(CHAPTERS[n].pedestrianDensity);
  }

  private complete(done: BeatId): void {
    const { ctx, story } = this.rt;
    const def = beatDef(done);
    for (const [k, v] of Object.entries(def.sets ?? {})) story.setFlag(k, v);
    for (const q of def.unlocks ?? []) story.quests.unlock(q);
    const next = nextBeat(done);
    if (!next) return;
    const nd = beatDef(next);
    if (def.quest && def.quest.id !== nd.quest?.id) story.quests.complete(def.quest.id);
    story.beat = next;
    if (nd.quest) story.quests.advance(nd.quest.id, nd.quest.stage);
    if (nd.chapter !== def.chapter) {
      this.chapterEnv(nd.chapter, CHAPTER_WEATHER_SEC);
      ctx.events.emit('chapter:start', { chapter: nd.chapter, titleZh: CHAPTERS[nd.chapter].titleZh });
    }
    this.changed();
  }
}
