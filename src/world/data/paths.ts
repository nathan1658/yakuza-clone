/**
 * Pedestrian polylines (x, z) along the pavements, kept ≥ 0.3 m clear of every
 * collider (tested). Percy's east path steps round the fishball cart.
 */
export const PEDESTRIAN_PATHS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[-148, 2.6], [148, 2.6]],
  [[-148, 21.5], [148, 21.5]],
  [[-69, 2.6], [-69, -128]],
  [[-59, 2.6], [-59, -19.5], [-60.6, -21], [-60.6, -27], [-59, -28.5], [-59, -128]],
  [[-63, -128], [-63, -160]],
  [[-148, -162], [58, -162]],
  [[-148, -171], [58, -171]],
  [[53, 46.5], [115, 46.5]],
  [[75.5, -1], [75.5, -38]],
  [[88.5, -1], [88.5, -38]],
  [[12, 26], [12, 62]],
  [[-20, -1], [-20, -42]],
];
