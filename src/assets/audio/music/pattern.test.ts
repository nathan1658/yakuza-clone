import { describe, expect, it } from 'vitest';
import { compilePattern, parseGrid, parseNotes } from './pattern';

describe('pattern notation', () => {
  it('parses notes, lengths, rests, accents and slides', () => {
    const { steps, events } = parseNotes('A4:4 .:2 ~C5:2! | r, c3\':4? C:4');
    expect(steps).toBe(4 + 2 + 2 + 1 + 4 + 4);
    expect(events.map((e) => e.step)).toEqual([0, 6, 8, 9, 13]);
    expect(events[0].pitch).toEqual({ k: 'abs', m: 69 });
    expect(events[1]).toMatchObject({ slide: true, vel: 1, len: 2 });
    expect(events[2].pitch).toEqual({ k: 'root', o: -1 });
    expect(events[3]).toMatchObject({ pitch: { k: 'tone', i: 2, o: 1 }, vel: 0.5 });
    expect(events[4].pitch).toEqual({ k: 'chord', o: 0 });
  });

  it('rejects bad tokens', () => {
    expect(() => parseNotes('A4 Q7')).toThrow();
    expect(() => parseNotes('c9')).toThrow();
  });

  it('parses drum grids', () => {
    const { steps, events } = parseGrid({ kick: 'X...|x...', hat: 'o.o. o.o.' });
    expect(steps).toBe(8);
    expect(events.filter((e) => e.inst === 'kick').map((e) => [e.step, e.vel])).toEqual([[0, 1], [4, 0.8]]);
    expect(events.filter((e) => e.inst === 'hat')).toHaveLength(4);
    expect(() => parseGrid({ kick: 'X...', snare: 'X.......' })).toThrow();
    expect(() => parseGrid({ kick: 'X..?' })).toThrow();
  });

  it('indexes events by step', () => {
    const p = compilePattern('C4:2 D4:2');
    expect(p.steps).toBe(4);
    expect(p.at.map((a) => a.length)).toEqual([1, 0, 1, 0]);
  });
});
