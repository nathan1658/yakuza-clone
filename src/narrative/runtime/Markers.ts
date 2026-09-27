/**
 * Minimap / radar markers. The HUD pulls them every frame, so the list is
 * cached and only rebuilt after the story changes. NPC markers hold the
 * character's live position vector, so they follow without rebuilding.
 */
import type { QuestMarker } from '../../core/types';
import { questDef } from '../scripts/quests';
import { beatDef } from '../story/beats';
import type { Rt } from './Env';
import type { Npcs } from './Npcs';

const PAYPHONE_LABEL = '公眾電話';

export class Markers {
  private cache: QuestMarker[] | null = null;

  constructor(
    private readonly rt: Rt,
    private readonly npcs: Npcs,
  ) {}

  invalidate(): void {
    this.cache = null;
  }

  get(): QuestMarker[] {
    this.cache ??= this.build();
    return this.cache;
  }

  private build(): QuestMarker[] {
    const out: QuestMarker[] = [];
    this.main(out);
    this.substories(out);
    this.fixtures(out);
    return out;
  }

  private main(out: QuestMarker[]): void {
    const { ctx, story } = this.rt;
    const def = beatDef(story.beat);
    if (!def.quest) return;
    const label = questDef(def.quest.id).titleZh;
    const t = def.trigger;
    const position = t.kind === 'talk' ? this.npcs.get(t.npc)?.position : t.kind === 'zone' ? ctx.world.getLocation(t.at).position : undefined;
    if (position) out.push({ id: 'main', kind: 'main', position, label });
  }

  private substories(out: QuestMarker[]): void {
    const { quests } = this.rt.story;
    const debt = quests.status('sub_debt');
    if (debt === 'available' || debt === 'active') this.npcMarker(out, 'npc_debtor', questDef('sub_debt').titleZh);
    const pager = quests.status('sub_pager');
    const label = questDef('sub_pager').titleZh;
    if (pager === 'available' || (pager === 'active' && quests.stage('sub_pager') !== 'find')) this.npcMarker(out, 'npc_pager_owner', label);
    if (pager === 'active' && quests.stage('sub_pager') === 'find') this.hotspotMarker(out, 'hs_lost_pager', label);
  }

  private npcMarker(out: QuestMarker[], npc: string, label: string): void {
    const c = this.npcs.get(npc);
    if (c) out.push({ id: `sub_${npc}`, kind: 'substory', position: c.position, label });
  }

  private hotspotMarker(out: QuestMarker[], id: string, label: string): void {
    const hs = this.rt.ctx.world.getHotspots().find((h) => h.id === id);
    if (hs && !this.rt.story.getFlag('pager_picked')) out.push({ id: `sub_${id}`, kind: 'substory', position: hs.position, label });
  }

  private fixtures(out: QuestMarker[]): void {
    const { ctx } = this.rt;
    for (const hs of ctx.world.getHotspots()) {
      if (hs.kind === 'vendor' && hs.shopId) out.push({ id: hs.id, kind: 'shop', position: hs.position, label: ctx.inventory.getShop(hs.shopId).nameZh });
      if (hs.kind === 'payphone') out.push({ id: hs.id, kind: 'save', position: hs.position, label: PAYPHONE_LABEL });
    }
  }
}
