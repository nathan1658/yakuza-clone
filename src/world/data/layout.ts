/**
 * The street plan of our Causeway Bay: every other data table (buildings,
 * furniture, locations, minimap, colliders) is derived from or checked
 * against these rectangles. North is -Z, east is +X.
 */
import { rect } from './rect';
import type { Rect } from './rect';

/** Areas the player can stand on. isWalkable() = inside one of these minus collider footprints. */
export const WALK = {
  hennessy: rect(-150, 150, 0, 24),
  percy: rect(-72, -56, -130, 0),
  alley: rect(-98, -72, -66, -52),
  path: rect(-68, -58, -150, -130),
  promenade: rect(-150, 60, -175, -150),
  pier: rect(-34, -28, -196, -175),
  gangway: rect(18.8, 21.2, -183, -175),
  crabDeck: rect(11, 29, -195, -183),
  plaza: rect(48, 117, 24, 50),
  sogoEntrance: rect(78, 92, 50, 54),
  eastPoint: rect(74, 90, -40, 0),
  cannon: rect(-24, -16, -44, 0),
  pennington: rect(8, 16, 24, 64),
} as const satisfies Record<string, Rect>;

export const WALK_RECTS: readonly Rect[] = Object.values(WALK);

/** Hennessy Road cross-section (z). Traffic keeps left, so eastbound runs in the north half. */
export const HENNESSY = {
  northKerb: 5,
  southKerb: 19,
  trackN: 10, // eastbound trams
  trackS: 14, // westbound trams
  gauge: 1.07,
  /** Half-width of a tram's swept envelope. */
  tramHalfWidth: 1.3,
  /** Visual extent of the road beyond the playable ends (trams wrap here). */
  farX: 260,
} as const;

/** Zebra crossings over Hennessy (x ranges). Railings open here. */
export const CROSSINGS: readonly Rect[] = [rect(-78, -74, 5, 19), rect(-14, -10, 5, 19)];

/**
 * Tram stop islands, staggered either side of each crossing like the real
 * Hennessy stops. `track` is the track they serve.
 */
export const TRAM_ISLANDS: ReadonlyArray<{ rect: Rect; track: 'N' | 'S' }> = [
  { rect: rect(-96, -78, 7.2, 8.6), track: 'N' },
  { rect: rect(-10, 8, 7.2, 8.6), track: 'N' },
  { rect: rect(-74, -56, 15.4, 16.8), track: 'S' },
  { rect: rect(-32, -14, 15.4, 16.8), track: 'S' },
];

/** Roadworks pit in the eastbound lane (barriers around it, cones nearby). */
export const ROADWORKS = rect(33, 41, 6.5, 8.3);

/** The Sogo scramble crossing (junction) on Hennessy. */
export const JUNCTION = rect(50, 110, 0, 24);

/** Boss arena: nothing solid within this XZ radius of the plaza centre. */
export const ARENA = { x: 85, z: 33, radius: 14 } as const;

export const WATER = {
  shoreZ: -175,
  level: -1.3,
  rect: rect(-900, 900, -800, -175),
} as const;

/**
 * Gloucester Road flyover crossing over the path to the promenade. The deck's
 * underside (7.4 m) clears the single-storey N4/N5 roofs (≤ 6 m); the tall
 * N15/BW_P blocks stop short of it at z = -148.
 */
export const FLYOVER = {
  z0: -146,
  z1: -134,
  deckY: 8.6,
  thickness: 1.2,
  x0: -260,
  x1: 260,
  /** Pier columns; none may stand in the Percy→promenade path (x∈[-68,-58]). */
  pierX: [-230, -200, -170, -140, -110, -82, -46, -16, 14, 44, 74, 104, 134, 164, 194, 224, 254],
} as const;

/** Playable bounding box (IWorld.bounds). */
export const BOUNDS = { minX: -150, maxX: 160, minY: -3, maxY: 80, minZ: -200, maxZ: 80 } as const;

/** Batching cells: static geometry is merged per material per cell so whole cells frustum-cull. */
export const CELL_SIZE = 50;

export type Side = 'N' | 'S' | 'E' | 'W';

export type FacadeStyle = 'tong' | 'concrete' | 'commercial' | 'low';

