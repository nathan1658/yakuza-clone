/**
 * The clip library: every AnimClip in core/types, keyed by name. Clip defs are
 * shared, immutable data; the Animator caches their sampled form per def.
 */
import type { AnimClip, AnimClipDef } from '../../core/types';
import { ATTACK_CLIP_DEFS } from './clips/attacks';
import { LOCOMOTION_CLIPS } from './clips/locomotion';
import { REACTION_CLIP_DEFS } from './clips/reactions';
import { SOCIAL_CLIP_DEFS } from './clips/social';

export const CLIP_LIBRARY = Object.fromEntries(
  [...LOCOMOTION_CLIPS, ...ATTACK_CLIP_DEFS, ...REACTION_CLIP_DEFS, ...SOCIAL_CLIP_DEFS].map((d) => [d.name, d]),
) as Readonly<Record<AnimClip, AnimClipDef>>;

/** Clips with an `impactAt` strike timing (combat syncs hits to it). */
export const ATTACK_CLIPS: readonly AnimClip[] = ATTACK_CLIP_DEFS.map((d) => d.name as AnimClip);
