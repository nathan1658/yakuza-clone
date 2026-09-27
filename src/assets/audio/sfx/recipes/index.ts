import type { AnySfx, SfxRecipe } from '../types';
import { CITY } from './city';
import { COMBAT } from './combat';
import { HEAT } from './heat';
import { OBJECTS } from './objects';
import { STINGS } from './stings';
import { UI } from './ui';

/**
 * Every SFX the game can play; the Record type makes a missing id a compile error.
 * Key order is render priority: menus and fists must be ready first.
 */
export const RECIPES: Readonly<Record<AnySfx, SfxRecipe>> = { ...UI, ...COMBAT, ...HEAT, ...OBJECTS, ...CITY, ...STINGS };
