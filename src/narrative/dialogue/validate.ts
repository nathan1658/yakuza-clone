/**
 * Static checks for dialogue graphs. Returns human-readable problems; an
 * empty list means the graph is sound. Used by tests, not at runtime.
 */
import type { ItemId } from '../../core/types';
import { QUESTS } from '../scripts/quests';
import { SPEAKERS } from '../scripts/speakers';
import type { DialogueGraph, DialogueNode, Effect } from './types';

/** Text that must never ship: ellipses and placeholder markers. */
const BANNED = [/……/, /\.\.\./, /…/, /\bTODO\b/i, /\bTBD\b/i, /lorem/i, /placeholder/i, /FIXME/i];

export function bannedText(text: string): boolean {
  return text.trim() === '' || BANNED.some((re) => re.test(text));
}

function successors(node: DialogueNode): string[] {
  return [...(node.next ? [node.next] : []), ...(node.choices ?? []).map((c) => c.next)];
}

function reachable(g: DialogueGraph): Set<string> {
  const seen = new Set<string>();
  const stack = [g.entry];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    const node = g.nodes[id];
    if (seen.has(id) || !node) continue;
    seen.add(id);
    stack.push(...successors(node));
  }
  return seen;
}

function effectProblems(effects: readonly Effect[] | undefined): string[] {
  const out: string[] = [];
  for (const e of effects ?? []) {
    if (e.type !== 'advanceQuest') continue;
    const def = QUESTS.find((q) => q.id === e.quest);
    if (!def?.stages.some((s) => s.id === e.stage)) out.push(`unknown stage ${e.quest}/${e.stage}`);
  }
  return out;
}

function nodeProblems(g: DialogueGraph, id: string, node: DialogueNode): string[] {
  const out: string[] = [];
  if (node.lines.length === 0) out.push(`${id}: no lines`);
  for (const line of node.lines) {
    if (!(line.speaker in SPEAKERS)) out.push(`${id}: unknown speaker ${line.speaker}`);
    if (bannedText(line.text)) out.push(`${id}: bad text "${line.text}"`);
  }
  for (const next of successors(node)) {
    if (!g.nodes[next]) out.push(`${id}: missing node ${next}`);
  }
  if (node.next && node.choices) out.push(`${id}: has both next and choices`);
  if (node.choices && !node.choices.some((c) => !c.condition)) out.push(`${id}: every choice is conditional`);
  for (const c of node.choices ?? []) {
    if (bannedText(c.text)) out.push(`${id}: bad choice text "${c.text}"`);
    out.push(...effectProblems(c.effects).map((p) => `${id}: ${p}`));
  }
  out.push(...effectProblems(node.effects).map((p) => `${id}: ${p}`));
  return out;
}

export function validateGraph(g: DialogueGraph): string[] {
  const out: string[] = [];
  if (!g.nodes[g.entry]) return [`${g.id}: missing entry ${g.entry}`];
  const seen = reachable(g);
  for (const [id, node] of Object.entries(g.nodes)) {
    if (!seen.has(id)) out.push(`${id}: unreachable`);
    out.push(...nodeProblems(g, id, node));
  }
  const terminal = [...seen].some((id) => successors(g.nodes[id] as DialogueNode).length === 0);
  if (!terminal) out.push('no reachable terminal node');
  return out.map((p) => (p.startsWith(`${g.id}:`) ? p : `${g.id}: ${p}`));
}

/** Every effect anywhere in the graph (node effects, then choice effects). */
export function allEffects(g: DialogueGraph): Effect[] {
  return Object.values(g.nodes).flatMap((n) => [...(n.effects ?? []), ...(n.choices ?? []).flatMap((c) => c.effects ?? [])]);
}

/** Net items given by a graph's effects, summed per item. */
export function itemsGiven(g: DialogueGraph): Map<ItemId, number> {
  const out = new Map<ItemId, number>();
  for (const e of allEffects(g)) {
    if (e.type === 'giveItem') out.set(e.id, (out.get(e.id) ?? 0) + (e.count ?? 1));
  }
  return out;
}
