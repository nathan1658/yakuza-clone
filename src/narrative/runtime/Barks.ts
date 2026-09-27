/**
 * Street chatter: a named NPC calls out when the player walks past. Throttled
 * per NPC and globally so the street talks, but never over itself.
 */
import { BARKS, PASSERBY, PASSERBY_NAME, type BarkDef } from '../scripts/barks';
import { NPCS, type NpcDef } from '../scripts/npcs';
import { beatInRange, type BeatId } from '../story/beats';
import type { Rt } from './Env';
import type { Npcs } from './Npcs';

const RANGE = 4;
const NPC_COOLDOWN_SEC = 25;
const GLOBAL_GAP_SEC = 8;
const CHECK_EVERY_SEC = 0.5;
const SHOW_SEC = 3;
const PASSERBY_RANGE = 3;
const PASSERBY_GAP_SEC = 20;

/** The lines `npc` may call out now (the first matching entry wins), or null. */
export function pickBark(
  npc: string, beat: BeatId, flag: (key: string) => unknown, list: readonly BarkDef[] = BARKS,
): readonly string[] | null {
  const def = list.find((b) => b.npc === npc && beatInRange(beat, b.from, b.until) && (!b.flag || Boolean(flag(b.flag))));
  return def && def.lines.length > 0 ? def.lines : null;
}

export class Barks {
  private readonly readyAt = new Map<string, number>();
  private readonly said = new Map<string, number>();
  private nextCheck = 0;
  private passerbyAt = 0;
  private passerbyLine = 0;

  constructor(
    private readonly rt: Rt,
    private readonly npcs: Npcs,
  ) {}

  update(): void {
    const { ctx, clock, session } = this.rt;
    if (clock.now < this.nextCheck) return;
    this.nextCheck = clock.now + CHECK_EVERY_SEC;
    if (session.busy || !ctx.state.is('freeRoam')) return;
    for (const def of NPCS) {
      if (this.tryBark(def)) return;
    }
    this.tryPasserby();
  }

  /** Now and then a pedestrian walking by says something (about 浩南, once he is known). */
  private tryPasserby(): void {
    const { ctx, clock, story } = this.rt;
    if (this.passerbyAt > clock.now) return;
    const lines = pickBark('pedestrian', story.beat, (k) => story.getFlag(k), PASSERBY);
    const player = ctx.entities.player.position;
    const near = ctx.entities.getCharacters({ role: 'pedestrian', alive: true })
      .find((c) => c.position.distanceTo(player) <= PASSERBY_RANGE);
    if (!lines || !near) return;
    ctx.ui.showSubtitle(lines[this.passerbyLine++ % lines.length], PASSERBY_NAME, SHOW_SEC);
    this.passerbyAt = clock.now + PASSERBY_GAP_SEC;
    this.nextCheck = clock.now + GLOBAL_GAP_SEC;
  }

  private tryBark(def: NpcDef): boolean {
    const { ctx, clock, story } = this.rt;
    const c = this.npcs.get(def.id);
    if (!c || (this.readyAt.get(def.id) ?? 0) > clock.now) return false;
    if (c.position.distanceTo(ctx.entities.player.position) > RANGE) return false;
    const lines = pickBark(def.id, story.beat, (k) => story.getFlag(k));
    if (!lines) return false;
    const n = this.said.get(def.id) ?? 0;
    ctx.ui.showSubtitle(lines[n % lines.length], def.name, SHOW_SEC);
    this.said.set(def.id, n + 1);
    this.readyAt.set(def.id, clock.now + NPC_COOLDOWN_SEC);
    this.nextCheck = clock.now + GLOBAL_GAP_SEC;
    return true;
  }
}
