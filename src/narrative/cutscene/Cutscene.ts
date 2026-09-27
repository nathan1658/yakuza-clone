/**
 * Cutscene controller. playScene() puts the game into a clean cinematic
 * state, runs a script against a Kit, and restores everything in `finally`
 * whether the script finished, threw, or went stale. Scripts never check
 * liveness themselves: every awaiting Kit call throws SceneAborted once the
 * scene is stale (new game / load) or the game left the 'cutscene' state.
 */
import type { Vector3 } from 'three';
import type { AnimClip, CameraShot, CharacterSpawnDef, ICharacter, MusicId, SfxId } from '../../core/types';
import { canAct, runDialogue } from '../dialogue/DialogueManager';
import type { Rt } from '../runtime/Env';
import { DIALOGUES, type DialogueId } from '../scripts/index';
import { closeUp, holdOf, lookDown, lowAngle, overShoulder } from './shots';

export class SceneAborted extends Error {}

export interface SceneOptions {
  /** Stay in 'cutscene' afterwards (the caller moves on to credits). */
  keepState?: boolean;
  /** Liveness of the calling task (default: the current session epoch). */
  alive?: () => boolean;
}

interface Staged {
  readonly c: ICharacter;
  readonly pos: Vector3;
  readonly yaw: number;
  readonly brain: ICharacter['brain'];
  readonly idle: AnimClip;
}

/** How long a per-line camera takes to settle (it then holds). */
const LINE_SHOT_SEC = 4;

export class Kit {
  faded = false;
  /** speaker>listener of the per-line shot on screen ('' after a scripted cut). */
  private framed = '';
  private readonly staged = new Map<string, Staged>();
  private readonly temps: ICharacter[] = [];

  constructor(readonly rt: Rt, readonly id: string, private readonly live: () => boolean) {}

  get ctx(): Rt['ctx'] {
    return this.rt.ctx;
  }

  get player(): ICharacter {
    return this.rt.ctx.entities.player;
  }

  alive(): boolean {
    return this.live() && this.ctx.state.is('cutscene');
  }

  check(): void {
    if (!this.alive()) throw new SceneAborted(this.id);
  }

  async wait(sec: number): Promise<void> {
    await this.rt.clock.wait(sec);
    this.check();
  }

  /** Cut to `shot` and hold its last frame until the next cut. Returns at once. */
  cut(shot: CameraShot): void {
    this.framed = '';
    this.play(shot);
  }

  private play(shot: CameraShot): void {
    void this.ctx.cameraRig.playSequence([shot, holdOf(shot)]);
  }

  /** Cut to `shot` and wait out its move. */
  async shot(shot: CameraShot): Promise<void> {
    this.cut(shot);
    await this.wait(shot.duration);
  }

  async fade(toBlack: boolean, sec = 0.6): Promise<void> {
    this.faded = toBlack;
    await this.ctx.ui.fade(toBlack, sec);
    this.check();
  }

  sfx(id: SfxId, position?: Vector3): void {
    this.ctx.audio.playSfx(id, position ? { position } : undefined);
  }

  music(id: MusicId): void {
    this.ctx.audio.playMusic(id);
  }

  shake(intensity: number, duration: number): void {
    this.ctx.cameraRig.shake(intensity, duration);
  }

  /**
   * The lines of a dialogue graph (effects included). Each line cuts to an
   * over-the-shoulder of whoever is spoken to, unless `frame` is false.
   */
  async talk(id: DialogueId, partner: ICharacter | null = null, frame = true): Promise<string | null> {
    const onLine = frame ? (s: ICharacter | null, l: ICharacter | null) => this.frameLine(s, l) : undefined;
    const end = await runDialogue(this.ctx, DIALOGUES[id], this.rt.env, { partner, alive: () => this.alive(), onLine });
    this.ctx.ui.hideDialogue();
    this.check();
    return end;
  }

  /** Narrator lines keep the current shot; a run of lines between the same pair keeps one shot. */
  private frameLine(speaker: ICharacter | null, listener: ICharacter | null): void {
    if (!speaker) return;
    const key = `${speaker.id}>${listener?.id ?? ''}`;
    if (key === this.framed) return;
    this.play(lineShot(speaker, listener));
    this.framed = key;
  }

  /** Take scripted control of a character; brain, idle clip and (for NPCs) spot come back at teardown. */
  use(c: ICharacter): ICharacter {
    if (!this.staged.has(c.id)) {
      this.staged.set(c.id, { c, pos: c.position.clone(), yaw: c.facing, brain: c.brain, idle: c.idleClip });
    }
    c.brain = null;
    return c;
  }

  actor(id: string): ICharacter | null {
    const c = this.ctx.entities.getCharacter(id);
    return c ? this.use(c) : null;
  }

