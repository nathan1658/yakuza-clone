/**
 * Full-screen effects. Levels are only pushed when they change (the pipeline
 * smooths towards them); impulses fire and decay on their own.
 */
import type { GameContext } from '../core/types';

type Level = 'heat' | 'lowHealth' | 'bulletTime';

/** Below this share of max HP the screen starts to bleed. */
const LOW_HEALTH = 0.25;

export class RenderFx {
  private readonly last: Record<Level, number> = { heat: 0, lowHealth: 0, bulletTime: 0 };

  constructor(private readonly ctx: GameContext) {}

  pulse(effect: 'damage' | 'flash', intensity: number): void {
    this.ctx.engine.renderPipeline?.setEffect(effect, intensity);
  }

  update(heatAction: boolean, bulletTime: boolean): void {
    const p = this.ctx.entities.player;
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    const low = p.isAlive() && ratio < LOW_HEALTH ? 1 - ratio / LOW_HEALTH : 0;
    this.level('lowHealth', Math.round(low * 20) / 20);
    this.level('heat', heatAction ? 1 : 0);
    this.level('bulletTime', bulletTime ? 1 : 0);
  }

  reset(): void {
    this.level('heat', 0);
    this.level('bulletTime', 0);
    this.level('lowHealth', 0);
  }

  private level(effect: Level, v: number): void {
    if (this.last[effect] === v) return;
    this.last[effect] = v;
    this.ctx.engine.renderPipeline?.setEffect(effect, v);
  }
}
