/** Minimap drawn straight from the layout tables, so the map can never drift from the streets. */
import type { MinimapData, MinimapShape } from '../../core/types';
import { BLOCKS, FLYOVER, HENNESSY, SOGO, TRAM_ISLANDS, WALK } from './layout';
import { rect, rectPolygon } from './rect';
import type { Rect } from './rect';

const shape = (kind: MinimapShape['kind'], r: Rect): MinimapShape => ({ kind, points: rectPolygon(r) });

const RAIL_HALF = 0.6;

export const MINIMAP: MinimapData = {
  bounds: { minX: -150, minZ: -200, maxX: 160, maxZ: 80 },
  shapes: [
    shape('water', rect(-150, 160, -200, -175)),
    shape('road', rect(-150, 150, HENNESSY.northKerb, HENNESSY.southKerb)),
    shape('road', rect(-68, -60, -130, 0)),
    shape('road', rect(50, 110, 0, 24)),
    shape('road', rect(-150, 160, FLYOVER.z0, FLYOVER.z1)),
    ...[
      rect(-150, 150, 0, HENNESSY.northKerb),
      rect(-150, 150, HENNESSY.southKerb, 24),
      rect(-72, -68, -130, 0),
      rect(-60, -56, -130, 0),
      WALK.alley,
      WALK.path,
      WALK.eastPoint,
      WALK.cannon,
      WALK.pennington,
      WALK.sogoEntrance,
      WALK.pier,
      WALK.gangway,
      WALK.crabDeck,
      ...TRAM_ISLANDS.map((i) => i.rect),
    ].map((r) => shape('sidewalk', r)),
    shape('plaza', WALK.plaza),
    shape('plaza', WALK.promenade),
    ...[HENNESSY.trackN, HENNESSY.trackS].map((z) => shape('rail', rect(-150, 150, z - RAIL_HALF, z + RAIL_HALF))),
    ...BLOCKS.filter((b) => !b.backdrop).map((b) => shape('building', b.rect)),
    ...[SOGO.west, SOGO.centre, SOGO.east, SOGO.wing].map((r) => shape('building', r)),
  ],
  labels: [
    { text: '波斯富街', x: -64, z: -65 },
    { text: '軒尼詩道', x: -40, z: 12 },
    { text: '崇光百貨', x: 100, z: 65 },
    { text: '避風塘', x: -60, z: -188 },
    { text: '東角道', x: 82, z: -20 },
    { text: '景隆街', x: -20, z: -22 },
    { text: '邊寧頓街', x: 12, z: 44 },
    { text: '告士打道', x: 110, z: -140 },
  ],
};
