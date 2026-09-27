import type { GameContext, GameSystem, IInteractable, IInteractionRegistry } from './types';

const DEFAULT_MODES = ['freeRoam'] as const;

/**
 * Picks the single best interactable around the player each frame:
 * usable in the current mode, enabled, within its radius; highest priority
 * wins, then nearest. Emits 'interact:changed' when the pick changes.
 */
export class InteractionRegistry implements IInteractionRegistry, GameSystem {
  readonly name = 'interactions';
  private readonly items = new Map<string, IInteractable>();
  private _current: IInteractable | null = null;

  constructor(private readonly ctx: GameContext) {}

  get current(): IInteractable | null {
    return this._current;
  }

  init(): void {}

  register(i: IInteractable): void {
    this.items.set(i.id, i);
  }

  unregister(id: string): void {
    this.items.delete(id);
    if (this._current?.id === id) this.setCurrent(null);
  }

  tryInteract(): boolean {
    const target = this._current;
    if (!target || !target.isEnabled()) return false;
    target.interact();
    return true;
  }

  update(): void {
    this.setCurrent(this.pick());
  }

  private pick(): IInteractable | null {
    const mode = this.ctx.state.mode;
    const p = this.ctx.entities.player.position;
    let best: IInteractable | null = null;
    let bestPrio = -Infinity;
    let bestDist = Infinity;
    for (const it of this.items.values()) {
      const modes: readonly string[] = it.modes ?? DEFAULT_MODES;
      if (!modes.includes(mode)) continue;
      const q = it.getPosition();
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d > it.radius || !it.isEnabled()) continue;
      const prio = it.priority ?? 0;
      if (prio < bestPrio || (prio === bestPrio && d >= bestDist)) continue;
      best = it;
      bestPrio = prio;
      bestDist = d;
    }
    return best;
  }

  private setCurrent(next: IInteractable | null): void {
    if (next === this._current) return;
    this._current = next;
    this.ctx.events.emit('interact:changed', { interactable: next });
  }
}
