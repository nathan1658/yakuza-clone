import type { HitEvent } from '../../core/types';

export type DamageTone = 'blocked' | 'taken' | 'dealt' | 'heavy';

export interface DamageStyle {
  text: string;
  tone: DamageTone;
  /** Screen-shake the number (big impacts). */
  crit: boolean;
}

const HEAVY_KINDS: ReadonlySet<HitEvent['kind']> = new Set(['heavy', 'weapon', 'heat', 'throw']);
const CRIT_KINDS: ReadonlySet<HitEvent['kind']> = new Set(['heat', 'throw']);

/** How a hit is drawn. Null = nothing to show (a zero-damage graze). */
export function damageStyle(hit: HitEvent, playerId: string): DamageStyle | null {
  if (hit.blocked) return { text: '擋', tone: 'blocked', crit: false };
  const amount = Math.round(hit.damage);
  if (amount <= 0) return null;
  if (hit.targetId === playerId) return { text: `-${amount}`, tone: 'taken', crit: false };
  const tone: DamageTone = HEAVY_KINDS.has(hit.kind) ? 'heavy' : 'dealt';
  return { text: String(amount), tone, crit: hit.knockdown || CRIT_KINDS.has(hit.kind) };
}
