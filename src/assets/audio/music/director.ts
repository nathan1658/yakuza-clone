import type { GameModeId, MusicId, ZoneId } from '../../../core/types';

/**
 * Pure music choice for a game mode. `null` means "keep whatever is playing"
 * (dialogue, cutscenes, heat actions, menus), so narrative overrides such as
 * playMusic('tension') survive until the next deciding mode change.
 */
export function decideMusic(mode: GameModeId, zone: ZoneId | null, isBoss: boolean): MusicId | null {
  switch (mode) {
    case 'title': return 'title';
    case 'freeRoam': return zone === 'typhoon' ? 'explore_harbour' : 'explore_night';
    case 'combat': return isBoss ? 'combat_boss' : 'combat_street';
    case 'credits': return 'ending';
    case 'gameOver': return 'none';
    default: return null;
  }
}

/**
 * Standing music/ambience level per mode: paused screens sit the game under the UI,
 * talk sits a little under, heat actions (and the boss QTE) clear room for the impacts.
 */
const MODE_DUCK: Partial<Record<GameModeId, number>> = { menu: 0.5, shop: 0.5, heatAction: 0.5, dialogue: 0.7 };

export function modeDuck(mode: GameModeId): number {
  return MODE_DUCK[mode] ?? 1;
}

/** Boss phase (1-based) → music intensity level 1..3. */
export function phaseLevel(phase: number): number {
  return Math.min(3, Math.max(1, Math.round(phase)));
}
