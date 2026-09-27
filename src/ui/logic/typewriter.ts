export const TYPE_CPS = 45;
/** A blip every N visible characters. */
export const BLIP_EVERY = 3;

/** Extra seconds held after punctuation, so lines breathe like speech. */
const PAUSES: Readonly<Record<string, number>> = {
  '，': 0.1, '、': 0.08, ',': 0.1,
  '。': 0.22, '！': 0.22, '？': 0.22, '!': 0.22, '?': 0.22, '…': 0.14, '—': 0.1,
};
const SILENT = /[\s，、。！？…—「」『』（）,.!?"'()~～-]/;

/**
 * Typewriter timeline. Characters are code points (CJK and surrogate-safe).
 * `at[i]` is the time at which character i becomes visible.
 */
export class Typewriter {
  readonly chars: readonly string[];
  private readonly at: number[];
  private t = 0;
  private count = 0;

  constructor(text: string, cps = TYPE_CPS) {
    this.chars = Array.from(text);
    this.at = [];
    let clock = 0;
    for (const ch of this.chars) {
      this.at.push(clock);
      clock += 1 / cps + (PAUSES[ch] ?? 0);
    }
  }

  get shown(): number {
    return this.count;
  }

  get done(): boolean {
    return this.count >= this.chars.length;
  }

  /** Advance by `dt` real seconds. Returns true when a voice blip should play. */
  advance(dt: number): boolean {
    if (this.done) return false;
    this.t += dt;
    const before = this.count;
    while (this.count < this.chars.length && this.at[this.count]! <= this.t) this.count++;
    return blipBetween(this.chars, before, this.count);
  }

  finish(): void {
    this.count = this.chars.length;
  }

  visibleText(): string {
    return this.chars.slice(0, this.count).join('');
  }

  hiddenText(): string {
    return this.chars.slice(this.count).join('');
  }
}

/** Did characters [from, to) include a voiced blip slot? */
export function blipBetween(chars: readonly string[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    if (i % BLIP_EVERY === 0 && !SILENT.test(chars[i]!)) return true;
  }
  return false;
}
