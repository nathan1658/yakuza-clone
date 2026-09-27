import type { TrackDef, TrackId } from '../types';
import { combatBoss } from './combatBoss';
import { combatStreet } from './combatStreet';
import { ending } from './ending';
import { exploreHarbour } from './exploreHarbour';
import { exploreNight } from './exploreNight';
import { tension } from './tension';
import { title } from './title';
import { victory } from './victory';

export const TRACKS: Readonly<Record<TrackId, TrackDef>> = {
  title,
  explore_night: exploreNight,
  explore_harbour: exploreHarbour,
  tension,
  combat_street: combatStreet,
  combat_boss: combatBoss,
  victory,
  ending,
};
