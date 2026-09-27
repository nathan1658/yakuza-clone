import type { GameContext } from '../../core/types';
import { el, setText, toggle } from '../dom';

const REFRESH_SEC = 0.25;

/** F3 panel: frame timing, renderer counters and game state, refreshed at 4 Hz. */
export class DebugOverlay {
  private readonly root: HTMLPreElement;
  private on = false;
  private frames = 0;
  private elapsed = 0;

  constructor(parent: HTMLElement, private readonly ctx: GameContext) {
    this.root = el('pre', 'yk-debug', parent);
  }

  toggle(): void {
    this.on = !this.on;
    toggle(this.root, 'is-on', this.on);
    this.frames = 0;
    this.elapsed = 0;
  }

  update(dt: number): void {
    if (!this.on) return;
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < REFRESH_SEC) return;
    setText(this.root, this.report(this.frames / this.elapsed, (this.elapsed / this.frames) * 1000));
    this.frames = 0;
    this.elapsed = 0;
  }

  private report(fps: number, ms: number): string {
    const { engine, state, world, entities, combat, audio } = this.ctx;
    const { calls, triangles } = engine.renderer.info.render;
    const p = entities.player.position;
    return [
      `FPS   ${fps.toFixed(0).padStart(4)}   ${ms.toFixed(2)} ms`,
      `DRAW  ${calls} calls   ${(triangles / 1000).toFixed(1)}k tris`,
      `MODE  ${state.mode}${engine.paused ? ' (paused)' : ''}`,
      `ZONE  ${world.currentZone}`,
      `POS   ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`,
      `CHARS ${entities.getCharacters().length}`,
      `TIME  ×${engine.timeScale.toFixed(2)}`,
      `HEAT  ${combat.heat.toFixed(0)} / ${combat.maxHeat}`,
      `MUSIC ${audio.currentMusic}`,
    ].join('\n');
  }
}
