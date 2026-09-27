/**
 * Menu cursor reducer. `enabled[i]` says whether row i can take the cursor.
 * Moving wraps around and skips disabled rows; with nothing enabled the
 * cursor stays put.
 */
export function stepIndex(index: number, delta: 1 | -1, enabled: readonly boolean[]): number {
  const n = enabled.length;
  for (let k = 1; k <= n; k++) {
    const i = (((index + delta * k) % n) + n) % n;
    if (enabled[i]) return i;
  }
  return index;
}

/** First enabled row at or after `from` (wrapping), or -1 if none. */
export function firstEnabled(enabled: readonly boolean[], from = 0): number {
  const n = enabled.length;
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    if (enabled[i]) return i;
  }
  return -1;
}

/** Keep a cursor valid after the list changed length (items eaten, etc.). */
export function clampIndex(index: number, count: number): number {
  return count <= 0 ? 0 : Math.min(Math.max(index, 0), count - 1);
}
