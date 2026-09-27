/** Pure bookkeeping for overlapping timed ducks: deepest amount wins, latest end wins. */
export interface DuckState {
  amount: number;
  until: number;
}

export function mergeDuck(s: DuckState, now: number, amount: number, seconds: number): DuckState {
  const a = Math.min(1, Math.max(0, amount));
  const active = now < s.until;
  return {
    amount: active ? Math.max(s.amount, a) : a,
    until: Math.max(active ? s.until : now, now + Math.max(0, seconds)),
  };
}
