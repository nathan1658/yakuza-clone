import type { EventBus } from '../core/EventBus';
import type { GameEvents, GameModeId, IGameStateMachine, ModePayloads } from '../core/types';

/**
 * Legal mode transitions. Anything not listed is a bug in the caller.
 * dialogue→dialogue and cutscene→cutscene exist so scripts can chain.
 */
export const TRANSITIONS: Readonly<Record<GameModeId, readonly GameModeId[]>> = {
  boot: ['title', 'freeRoam', 'cutscene'],
  title: ['cutscene', 'freeRoam', 'dialogue'],
  freeRoam: ['dialogue', 'combat', 'cutscene', 'menu', 'shop'],
  dialogue: ['freeRoam', 'combat', 'cutscene', 'shop', 'dialogue'],
  cutscene: ['freeRoam', 'combat', 'dialogue', 'credits', 'cutscene'],
  combat: ['heatAction', 'freeRoam', 'gameOver', 'cutscene', 'dialogue', 'menu'],
  heatAction: ['combat', 'freeRoam', 'cutscene', 'gameOver'],
  menu: ['freeRoam', 'combat', 'title'],
  shop: ['freeRoam', 'dialogue'],
  gameOver: ['title', 'freeRoam', 'cutscene'],
  credits: ['title', 'freeRoam'],
};

export class GameStateMachine implements IGameStateMachine {
  private _mode: GameModeId = 'boot';
  private _previous: GameModeId = 'boot';
  private _payload: unknown = undefined;
  private enteredAt = now();

  constructor(private readonly events: EventBus<GameEvents>) {}

  get mode(): GameModeId {
    return this._mode;
  }
  get previous(): GameModeId {
    return this._previous;
  }
  get payload(): unknown {
    return this._payload;
  }
  get timeInMode(): number {
    return (now() - this.enteredAt) / 1000;
  }

  is(...modes: GameModeId[]): boolean {
    return modes.includes(this._mode);
  }

  can(to: GameModeId): boolean {
    return TRANSITIONS[this._mode].includes(to);
  }

  transition<M extends GameModeId>(to: M, payload?: ModePayloads[M]): boolean {
    if (!this.can(to)) {
      console.warn(`[FSM] illegal transition ${this._mode} → ${to}`);
      return false;
    }
    const from = this._mode;
    this._previous = from;
    this._mode = to;
    this._payload = payload;
    this.enteredAt = now();
    this.events.emit('state:changed', { from, to, payload });
    return true;
  }

  back(): boolean {
    return this.transition(this._previous);
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
