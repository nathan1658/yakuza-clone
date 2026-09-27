import type { WeatherKind } from '../../core/types';

export interface WeatherLevels {
  /** Rain streak density 0..1. */
  rain: number;
  /** Street wetness 0..1: darker, glossier, puddles. */
  wet: number;
  /** FogExp2 density. */
  fog: number;
}

const LEVELS: Readonly<Record<WeatherKind, Readonly<WeatherLevels>>> = {
  clear: { rain: 0, wet: 0.3, fog: 0.007 },
  drizzle: { rain: 0.35, wet: 0.8, fog: 0.009 },
  rain: { rain: 1, wet: 1, fog: 0.011 },
};

/** Linear blend between weather presets. Pure: no three.js, no DOM. */
export class WeatherState {
  readonly current: WeatherLevels;
  private readonly from: WeatherLevels;
  private target: WeatherKind;
  private t = 1;
  private duration = 0;

  constructor(kind: WeatherKind) {
    this.target = kind;
    this.current = { ...LEVELS[kind] };
    this.from = { ...LEVELS[kind] };
  }

  get kind(): WeatherKind {
    return this.target;
  }

  set(kind: WeatherKind, seconds = 0): void {
    Object.assign(this.from, this.current);
    this.target = kind;
    this.duration = Math.max(0, seconds);
    this.t = 0;
    this.update(0);
  }

  update(dt: number): void {
    if (this.t >= 1) return;
    this.t = this.duration > 0 ? Math.min(1, this.t + dt / this.duration) : 1;
    const to = LEVELS[this.target];
    const c = this.current;
    c.rain = this.from.rain + (to.rain - this.from.rain) * this.t;
    c.wet = this.from.wet + (to.wet - this.from.wet) * this.t;
    c.fog = this.from.fog + (to.fog - this.from.fog) * this.t;
  }
}