  /** Someone who only exists for this scene. A live character with that id is borrowed instead. */
  spawn(def: CharacterSpawnDef & { id: string }): ICharacter {
    const live = this.ctx.entities.getCharacter(def.id);
    if (live) {
      this.use(live).teleport(def.position, def.yaw);
      return live;
    }
    const c = this.ctx.entities.spawnCharacter(def);
    this.temps.push(c);
    c.brain = null;
    return c;
  }

  place(c: ICharacter, position: Vector3, yaw?: number): void {
    this.use(c).teleport(position, yaw);
  }

  async walk(c: ICharacter, to: Vector3, speed = 1.5): Promise<void> {
    await this.use(c).moveTo(to, speed);
    this.check();
  }

  /** Start walking without waiting for the arrival. */
  go(c: ICharacter, to: Vector3, speed = 1.5): void {
    void this.use(c).moveTo(to, speed);
  }

  /** A one-shot plays once; a looping clip (cower, phone) is held as the idle clip until teardown. */
  anim(c: ICharacter, clip: AnimClip): void {
    this.use(c);
    if (c.rig.getClipDef(clip).loop) c.idleClip = clip;
    else c.playAnim(clip, { restart: true });
  }

  /**
   * Staged NPCs go back where they stood; temps leave; the player keeps the
   * scene's spot. Anyone despawned or replaced meanwhile is left alone.
   */
  release(): void {
    const { entities } = this.ctx;
    for (const s of this.staged.values()) {
      if (entities.getCharacter(s.c.id) !== s.c) continue;
      s.c.brain = s.brain;
      s.c.idleClip = s.idle;
      if (s.c !== this.player) s.c.teleport(s.pos, s.yaw);
    }
    for (const c of this.temps) if (entities.getCharacter(c.id) === c) entities.despawn(c.id);
    this.staged.clear();
    this.temps.length = 0;
  }
}

/**
 * The speaker over the listener's shoulder; the side flips with the pair so
 * the axis holds. Someone on the ground is looked down on, and whoever talks
 * down to them is seen from below. Talking to nobody: a close-up.
 */
function lineShot(speaker: ICharacter, listener: ICharacter | null): CameraShot {
  if (!listener || listener === speaker) return closeUp(speaker.position, speaker.facing, LINE_SHOT_SEC);
  const side = speaker.id < listener.id ? 1 : -1;
  if (!canAct(speaker)) return lookDown(listener.position, speaker.position, side, LINE_SHOT_SEC);
  if (!canAct(listener)) return lowAngle(speaker.position, speaker.facing, LINE_SHOT_SEC);
  return overShoulder(listener.position, speaker.position, side, LINE_SHOT_SEC);
}

/**
 * Run a scene. Resolves true when the script ran to the end, false when it
 * was aborted (or the game could not enter 'cutscene').
 */
export async function playScene(rt: Rt, id: string, script: (k: Kit) => Promise<void>, opts: SceneOptions = {}): Promise<boolean> {
  const { ctx } = rt;
  const live = opts.alive ?? rt.session.token();
  if (!ctx.state.is('cutscene') && !ctx.state.transition('cutscene', { cutsceneId: id })) return false;
  const kit = new Kit(rt, id, live);
  enter(rt, id);
  try {
    await script(kit);
    return kit.alive();
  } catch (err) {
    if (!(err instanceof SceneAborted)) console.error(`[narrative] cutscene ${id} failed`, err);
    return false;
  } finally {
    kit.release();
    if (live()) leave(rt, id, kit.faded, opts.keepState ?? false);
  }
}

function enter(rt: Rt, id: string): void {
  const { ctx } = rt;
  ctx.ui.setLetterbox(true);
  ctx.ui.setHudVisible(false);
  ctx.entities.playerInputEnabled = false;
  ctx.combat.setRandomEncountersEnabled(false);
  ctx.events.emit('cutscene:start', { cutsceneId: id });
}

/** Skipped for stale scenes: the new run owns the presentation by then. */
function leave(rt: Rt, id: string, faded: boolean, keepState: boolean): void {
  const { ctx } = rt;
  if (!keepState && ctx.state.is('cutscene')) ctx.state.transition('freeRoam');
  ctx.cameraRig.stopSequence();
  ctx.ui.hideDialogue();
  if (faded && !keepState) void ctx.ui.fade(false, 0.5);
  ctx.ui.setLetterbox(false);
  ctx.ui.setHudVisible(true);
  ctx.entities.playerInputEnabled = true;
  if (!keepState) ctx.cameraRig.snapBehindTarget();
  ctx.events.emit('cutscene:end', { cutsceneId: id });
}
