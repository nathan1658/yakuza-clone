/** The heat meter plus its events and ready cue. */
import type { GameContext } from '../core/types';
import { HeatMeter } from './rules';
import { HEAT } from './tables';

export class HeatGauge {
  private readonly meter = new HeatMeter();

  constructor(private readonly ctx: GameContext) {}

  get value(): number {
    return this.meter.value;
  }

  add(amount: number): void {
    const r = this.meter.add(amount);
    if (r.changed) this.emit();
    if (r.crossedReady) this.ctx.audio.playSfx('heat_ready', { volume: 0.7 });
  }

  update(dt: number, inCombat: boolean): void {
    if (this.meter.tick(dt, inCombat)) this.emit();
  }

  reset(): void {
    this.meter.reset();
    this.emit();
  }

  private emit(): void {
    this.ctx.events.emit('heat:changed', { heat: this.meter.value, maxHeat: HEAT.max });
  }
}
