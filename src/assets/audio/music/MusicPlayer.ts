import type { MusicId } from '../../../core/types';
import { fadeTo } from '../mix/fade';
import { LOOKAHEAD, TICK_MS } from './clock';
import { Sequencer } from './Sequencer';
import { TRACKS } from './tracks';
import type { TrackId } from './types';

/**
 * Owns the running Sequencers and the 25 ms lookahead timer. At most one
 * player is "current"; the others are fading out and die once silent.
 */
export class MusicPlayer {
  private readonly players: Sequencer[] = [];
  private readonly deadAt = new Map<Sequencer, number>();
  private current: Sequencer | null = null;
  private level = 1;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** `onEnd` fires when the current, non-looping track plays out (victory). */
  constructor(
    private readonly c: BaseAudioContext,
    private readonly dest: AudioNode,
    private readonly onEnd: (id: TrackId) => void,
  ) {}

  play(id: MusicId, crossfade: number): void {
    const now = this.c.currentTime;
    const keep = this.players.find((s) => s.id === id && !s.done) ?? null;
    for (const s of this.players) if (s !== keep) this.fadeOut(s, now, crossfade);
    this.current = keep;
    if (id === 'none') return;
    if (!keep) this.current = this.spawn(id, now);
    this.deadAt.delete(this.current!);
    fadeTo(this.current!.fader.gain, now, 1, crossfade);
    this.tick();
    this.timer ??= setInterval(this.tick, TICK_MS);
  }

  /** Boss phase / intensity for every running track (latched at the next bar). */
  setLevel(level: number): void {
    this.level = level;
    for (const s of this.players) s.level = level;
  }

  dispose(): void {
    this.stopTimer();
    for (const s of this.players) s.dispose();
    this.players.length = 0;
    this.deadAt.clear();
    this.current = null;
  }

  private spawn(id: TrackId, now: number): Sequencer {
    const s = new Sequencer(this.c, TRACKS[id], this.dest, now + 0.05);
    s.level = this.level;
    this.players.push(s);
    return s;
  }

  private fadeOut(s: Sequencer, now: number, dur: number): void {
    if (this.deadAt.has(s)) return;
    fadeTo(s.fader.gain, now, 0, dur);
    this.deadAt.set(s, now + dur + 0.1);
  }

  private readonly tick = (): void => {
    const now = this.c.currentTime;
    for (let i = this.players.length - 1; i >= 0; i--) {
      const s = this.players[i];
      if (this.expired(s, now)) this.remove(i);
      else s.advance(now, LOOKAHEAD);
    }
    if (!this.players.length) this.stopTimer();
  };

  private expired(s: Sequencer, now: number): boolean {
    const dead = this.deadAt.get(s);
    return (dead !== undefined && now >= dead) || s.finished(now);
  }

  private remove(i: number): void {
    const s = this.players[i];
    this.players.splice(i, 1);
    this.deadAt.delete(s);
    s.dispose();
    if (s !== this.current) return;
    this.current = null;
    this.onEnd(s.id);
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
