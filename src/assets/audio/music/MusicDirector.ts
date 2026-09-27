import type { GameModeId, MusicId, ZoneId } from '../../../core/types';
import { decideMusic, modeDuck, phaseLevel } from './director';

/** What the director drives. Implemented by AudioSystem; faked in tests. */
export interface DirectorOut {
  mode(): GameModeId;
  zone(): ZoneId | null;
  play(id: MusicId, crossfade: number): void;
  setLevel(level: number): void;
  modeDuck(level: number): void;
  gameOverSting(): void;
}

const XF = 1.5;
const XF_COMBAT = 0.6;
const XF_STING = 0.25;

/**
 * Event-driven music policy (agreement #13). Holds only what events tell it:
 * whether the current fight is a boss fight and whether a victory sting is
 * playing (which defers the return to exploration music until it ends).
 */
export class MusicDirector {
  private isBoss = false;
  private victory = false;

  constructor(private readonly out: DirectorOut) {}

  onState(to: GameModeId): void {
    this.out.modeDuck(modeDuck(to));
    const id = decideMusic(to, this.out.zone(), this.isBoss);
    if (id === null || (this.victory && to === 'freeRoam')) return;
    this.victory = false;
    if (to === 'gameOver') this.out.gameOverSting();
    this.out.play(id, to === 'combat' ? XF_COMBAT : to === 'gameOver' ? 3 : XF);
  }

  onZone(): void {
    if (this.out.mode() === 'freeRoam' && !this.victory) this.refresh(2.5);
  }

  onCombatStart(isBoss: boolean): void {
    this.isBoss = isBoss;
    this.out.setLevel(1);
    if (this.out.mode() === 'combat') this.refresh(XF_COMBAT);
  }

  onCombatEnd(victory: boolean): void {
    this.isBoss = false;
    if (!victory) return;
    this.victory = true;
    this.out.play('victory', XF_STING);
  }

  onBossPhase(phase: number): void {
    this.out.setLevel(phaseLevel(phase));
  }

  /** A caller (narrative) picked a track by hand: that cancels any pending victory hand-off. */
  onManual(): void {
    this.victory = false;
  }

  /** The current non-looping track played out. */
  onTrackEnd(): void {
    if (!this.victory) return;
    this.victory = false;
    this.out.play(this.out.mode() === 'freeRoam' ? decideMusic('freeRoam', this.out.zone(), false)! : 'none', 2);
  }

  private refresh(crossfade: number): void {
    const id = decideMusic(this.out.mode(), this.out.zone(), this.isBoss);
    if (id !== null) this.out.play(id, crossfade);
  }
}
