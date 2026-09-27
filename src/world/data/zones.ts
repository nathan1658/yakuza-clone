import type { ZoneId } from '../../core/types';

/**
 * First matching rule wins. The boundaries sit on street mouths: the flyover
 * underpass belongs to the shelter, everything east of the Sogo junction's
 * west kerb is Sogo, and Percy starts 1 m into the side street.
 */
const ZONE_RULES: ReadonlyArray<readonly [ZoneId, (x: number, z: number) => boolean]> = [
  ['typhoon', (_x, z) => z < -140],
  ['sogo', (x) => x >= 50],
  ['percy', (_x, z) => z < -1],
];

export function zoneAt(x: number, z: number): ZoneId {
  for (const [zone, test] of ZONE_RULES) if (test(x, z)) return zone;
  return 'hennessy';
}
