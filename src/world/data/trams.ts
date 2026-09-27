/**
 * Hennessy Road trams as a pure simulation: three cars on each track, a
 * dwell at every island, a headway behind the car in front, and never a
 * move into a person or, from outside, into an active fight ring. No
 * three.js here, so it is unit tested; TramLine gives the cars bodies,
 * models and a bell.
 */
import { HENNESSY, TRAM_ISLANDS } from './layout';
import type { SignDef } from './signs';

export const TRAM = {
  halfLength: 6,
  halfWidth: 1.05,
  height: 4.3,
  /** m/s; then m/s² pulling away and braking. */
  cruise: 7,
  accel: 1,
  brake: 4,
  /** Seconds at each stop. */
  dwell: 6,
  /** How far ahead of the nose the driver watches for people. */
  lookahead: 8,
  /** Stops this far short of a person. */
  margin: 1.2,
  /** A person this close to the flank counts as in the car's path. */
  sidePad: 0.15,
  /** Bumper-to-bumper gap kept behind the car in front. */
  headway: 4,
  /** Stops this far short of a fight ring it is not already inside. */
  ringMargin: 0.5,
  /** Seconds between dings while someone stands in the way. */
  bellEvery: 1.2,
  perTrack: 3,
} as const;

/** Cars run off one end of the road and come back on at the other. */
export const LOOP = 2 * HENNESSY.farX;

export interface Track {
  readonly z: number;
  /** +1 eastbound (+X), -1 westbound. */
  readonly dir: 1 | -1;
  /** Where a car's centre halts at each island, in travel order. */
  readonly stops: readonly number[];
  /** The first car's x: between two islands, so the street has a tram in it from the start. */
  readonly start: number;
}

function stopsFor(track: 'N' | 'S', dir: 1 | -1): number[] {
  return TRAM_ISLANDS.filter((i) => i.track === track)
    .map((i) => (i.rect.x0 + i.rect.x1) / 2)
    .sort((a, b) => (a - b) * dir);
}

export const TRACKS: readonly Track[] = [
  { z: HENNESSY.trackN, dir: 1, stops: stopsFor('N', 1), start: -40 },
  { z: HENNESSY.trackS, dir: -1, stops: stopsFor('S', -1), start: 40 },
];

/** x wrapped into [-farX, farX). */
export function wrapX(x: number): number {
  return ((((x + HENNESSY.farX) % LOOP) + LOOP) % LOOP) - HENNESSY.farX;
}

/** Distance travelling `dir` from `from` to `to`, round the loop: [0, LOOP). */
function ahead(from: number, to: number, dir: number): number {
  return ((((to - from) * dir) % LOOP) + LOOP) % LOOP;
}

/** As ahead(), but negative when `to` is nearer behind: [-LOOP/2, LOOP/2). */
function offset(from: number, to: number, dir: number): number {
  const d = ahead(from, to, dir);
  return d < LOOP / 2 ? d : d - LOOP;
}

/** Anyone who can stand in the road; characters fit as they are. */
export interface Person {
  readonly position: { readonly x: number; readonly z: number };
  readonly radius: number;
}

/** An active fight ring, as a circle on the ground. */
export interface Ring {
  x: number;
  z: number;
  r: number;
}

export interface Tram {
  readonly track: Track;
  /** Centre along the road. */
  x: number;
  speed: number;
  /** Index into track.stops of the stop it is heading for. */
  next: number;
  /** Seconds left at the current stop; 0 while running. */
  dwell: number;
  /** Seconds until the bell may ring again. */
  bell: number;
  /** Someone stands in its path. */
  held: boolean;
}

function nextStop(track: Track, x: number): number {
  let best = 0;
  track.stops.forEach((s, i) => {
    if (ahead(x, s, track.dir) < ahead(x, track.stops[best]!, track.dir)) best = i;
  });
  return best;
}

/** Room to the nearest person in the path and within the lookahead; Infinity if nobody. */
function personGap(track: Track, nose: number, people: readonly Person[]): number {
  let gap = Infinity;
  for (const p of people) {
    if (Math.abs(p.position.z - track.z) > TRAM.halfWidth + p.radius + TRAM.sidePad) continue;
    // Nose to the near side of the person; below -2r they are alongside or behind.
    const s = offset(nose, p.position.x, track.dir) - p.radius;
    if (s < -2 * p.radius || s > TRAM.lookahead) continue;
    gap = Math.min(gap, Math.max(0, s - TRAM.margin));
  }
  return gap;
}

/**
 * Room to where the car would enter the ring. A car already in it (the
 * fight started round it) carries on out; people in its way still stop it.
 */
function ringGap(track: Track, nose: number, ring: Ring | null): number {
  if (!ring) return Infinity;
  const reach = ring.r + TRAM.halfWidth;
  const dz = ring.z - track.z;
  if (Math.abs(dz) >= reach) return Infinity;
  const entry = offset(nose, ring.x, track.dir) - Math.sqrt(reach * reach - dz * dz);
  return entry < 0 ? Infinity : Math.max(0, entry - TRAM.ringMargin);
}

export class TramSim {
  readonly trams: Tram[] = [];

