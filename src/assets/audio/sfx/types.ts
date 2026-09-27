import type { SfxId } from '../../../core/types';
import type { Rng } from '../synth/rng';

/** Internal one-shots used by ambience and the music director, never requested by other modules. */
export type ExtraSfxId = 'rope_creak' | 'ship_horn' | 'gameover_sting';
export type AnySfx = SfxId | ExtraSfxId;

/** Where a recipe draws: an offline context, the node to write into, and a seeded RNG per variant. */
export interface Kit {
  readonly c: BaseAudioContext;
  readonly out: AudioNode;
  readonly r: Rng;
}

export interface SfxRecipe {
  /** Rendered length in seconds, tails included. */
  readonly dur: number;
  /** Peak level each rendered variant is normalised to (≤ 0.95). */
  readonly level: number;
  /** Distinct renders; playback avoids repeating the last one. Default 1. */
  readonly variants?: number;
  readonly render: (k: Kit) => void;
}

export type RecipeBook = Partial<Record<AnySfx, SfxRecipe>>;
