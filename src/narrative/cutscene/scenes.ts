/**
 * The story cutscenes, written against the Kit. Staging reads live
 * positions (the player arrives from wherever they walked in, prepared
 * fighters stand where combat put them), so cameras are built from where
 * people actually are, not from fixed marks.
 *
 * Prepared enemies and 烏鴉 are never use()d: combat owns them, and
 * release() would hand their brains back and walk them home.
 */
import { Vector3 } from 'three';
import type { EncounterId, ICharacter } from '../../core/types';
import { canAct } from '../dialogue/DialogueManager';
import { anchor, approach, relative, yawTo } from '../runtime/place';
import { BROTHER, CHICKEN, spawnDefOf } from '../scripts/npcs';
import { speaker } from '../scripts/speakers';
import type { ChapterNo } from '../story/beats';
import { CHAPTERS } from '../story/chapters';
import type { Kit } from './Cutscene';
import { behind, closeUp, craneUp, establishing, lowAngle, shoulderSpot, track, twoShot, yawDir } from './shots';

type Script = (k: Kit) => Promise<void>;

/** Turns the ending crane off the line 山雞 ran in on, so he doesn't block the player. */
const CRANE_OFFSET = 0.6;

/** The encounter's fighters, prepared (standing, brains off), nearest the player first. */
function fighters(k: Kit, id: EncounterId): ICharacter[] {
  const from = k.player.position;
  const cs = [...k.ctx.combat.prepareEncounter(id)];
  return cs.sort((a, b) => a.position.distanceToSquared(from) - b.position.distanceToSquared(from));
}

function centroid(cs: readonly ICharacter[], fallback: Vector3): Vector3 {
  if (cs.length === 0) return fallback.clone();
  const sum = new Vector3();
  for (const c of cs) sum.add(c.position);
  return sum.divideScalar(cs.length);
}

/** Everyone still on their feet looks at `at`. */
function faceAll(cs: readonly ICharacter[], at: Vector3): void {
  for (const c of cs) if (canAct(c)) c.faceTowards(at);
}

/** A camera spot just past `group` as seen from `from`, a little off-axis. */
function pastGroup(from: Vector3, group: Vector3): Vector3 {
  const f = yawDir(yawTo(from, group));
  return group.clone().addScaledVector(f, 3.5).addScaledVector(new Vector3(-f.z, 0, f.x), 1.2).setY(2);
}

/** The chapter title card (the UI plays the sting with it). */
async function chapterCard(k: Kit, n: ChapterNo): Promise<void> {
  const c = CHAPTERS[n];
  await k.ctx.ui.showChapterTitle(c.numberZh, c.titleZh, c.titleEn);
  k.check();
}

/** 山雞 (borrowed, or spawned for the scene) runs up to the player from `from`, seen over the player's shoulder. */
async function chickenRunsIn(k: Kit, from: Vector3): Promise<ICharacter> {
  const p = k.player;
  const chicken = k.spawn(spawnDefOf(CHICKEN, from, yawTo(from, p.position)));
  k.anim(chicken, 'idle');
  p.faceTowards(from);
  k.cut(track(shoulderSpot(p.position, from, 1), () => chicken.position, 3, 45));
  await k.walk(chicken, approach(from, p.position, 1.6), 4.5);
  return chicken;
}

/** 序幕: 浩南 walks up Percy Street in the rain; his pager goes off. */
async function intro(k: Kit): Promise<void> {
  const start = anchor(k.ctx, 'player_start');
  const ahead = relative(k.ctx, 'player_start', 7);
  await k.fade(true, 0);
  k.place(k.player, start.position, start.yaw);
  k.sfx('tram_bell');
  k.cut(establishing(ahead, start.yaw + Math.PI, 9, 4.5, 6));
  k.go(k.player, ahead);
  await k.fade(false, 1.5);
  await k.wait(3.5);
  await k.talk('intro');
  k.cut(establishing(ahead, start.yaw, 6, 3.2, 5));
  await chapterCard(k, 1);
}

/** Three 東星 goons counting the stolen takings in the back alley. */
async function ch1Alley(k: Kit): Promise<void> {
  const p = k.player;
  const goons = fighters(k, 'prologue_alley');
  const mid = centroid(goons, anchor(k.ctx, 'percy_alley').position);
  k.music('tension');
  faceAll(goons, mid);
  k.go(p, approach(p.position, mid, 5));
  await k.shot(track(pastGroup(p.position, mid), () => p.position, 3));
  await k.talk('ch1_alley', goons[0] ?? null);
  faceAll(goons, p.position);
  await k.shot(lowAngle(p.position, p.facing, 1.6));
}

/** In front of the curry-fishball cart, 山雞 a step behind; returns 魚蛋嬸 when she is there. */
function stageStall(k: Kit, chicken: ICharacter): ICharacter | null {
  const at = anchor(k.ctx, 'percy_curry_fishball');
  k.place(k.player, relative(k.ctx, 'percy_curry_fishball', 3), at.yaw + Math.PI);
  k.place(chicken, relative(k.ctx, 'percy_curry_fishball', 3.4, 1.3), at.yaw + Math.PI);
  const auntie = k.actor('npc_auntie');
  k.cut(twoShot(k.player.position, auntie?.position ?? at.position, 6));
  return auntie;
}

/** 山雞 turns up once the dust settles; then the money goes back to 魚蛋嬸. */
async function ch1After(k: Kit): Promise<void> {
  const chicken = await chickenRunsIn(k, relative(k.ctx, 'percy_alley', 9));
  await k.talk('ch1_after', chicken);
  await k.fade(true, 0.8);
  const auntie = stageStall(k, chicken);
  await k.wait(0.3);
  await k.fade(false, 0.8);
  await k.talk('ch1_stall', auntie);
}

