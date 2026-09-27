import type { GameContext } from '../core/types';
import type { Clock } from './logic/Clock';
import type { ModalStack } from './Modal';
import type { Projector } from './Projector';

/** What every UI component may use. Nothing else is shared between them. */
export interface Host {
  readonly ctx: GameContext;
  readonly clock: Clock;
  readonly modals: ModalStack;
  readonly projector: Projector;
}
