/**
 * Keeps the named NPCs where the story says they are: spawns, moves and
 * despawns them whenever the beat or the flags change. An NPC is only
 * teleported when its placement changes, so a sync never yanks someone
 * the player is standing next to.
 */
import type { ICharacter } from '../../core/types';
import { NPCS, placementFor, spawnDefOf, type NpcDef, type NpcPlacement } from '../scripts/npcs';
import type { Rt } from './Env';
import { anchor, firstWalkable } from './place';

export class Npcs {
  /** Placement each NPC was last put at (absent = not placed by us). */
  private readonly placed = new Map<string, NpcPlacement>();

  constructor(private readonly rt: Rt) {}

  get(id: string): ICharacter | null {
    const c = this.rt.ctx.entities.getCharacter(id);
    return c && c.isAlive() ? c : null;
  }

  /** `force` re-places everyone (after a load or a new game). */
  sync(force = false): void {
    if (force) this.placed.clear();
    for (const def of NPCS) this.syncOne(def);
  }

  private syncOne(def: NpcDef): void {
    const { ctx, story } = this.rt;
    const want = placementFor(def, story.beat, (k) => story.getFlag(k));
    if (ctx.entities.getCharacter(def.id) && !this.get(def.id)) ctx.entities.despawn(def.id);
    const have = this.get(def.id);
    if (!want) {
      if (have) ctx.entities.despawn(def.id);
      this.placed.delete(def.id);
      return;
    }
    if (have && this.placed.get(def.id) === want) return;
    const a = anchor(ctx, want.at);
    const pos = want.offsets ? firstWalkable(ctx, want.at, want.offsets) : a.position;
    if (have) have.teleport(pos, a.yaw);
    else ctx.entities.spawnCharacter(spawnDefOf(def, pos, a.yaw));
    this.placed.set(def.id, want);
  }
}