  /** `ding` rings the bell of the car it is given. */
  constructor(private readonly ding: (tram: Tram) => void) {
    for (const track of TRACKS) {
      for (let k = 0; k < TRAM.perTrack; k++) {
        const x = wrapX(track.start - track.dir * k * (LOOP / TRAM.perTrack));
        this.trams.push({ track, x, speed: TRAM.cruise, next: nextStop(track, x), dwell: 0, bell: 0, held: false });
      }
    }
  }

  update(dt: number, people: readonly Person[], ring: Ring | null): void {
    if (dt <= 0) return;
    for (const t of this.trams) this.step(t, dt, people, ring);
  }

  private step(t: Tram, dt: number, people: readonly Person[], ring: Ring | null): void {
    const { dir, stops } = t.track;
    t.bell = Math.max(0, t.bell - dt);
    if (t.dwell > 0) {
      t.held = false;
      t.dwell = Math.max(0, t.dwell - dt);
      if (t.dwell === 0) this.sound(t);
      return;
    }
    const nose = t.x + dir * TRAM.halfLength;
    const person = personGap(t.track, nose, people);
    t.held = person < Infinity;
    if (t.held && t.bell === 0) this.sound(t);
    const toStop = ahead(t.x, stops[t.next]!, dir);
    const gap = Math.min(toStop, person, this.carGap(t, nose), ringGap(t.track, nose, ring));
    // Brake so the car could halt within the gap; never move past it.
    t.speed = Math.min(t.speed + TRAM.accel * dt, TRAM.cruise, Math.sqrt(2 * TRAM.brake * gap));
    const move = Math.min(t.speed * dt, gap);
    t.x = wrapX(t.x + dir * move);
    if (toStop - move > 1e-3) return;
    t.next = (t.next + 1) % stops.length;
    t.dwell = TRAM.dwell;
    t.speed = 0;
  }

  /** Room to the rear of the next car along the track, less the headway. */
  private carGap(t: Tram, nose: number): number {
    let gap = Infinity;
    for (const o of this.trams) {
      if (o === t || o.track !== t.track) continue;
      gap = Math.min(gap, ahead(nose, o.x - o.track.dir * TRAM.halfLength, t.track.dir));
    }
    return Math.max(0, gap - TRAM.headway);
  }

  private sound(t: Tram): void {
    t.bell = TRAM.bellEvery;
    this.ding(t);
  }
}

/** The car body in its own frame: nose along +X, right flank +Z, rails at y = 0. */
export const CAR = {
  flank: TRAM.halfWidth - 0.03,
  end: TRAM.halfLength - 0.1,
  skirt: 0.32,
  roof: 3.95,
  lowerBand: [0.95, 1.95],
  adBand: [1.95, 2.78],
  upperBand: [2.78, 3.6],
} as const;

export const CAR_COUNT = TRACKS.length * TRAM.perTrack;

/** Painted adverts on the band between the decks: text, letters, panel. */
const ADS: ReadonlyArray<readonly [string, number, number]> = [
  ['大華珠寶 金價最抵', 0xf6d27a, 0x8a0f14],
  ['維港傳呼 一呼即應', 0x5fe3ff, 0x0d1620],
  ['好運海鮮酒家 龍蝦特價', 0xb3121a, 0xf2c230],
  ['東方銀行 置業首選', 0xc81e24, 0xf2efe6],
  ['新世紀影音 全港最平', 0xffe14a, 0x1438a8],
  ['金城錶行 名錶特價', 0xffffff, 0x5a1b7a],
];
/** Roller-blind destinations for eastbound and westbound cars. */
const EAST: readonly string[] = ['筲箕灣', '北角', '筲箕灣'];
const WEST: readonly string[] = ['堅尼地城', '上環', '跑馬地'];

const PAINTED = {
  kind: 'box', vertical: false, depth: 0, twoSided: false, mount: 0, mode: 'steady', font: 'sans', shape: 'board', phase: 0,
} as const;

/** What car `i` (TramSim order) wears: an advert down each flank, its destination at each end. */
export function carSigns(i: number): SignDef[] {
  const dir = TRACKS[Math.floor(i / TRAM.perTrack)]!.dir;
  const [text, color, panel] = ADS[i % ADS.length]!;
  const [a0, a1] = CAR.adBand;
  // Paint is lit by the street, not from inside: dim. The blinds are backlit.
  const ad = { ...PAINTED, text, color, panel, x: 0, y: (a0 + a1) / 2, w: 9.4, h: 0.62, power: 0.35 };
  const blind = {
    ...PAINTED, text: (dir > 0 ? EAST : WEST)[i % TRAM.perTrack]!, color: 0xf4f1e6, panel: 0x111111,
    y: CAR.roof - 0.17, z: 0, w: 1.3, h: 0.3, power: 1,
  };
  return [
    { ...ad, z: CAR.flank, yaw: 0 },
    { ...ad, z: -CAR.flank, yaw: Math.PI },
    { ...blind, x: CAR.end, yaw: Math.PI / 2 },
    { ...blind, x: -CAR.end, yaw: -Math.PI / 2 },
  ];
}

/** Every car's boards, for the sign atlas. */
export const CAR_SIGNS: readonly SignDef[] = Array.from({ length: CAR_COUNT }, (_, i) => carSigns(i)).flat();
