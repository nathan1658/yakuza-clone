import type { BufferGeometry } from 'three';
import type { AppearancePreset, CharacterAppearance } from '../../core/types';
import { proportions, type Proportions } from '../rig/skeleton';
import { buildAccessories } from './accessories';
import { buildBody, type Look } from './body';
import { bottomDress, buildBottom } from './bottoms';
import { buildHair } from './hair';
import { MeshBuilder } from './MeshBuilder';
import { PRESETS, randomLook } from './presets';
import { buildTop, topDress } from './tops';

export function resolveLook(a: AppearancePreset | CharacterAppearance): Look {
  if (typeof a !== 'string') return a;
  return a === 'pedestrian' ? randomLook() : PRESETS[a];
}

export interface BuiltLook {
  geometry: BufferGeometry;
  proportions: Proportions;
}

export function buildCharacterGeometry(look: Look): BuiltLook {
  const p = proportions(look);
  const b = new MeshBuilder(p);
  buildBody(b, look, { ...topDress(look), ...bottomDress(look) });
  buildTop(b, look);
  buildBottom(b, look);
  buildHair(b, look);
  buildAccessories(b, look);
  return { geometry: b.build(), proportions: p };
}
