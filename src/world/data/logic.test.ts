import { describe, expect, it } from 'vitest';
import { WeatherState } from '../fx/weather';
import { ZoneTracker } from './ZoneTracker';

describe('ZoneTracker', () => {
  it('announces the first zone with from = null', () => {
    const t = new ZoneTracker();
    expect(t.update(-63, -6)).toEqual({ from: null, to: 'percy' });
    expect(t.current).toBe('percy');
    expect(t.update(-63, -8)).toBeNull();
  });

  it('switches only once the new zone holds around the body', () => {
    const t = new ZoneTracker();
    t.update(-64, -10);
    expect(t.update(-64, -0.5)).toBeNull();
    expect(t.current).toBe('percy');
    expect(t.update(-64, 3)).toEqual({ from: 'percy', to: 'hennessy' });
    expect(t.update(-64, -1.5)).toBeNull();
    expect(t.current).toBe('hennessy');
  });

  it('walks from Hennessy into Sogo and down to the shelter', () => {
    const t = new ZoneTracker();
    t.update(0, 12);
    expect(t.update(60, 12)).toEqual({ from: 'hennessy', to: 'sogo' });
    t.update(-63, -100);
    expect(t.current).toBe('percy');
    expect(t.update(-63, -160)).toEqual({ from: 'percy', to: 'typhoon' });
  });
});

describe('WeatherState', () => {
  it('starts on its preset and switches immediately without a duration', () => {
    const w = new WeatherState('rain');
    expect(w.kind).toBe('rain');
    expect(w.current.rain).toBe(1);
    w.set('clear');
    expect(w.kind).toBe('clear');
    expect(w.current.rain).toBe(0);
  });

  it('blends linearly over the transition', () => {
    const w = new WeatherState('clear');
    w.set('rain', 10);
    w.update(5);
    expect(w.current.rain).toBeCloseTo(0.5);
    w.update(10);
    expect(w.current.rain).toBe(1);
    expect(w.current.wet).toBe(1);
  });

  it('starts a new blend from wherever the old one was', () => {
    const w = new WeatherState('clear');
    w.set('rain', 10);
    w.update(5);
    w.set('clear', 5);
    expect(w.current.rain).toBeCloseTo(0.5);
    w.update(5);
    expect(w.current.rain).toBe(0);
  });
});
