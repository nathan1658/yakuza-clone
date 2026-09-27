import { describe, expect, it } from 'vitest';
import { HENNESSY } from './layout';
import { CAR, CAR_COUNT, CAR_SIGNS, LOOP, TRACKS, TRAM, TramSim } from './trams';
import type { Person, Ring, Tram } from './trams';

const DT = 1 / 60;

function fresh(): { sim: TramSim; dings: Tram[] } {
  const dings: Tram[] = [];
  return { sim: new TramSim((t) => dings.push(t)), dings };
}

function run(sim: TramSim, seconds: number, people: readonly Person[] = [], ring: Ring | null = null, each?: () => void): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    sim.update(DT, people, ring);
    each?.();
  }
}

const nose = (t: Tram): number => t.x + t.track.dir * TRAM.halfLength;
const person = (x: number, z: number): Person => ({ position: { x, z }, radius: 0.35 });

/** Smallest bumper-to-bumper gap between cars on one track. */
function tightest(sim: TramSim, track: number): number {
  const cars = sim.trams.filter((t) => t.track === TRACKS[track]);
  let gap = Infinity;
  for (const a of cars) {
    for (const b of cars) {
      if (a !== b) gap = Math.min(gap, ((((b.x - a.x) * a.track.dir) % LOOP) + LOOP) % LOOP - 2 * TRAM.halfLength);
    }
  }
  return gap;
}

describe('tram sim', () => {
  it('dwells at its stop, then rings and pulls away', () => {
    const { sim, dings } = fresh();
    const car = sim.trams[0]!;
    for (let t = 0; car.dwell === 0 && t < 30; t += DT) sim.update(DT, [], null);
    expect(car.x).toBeCloseTo(TRACKS[0]!.stops[1]!, 2);
    const at = car.x;
    run(sim, TRAM.dwell - 0.1);
    expect(car.x).toBe(at);
    expect(dings.filter((d) => d === car)).toHaveLength(0);
    run(sim, 1);
    expect(dings.filter((d) => d === car)).toHaveLength(1);
    expect(car.x).toBeGreaterThan(at);
  });

  it('stops short of someone on the track, keeps ringing, and goes on once they step off', () => {
    const { sim, dings } = fresh();
    const car = sim.trams[0]!;
    const p = person(-20, TRACKS[0]!.z + 0.4);
    let closest = Infinity;
    run(sim, 20, [p], null, () => (closest = Math.min(closest, p.position.x - p.radius - nose(car))));
    expect(closest).toBeGreaterThanOrEqual(TRAM.margin - 1e-6);
    expect(closest).toBeLessThan(TRAM.margin + 0.05);
    expect(car.held).toBe(true);
    expect(dings.filter((d) => d === car).length).toBeGreaterThanOrEqual(10);
    run(sim, 10);
    expect(nose(car)).toBeGreaterThan(p.position.x);
  });

  it('ignores someone standing clear of its flank', () => {
    const { sim } = fresh();
    const car = sim.trams[0]!;
    const p = person(-20, TRACKS[0]!.z - (TRAM.halfWidth + 0.35 + TRAM.sidePad + 0.05));
    run(sim, 5, [p]);
    expect(car.held).toBe(false);
    expect(nose(car)).toBeGreaterThan(p.position.x);
  });

  it('queues at the headway behind a held car and keeps every car on the road', () => {
    const { sim } = fresh();
    let gap = Infinity;
    let lo = Infinity;
    let hi = -Infinity;
    const watch = (): void => {
      gap = Math.min(gap, tightest(sim, 0), tightest(sim, 1));
      for (const t of sim.trams) {
        lo = Math.min(lo, t.x);
        hi = Math.max(hi, t.x);
      }
    };
    run(sim, 240, [person(100, TRACKS[0]!.z)], null, watch);
    expect(gap).toBeGreaterThanOrEqual(TRAM.headway - 1e-6);
    expect(gap).toBeLessThan(TRAM.headway + 0.1);
    run(sim, 300, [], null, watch);
    expect(gap).toBeGreaterThanOrEqual(TRAM.headway - 1e-6);
    expect(lo).toBeGreaterThanOrEqual(-HENNESSY.farX);
    expect(hi).toBeLessThan(HENNESSY.farX);
  });

  it('stops outside an active fight ring and goes on when the fight ends', () => {
    const { sim } = fresh();
    const car = sim.trams[0]!;
    const ring: Ring = { x: 40, z: 12, r: 10 };
    const reach = ring.r + TRAM.halfWidth;
    const entry = ring.x - Math.sqrt(reach * reach - (ring.z - car.track.z) ** 2);
    let furthest = -Infinity;
    run(sim, 40, [], ring, () => (furthest = Math.max(furthest, nose(car))));
    expect(furthest).toBeLessThanOrEqual(entry - TRAM.ringMargin + 1e-6);
    expect(furthest).toBeGreaterThan(entry - TRAM.ringMargin - 0.05);
    run(sim, 20);
    expect(nose(car)).toBeGreaterThan(ring.x + ring.r);
  });

  it('drives on out of a ring that formed round it', () => {
    const { sim } = fresh();
    const car = sim.trams[TRAM.perTrack]!;
    const from = car.x;
    run(sim, 3, [], { x: from, z: 12, r: 10 });
    expect(car.x).toBeLessThan(from - 15);
  });

  it('dresses every car in boards that fit its body', () => {
    expect(CAR_SIGNS).toHaveLength(CAR_COUNT * 4);
    for (const s of CAR_SIGNS) {
      // Blinds on the ends run across the car, adverts along it.
      const across = Math.abs(Math.sin(s.yaw)) > 0.5;
      expect(Math.abs(across ? s.z : s.x) + s.w / 2).toBeLessThanOrEqual(across ? CAR.flank : CAR.end);
      expect(s.y + s.h / 2).toBeLessThanOrEqual(CAR.roof);
    }
  });
});
