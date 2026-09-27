/** AudioParam envelope shapes. Every function starts from silence at `t`. */
const FLOOR = 1e-4;

/** 0 → peak in `attack` (linear), then exponential decay to silence over `decay`. Returns end time. */
export function perc(p: AudioParam, t: number, peak: number, attack: number, decay: number): number {
  const end = t + attack + decay;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.exponentialRampToValueAtTime(Math.max(FLOOR, peak * FLOOR), end);
  p.setValueAtTime(0, end);
  return end;
}

/** Attack, decay to sustain level, hold until t + hold, release. Returns end time. */
export function adsr(
  p: AudioParam, t: number, peak: number,
  a: number, d: number, s: number, hold: number, r: number,
): number {
  const off = t + Math.max(a, hold);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(peak * s, t + a, d / 3);
  p.setTargetAtTime(0, off, r / 4);
  return off + r;
}

/** Exponential glide of a positive-valued param (frequency, cutoff). */
export function glide(p: AudioParam, t: number, from: number, to: number, dur: number): void {
  p.setValueAtTime(from, t);
  p.exponentialRampToValueAtTime(to, t + dur);
}

/** Slow swell in, sharp cut: the reverse-envelope used by risers and reverse swells. */
export function swell(p: AudioParam, t: number, peak: number, rise: number, cut = 0.02): number {
  p.setValueAtTime(FLOOR, t);
  p.exponentialRampToValueAtTime(peak, t + rise);
  p.linearRampToValueAtTime(0, t + rise + cut);
  return t + rise + cut;
}
