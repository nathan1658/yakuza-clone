/**
 * Plays a DialogueGraph through ui.presentLine. Lines run in order; a node's
 * choices hang off its last line (disabled while their condition fails). Node
 * effects apply after the lines, then the picked choice's effects. Game modes
 * and camera framing are the caller's business (see runtime/Converse.ts).
 *
 * A choice line resolving -1 means the box was hidden or superseded (a load,
 * a new game): the run aborts without applying anything.
 */
import type { AnimClip, DialogueLineView, GameContext, ICharacter } from '../../core/types';
import { speaker, type SpeakerKey } from '../scripts/speakers';
import { applyEffects, evalCondition } from './logic';
import type { Choice, DialogueEnv, DialogueGraph, DialogueNode, Line } from './types';

export interface RunOptions {
  /** Who the player talks to (the player faces them on their own lines). */
  partner?: ICharacter | null;
  /** False once the calling script is stale; checked after every line. */
  alive?: () => boolean;
  /** Before each line: speaker and the one they address (cutscene cameras). */
  onLine?: (speaker: ICharacter | null, listener: ICharacter | null) => void;
}

const ABORT = -2;
const noop = (): void => {};

/** Returns the terminal node's `end` tag ('' when it has none), or null when aborted. */
export async function runDialogue(
  ctx: GameContext, graph: DialogueGraph, env: DialogueEnv, opts: RunOptions = {},
): Promise<string | null> {
  let node: DialogueNode | undefined = graph.nodes[graph.entry];
  while (node) {
    const pick = await playNode(ctx, node, env, opts);
    if (pick === ABORT) return null;
    applyEffects(node.effects, env);
    const choice: Choice | undefined = node.choices?.[pick];
    applyEffects(choice?.effects, env);
    const next: string | undefined = choice?.next ?? node.next;
    if (!next) return node.end ?? '';
    node = graph.nodes[next];
  }
  return null;
}

async function playNode(ctx: GameContext, node: DialogueNode, env: DialogueEnv, opts: RunOptions): Promise<number> {
  const alive = opts.alive ?? (() => true);
  const last = node.lines.length - 1;
  let pick = -1;
  for (const [i, line] of node.lines.entries()) {
    const choices = i === last ? choiceViews(node, env) : undefined;
    pick = await sayLine(ctx, line, opts, choices);
    if (!alive() || (choices && pick < 0)) return ABORT;
  }
  return pick;
}

function choiceViews(node: DialogueNode, env: DialogueEnv): DialogueLineView['choices'] {
  return node.choices?.map((c) => (evalCondition(c.condition, env) ? { text: c.text } : { text: c.text, disabled: true }));
}

/** One line: turn the pair towards each other, gesture, show it, wait. */
export async function sayLine(
  ctx: GameContext, line: Line, opts: RunOptions = {}, choices?: DialogueLineView['choices'],
): Promise<number> {
  const sp = speaker(line.speaker);
  const actor = actorFor(ctx, line.speaker);
  const listener = listenerFor(ctx, line, actor, opts.partner ?? null);
  faceEachOther(actor, listener);
  opts.onLine?.(actor, listener);
  if (line.sfx) ctx.audio.playSfx(line.sfx);
  const restore = actor ? gesture(actor, line.anim ?? sp.gesture) : noop;
  const view: DialogueLineView = { speaker: sp.name, text: line.text, speakerColor: sp.color };
  if (line.gloss) view.gloss = line.gloss;
  if (choices) view.choices = choices;
  try {
    return await ctx.ui.presentLine(view);
  } finally {
    restore();
  }
}

/** The character voicing a speaker: fixed id, else the nearest living one wearing that name. */
export function actorFor(ctx: GameContext, key: SpeakerKey): ICharacter | null {
  const sp = speaker(key);
  if (sp.characterId === 'player') return ctx.entities.player;
  if (sp.characterId) return ctx.entities.getCharacter(sp.characterId) ?? null;
  if (!sp.name) return null;
  const from = ctx.entities.player.position;
  let best: ICharacter | null = null;
  for (const c of ctx.entities.getCharacters({ alive: true })) {
    if (c.displayName !== sp.name) continue;
    if (!best || c.position.distanceToSquared(from) < best.position.distanceToSquared(from)) best = c;
  }
  return best;
}

function listenerFor(ctx: GameContext, line: Line, actor: ICharacter | null, partner: ICharacter | null): ICharacter | null {
  if (line.face) return actorFor(ctx, line.face);
  const player = ctx.entities.player;
  return actor === player ? partner : player;
}

/** Standing and free to turn (not knocked down, KO'd or mid-attack). */
export function canAct(c: ICharacter): boolean {
  return c.combatState === 'idle' || c.combatState === 'moving';
}

function faceEachOther(a: ICharacter | null, b: ICharacter | null): void {
  if (!a || !b || a === b) return;
  if (canAct(a)) a.faceTowards(b.position);
  if (canAct(b)) b.faceTowards(a.position);
}

/**
 * Looping clips (talk, talkAngry) become the idle clip for the line so
 * locomotion keeps them going; one-shots (nod, point, taunt) just play.
 * Returns the undo.
 */
export function gesture(c: ICharacter, clip: AnimClip): () => void {
  if (clip === 'idle' || !canAct(c)) return noop;
  if (!c.rig.getClipDef(clip).loop) {
    c.playAnim(clip, { restart: true });
    return noop;
  }
  const prev = c.idleClip;
  c.idleClip = clip;
  return () => {
    if (c.idleClip === clip) c.idleClip = prev;
  };
}
