import type { ZoneId } from '../../core/types';
import { zoneAt } from './zones';

/** A new zone must hold this far around the body before it counts, so walking a boundary doesn't flap. */
const HYSTERESIS = 1.5;

export interface ZoneChange {
  from: ZoneId | null;
  to: ZoneId;
}

/** The zone the player is in, with hysteresis. Pure: feed it XZ, get changes back. */
export class ZoneTracker {
  private zone: ZoneId = 'percy';
  private started = false;

  get current(): ZoneId {
    return this.zone;
  }

  /** The change to announce, or null. The first call always announces (from = null). */
  update(x: number, z: number): ZoneChange | null {
    const here = zoneAt(x, z);
    if (!this.started) {
      this.started = true;
      this.zone = here;
      return { from: null, to: here };
    }
    if (here === this.zone) return null;
    const d = HYSTERESIS;
    if (zoneAt(x + d, z) !== here || zoneAt(x - d, z) !== here) return null;
    if (zoneAt(x, z + d) !== here || zoneAt(x, z - d) !== here) return null;
    const from = this.zone;
    this.zone = here;
    return { from, to: here };
  }
}
