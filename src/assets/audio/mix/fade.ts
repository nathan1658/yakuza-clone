/**
 * Equal-power gain ramps. Built from short linear segments instead of
 * setValueCurveAtTime (which throws when it overlaps other automation) and
 * without cancelAndHoldAtTime (missing in Firefox).
 */
const SEGMENTS = 8;

/** Gain at progress x ∈ [0, 1] of an equal-power move from `from` to `to`. Pure. */
export function eqPower(from: number, to: number, x: number): number {
  const s = to >= from ? Math.sin((x * Math.PI) / 2) : 1 - Math.cos((x * Math.PI) / 2);
  return from + (to - from) * s;
}

/** Move a gain param from wherever it is now to `to` over `dur` seconds along an equal-power curve. */
export function fadeTo(p: AudioParam, now: number, to: number, dur: number): void {
  const from = p.value;
  p.cancelScheduledValues(now);
  p.setValueAtTime(from, now);
  if (dur <= 0) {
    p.setValueAtTime(to, now);
    return;
  }
  for (let i = 1; i <= SEGMENTS; i++) {
    const x = i / SEGMENTS;
    p.linearRampToValueAtTime(eqPower(from, to, x), now + dur * x);
  }
}