export interface BlockDef {
  readonly id: string;
  readonly rect: Rect;
  /** Street-facing sides, in allocation order (the first side's lots own the corners). */
  readonly fronts: readonly Side[];
  readonly style: FacadeStyle;
  readonly minH: number;
  readonly maxH: number;
  /** 0 = well kept, 1 = grimy and half dark (Tung Shing turf). */
  readonly grit: number;
  /** Visual only (outside the playable area): no colliders. */
  readonly backdrop?: boolean;
}

const B = (
  id: string,
  r: Rect,
  fronts: string,
  style: FacadeStyle,
  minH: number,
  maxH: number,
  grit = 0.2,
  backdrop = false,
): BlockDef => ({ id, rect: r, fronts: [...fronts] as Side[], style, minH, maxH, grit, backdrop });

/**
 * City blocks. Sogo's own building (x∈[60,140], z∈[24,80]) is built separately.
 * N9/N12 stay low so the title orbit (radius 34 around the junction, 11 m up)
 * never clips a roof.
 */
export const BLOCKS: readonly BlockDef[] = [
  B('N1', rect(-150, -72, -52, 0), 'SEN', 'tong', 16, 34),
  B('N2', rect(-150, -98, -66, -52), 'E', 'tong', 14, 22, 0.5),
  B('N3', rect(-150, -72, -130, -66), 'ES', 'tong', 14, 30, 0.85),
  B('N4', rect(-150, -68, -150, -130), 'NE', 'low', 4, 6, 0.6),
  B('N5', rect(-58, 60, -150, -130), 'NW', 'low', 4, 6, 0.5),
  B('N6', rect(-56, -24, -130, 0), 'SWE', 'tong', 16, 36, 0.35),
  B('N7', rect(-16, 48, -130, 0), 'SWE', 'concrete', 24, 52),
  B('N8', rect(-24, -16, -130, -44), 'S', 'tong', 14, 24, 0.5),
  B('N9', rect(48, 74, -26, 0), 'SE', 'low', 4.5, 6),
  B('N10', rect(48, 74, -130, -26), 'SE', 'commercial', 30, 58),
  B('N11', rect(74, 90, -130, -40), 'S', 'concrete', 26, 44),
  B('N12', rect(90, 116, -26, 0), 'SW', 'low', 4.5, 6),
  B('N13', rect(90, 160, -130, -26), 'SW', 'commercial', 34, 64),
  B('N14', rect(116, 160, -26, 0), 'SW', 'concrete', 22, 40),
  B('N15', rect(60, 160, -175, -148), 'WN', 'commercial', 30, 60),
  B('S1', rect(-150, 8, 24, 70), 'NE', 'tong', 16, 40),
  B('S2', rect(16, 48, 24, 70), 'NWE', 'concrete', 22, 46),
  B('S3', rect(8, 16, 64, 70), 'N', 'tong', 14, 20),
  B('S4', rect(48, 60, 50, 80), 'N', 'concrete', 24, 40),
  B('S5', rect(140, 160, 24, 80), 'NW', 'commercial', 30, 50),
  // Backdrop: frames the tram loop and the promenade ends; unreachable.
  B('BW_N', rect(-260, -150, -60, 0), 'S', 'tong', 16, 40, 0.3, true),
  B('BW_S', rect(-260, -150, 24, 80), 'N', 'concrete', 20, 44, 0.2, true),
  B('BE_N', rect(160, 260, -60, 0), 'S', 'commercial', 24, 56, 0.2, true),
  B('BE_S', rect(160, 260, 24, 80), 'N', 'concrete', 20, 44, 0.2, true),
  B('BW_P', rect(-230, -150, -180, -148), 'NE', 'concrete', 18, 36, 0.3, true),
];

/** Sogo department store footprints (colliders); visuals come from build/sogo.ts. */
export const SOGO = {
  west: rect(60, 78, 50, 80),
  centre: rect(78, 92, 54, 80),
  east: rect(92, 140, 50, 80),
  wing: rect(117, 140, 24, 50),
  height: 48,
  wingHeight: 22,
  /** Giant 「崇光 SOGO」 sign on the north face (faces the junction). */
  sign: { x0: 70, x1: 100, y0: 20, y1: 29, z: 49.6 },
} as const;

/** Big video screen on N13's south face, facing +Z (towards the junction). */
export const VIDEO_SCREEN = { x: 103, y: 14.5, z: -25.9, w: 16, h: 9 } as const;
