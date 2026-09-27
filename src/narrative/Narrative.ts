/**
 * The narrative module: story beats, dialogue, cutscenes, named NPCs, quests,
 * markers, the stall / payphone / pager hotspots and street chatter.
 * Inits last (every other system exists), updates first (story triggers see
 * this frame's state before anyone else acts on it).
 */
import type {
  GameContext, GameSystem, GameTime, INarrative, QuestMarker, QuestView,
} from '../core/types';
import { Clock } from './Clock';
import { isSceneId } from './cutscene/scenes';
import type { DialogueGraph, FlagValue } from './dialogue/types';
import type { QuestChange } from './QuestLog';
import { Barks } from './runtime/Barks';
import { giveItem, makeEnv, type Rt } from './runtime/Env';
import { registerHotspots } from './runtime/Hotspots';
import { Markers } from './runtime/Markers';
import { Npcs } from './runtime/Npcs';
import { anchor } from './runtime/place';
import { Session } from './runtime/Session';
import { liveTalkState, registerTalk } from './runtime/Talk';
import { Tutorial } from './runtime/Tutorial';
import { DIALOGUES, type DialogueId } from './scripts/index';
import { beatDef, type ChapterNo } from './story/beats';
import { CHAPTERS, chapterSkipPlan, type SkipPlan } from './story/chapters';
import { Director } from './story/Director';
import { StoryState } from './StoryState';

type Parts = { rt: Rt; npcs: Npcs; markers: Markers; director: Director; barks: Barks };

function isDialogueId(id: string): id is DialogueId {
  return Object.hasOwn(DIALOGUES, id);
}

export class Narrative implements INarrative, GameSystem {
  readonly name = 'narrative';
  private parts: Parts | null = null;
  /** Set while a debug chapter skip rewrites the quest log: no banners for quests nobody played. */
  private quiet = false;

  constructor(private readonly ctx: GameContext) {}

  private get p(): Parts {
    if (!this.parts) throw new Error('Narrative used before init()');
    return this.parts;
  }

  init(): void {
    const { ctx } = this;
    const story = new StoryState((c) => this.onQuestChange(c));
    const rt: Rt = { ctx, story, clock: new Clock(), env: makeEnv(ctx, story), session: new Session() };
    const npcs = new Npcs(rt);
    const markers = new Markers(rt, npcs);
    const talkState = liveTalkState(rt);
    const director = new Director(rt, npcs, talkState, () => this.resync());
    this.parts = { rt, npcs, markers, director, barks: new Barks(rt, npcs) };
    new Tutorial(rt);
    ctx.save.register(story);
    registerTalk(rt, npcs, talkState, (npc) => director.talk(npc));
    registerHotspots(rt, (task) => void director.run(task));
  }

  update(time: GameTime): void {
    const { rt, director, barks } = this.p;
    rt.clock.tick(time.realDt);
    director.update();
    barks.update();
  }

  async startNewGame(): Promise<void> {
    const { rt, director } = this.p;
    const { ctx, story, session } = rt;
    session.bump();
    story.reset();
    const chapter = ctx.debug.chapter;
    if (chapter !== null) return this.skipTo(chapterSkipPlan(chapter));
    this.land(1, 'player_start');
    if (ctx.debug.skipIntro) return this.toFreeRoam();
    await director.run((r) => r.scene('intro'));
  }

  async continueGame(): Promise<void> {
    const { rt, director } = this.p;
    const { ctx, story, session } = rt;
    session.bump();
    director.chapterEnv(beatDef(story.beat).chapter, 0);
    ctx.ui.setLetterbox(false);
    ctx.ui.setHudVisible(true);
    ctx.entities.playerInputEnabled = true;
    ctx.cameraRig.stopSequence();
    ctx.ui.hideDialogue();
    this.p.npcs.sync(true);
    this.toFreeRoam();
    await director.resume();
  }

  async startDialogue(dialogueId: string): Promise<void> {
    if (!isDialogueId(dialogueId)) return;
    const graph: DialogueGraph = DIALOGUES[dialogueId];
    await this.p.director.run((r) => r.talk(dialogueId, graph.with ?? null));
  }

  async playCutscene(cutsceneId: string): Promise<void> {
    if (!isSceneId(cutsceneId)) return;
    await this.p.director.run((r) => r.scene(cutsceneId));
  }

  getQuests(): QuestView[] {
    return this.p.rt.story.quests.views();
  }

  getActiveMarkers(): QuestMarker[] {
    return this.p.markers.get();
  }

  getTrackedObjective(): { titleZh: string; objectiveZh: string } | null {
    return this.p.rt.story.quests.tracked();
  }

  getFlag(key: string): FlagValue | undefined {
    return this.p.rt.story.getFlag(key);
  }

  setFlag(key: string, value: FlagValue): void {
    this.p.rt.story.setFlag(key, value);
    this.resync();
  }

  /** Story state changed: NPCs to their places, markers rebuilt. */
  private resync(): void {
    this.p.npcs.sync();
    this.p.markers.invalidate();
  }

  private onQuestChange(c: QuestChange): void {
    const { events } = this.ctx;
    this.parts?.markers.invalidate();
    if (this.quiet) return;
    if (c.type === 'completed') events.emit('quest:completed', { questId: c.id, kind: c.kind });
    else events.emit('quest:updated', { questId: c.id, status: c.status, objectiveZh: c.objectiveZh });
  }

  /** Player at `at`, the chapter's weather and crowd, NPCs re-placed. */
  private land(chapter: ChapterNo, at: SkipPlan['start']): void {
    const { rt, director, npcs } = this.p;
    const a = anchor(rt.ctx, at);
    rt.ctx.entities.player.teleport(a.position, a.yaw);
    director.chapterEnv(chapter, 0);
    npcs.sync(true);
  }

  /** Debug ?chapter=N: the story as if chapters 1..N-1 were just played. */
  private skipTo(plan: SkipPlan): void {
    const { ctx, story } = this.p.rt;
    for (const [k, v] of Object.entries(plan.flags)) story.setFlag(k, v);
    story.beat = plan.beat;
    const quest = beatDef(plan.beat).quest;
    this.quiet = true;
    try {
      for (const q of plan.unlocked) story.quests.unlock(q);
      for (const q of plan.completed) story.quests.complete(q);
      if (quest) story.quests.advance(quest.id, quest.stage);
    } finally {
      this.quiet = false;
    }
    for (const [id, n] of plan.items) giveItem(ctx, id, n);
    ctx.inventory.addMoney(plan.money);
    this.land(plan.chapter, plan.start);
    this.toFreeRoam();
    const meta = CHAPTERS[plan.chapter];
    void ctx.ui.showChapterTitle(meta.numberZh, meta.titleZh, meta.titleEn);
  }

  private toFreeRoam(): void {
    const { ctx } = this;
    if (!ctx.state.is('freeRoam')) ctx.state.transition('freeRoam');
    ctx.cameraRig.snapBehindTarget();
    this.p.director.settle();
  }
}