/** 第二章 card at the edge of the shelter; 浩南 thinks of 蝦叔 over the wide shot. */
async function ch2Card(k: Kit): Promise<void> {
  const p = k.player;
  const yaw = anchor(k.ctx, 'typhoon_entry').yaw;
  k.place(p, p.position.clone(), yaw);
  const ahead = p.position.clone().addScaledVector(yawDir(yaw), 6);
  k.cut(establishing(ahead, yaw, 12, 3.5, 5));
  await chapterCard(k, 2);
  await k.talk('ch2_card', null, false);
}

/** 笑面虎 and his crew waiting on the promenade. */
async function ch2Ambush(k: Kit): Promise<void> {
  const p = k.player;
  const gang = fighters(k, 'typhoon_ambush');
  const tiger = gang.find((c) => c.displayName === speaker('tiger').name) ?? gang[0] ?? null;
  k.music('tension');
  faceAll(gang, p.position);
  if (tiger) {
    p.faceTowards(tiger.position);
    await k.shot(lowAngle(tiger.position, tiger.facing, 2.2));
  }
  await k.talk('ch2_ambush', tiger);
  await k.shot(behind(p.position, centroid(gang, p.position), 3.5, 1.4));
}

/** 第三章 card, then 東星 blocking the crossing to Sogo. */
async function ch3Crossing(k: Kit): Promise<void> {
  const p = k.player;
  const goons = fighters(k, 'sogo_goons');
  const mid = centroid(goons, anchor(k.ctx, 'sogo_crossing').position);
  k.music('tension');
  faceAll(goons, p.position);
  p.faceTowards(mid);
  k.cut(behind(p.position, mid, 4, 5));
  await chapterCard(k, 3);
  await k.talk('ch3_crossing', goons[0] ?? null);
}

/** 烏鴉 flips a dai pai dong table and calls 浩南 out. The table flip is sound only. */
async function ch3Crow(k: Kit): Promise<void> {
  const gang = fighters(k, 'sogo_boss');
  const crow = k.ctx.entities.getCharacter('boss_crow') ?? gang[0];
  if (!crow) return;
  k.music('tension');
  faceAll(gang, k.player.position);
  k.player.faceTowards(crow.position);
  k.cut(lowAngle(crow.position, crow.facing, 3));
  k.sfx('table_flip', crow.position);
  k.sfx('glass_break', crow.position);
  k.sfx('crowd_gasp');
  k.shake(0.4, 0.5);
  await k.wait(1.2);
  await k.talk('ch3_crow', crow);
  k.sfx('boss_roar', crow.position);
  k.shake(0.6, 0.8);
  await k.shot(closeUp(crow.position, crow.facing, 1.8));
}

/** The player walks up to 烏鴉 lying on the ground. */
async function standOver(k: Kit, crow: ICharacter): Promise<void> {
  k.cut(behind(k.player.position, crow.position, 2.2, 4));
  await k.walk(k.player, approach(k.player.position, crow.position, 1.4));
}

/** A brother walks in from Hennessy Road while 山雞 runs ahead of him; returns 山雞. */
async function brothersArrive(k: Kit): Promise<ICharacter> {
  const p = k.player.position;
  const bStart = relative(k.ctx, 'sogo_plaza_entry', -5, 1.2);
  const brother = k.spawn(spawnDefOf(BROTHER, bStart, yawTo(bStart, p)));
  k.go(brother, approach(bStart, p, 2.4), 2);
  const chicken = await chickenRunsIn(k, relative(k.ctx, 'sogo_plaza_entry', -4));
  await k.talk('ending_brothers', chicken);
  return chicken;
}

/** 烏鴉 down, the brothers arrive, the rain stops. Ends on black; the credits follow. */
async function ending(k: Kit): Promise<void> {
  const crow = k.ctx.entities.getCharacter('boss_crow') ?? null;
  k.ctx.world.setWeather('clear', 25);
  if (crow) await standOver(k, crow);
  await k.talk('ending', crow);
  const chicken = await brothersArrive(k);
  const p = k.player.position;
  k.cut(craneUp(p, yawTo(chicken.position, p) + CRANE_OFFSET, 8));
  await k.wait(1.5);
  await k.talk('ending_rain');
  await k.wait(2);
  await k.fade(true, 2);
}

/** 東星 collectors leaning on 魚蛋佬 at his stall. */
async function debtCollectors(k: Kit): Promise<void> {
  const p = k.player;
  const collectors = fighters(k, 'substory_debt');
  const debtor = k.actor('npc_debtor');
  k.music('tension');
  if (debtor) {
    k.anim(debtor, 'cower');
    faceAll(collectors, debtor.position);
  }
  await k.shot(behind(p.position, centroid(collectors, p.position), 2.8, 2.5));
  await k.talk('debt_collectors', collectors[0] ?? null);
  faceAll(collectors, p.position);
}

export const SCENES = {
  intro,
  ch1_alley: ch1Alley,
  ch1_after: ch1After,
  ch2_card: ch2Card,
  ch2_ambush: ch2Ambush,
  ch3_crossing: ch3Crossing,
  ch3_crow: ch3Crow,
  ending,
  debt_collectors: debtCollectors,
} satisfies Record<string, Script>;

export type SceneId = keyof typeof SCENES;

export function isSceneId(id: string): id is SceneId {
  return Object.hasOwn(SCENES, id);
}
