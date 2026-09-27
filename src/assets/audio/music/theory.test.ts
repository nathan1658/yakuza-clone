import { describe, expect, it } from 'vitest';
import { ftom, mtof, noteToMidi, pitchClass, ratio, dbToGain, gainToDb } from '../synth/notes';
import { SCALES, parseChord, scaleDegree, snapToScale } from './theory';

describe('notes', () => {
  it('converts midi and frequency', () => {
    expect(mtof(69)).toBeCloseTo(440);
    expect(mtof(60)).toBeCloseTo(261.626, 2);
    expect(mtof(81)).toBeCloseTo(880);
    expect(ftom(mtof(47.5))).toBeCloseTo(47.5, 9);
    expect(ratio(12)).toBeCloseTo(2);
    expect(ratio(7)).toBeCloseTo(1.4983, 3);
  });

  it('parses note names', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('F#3')).toBe(54);
    expect(noteToMidi('Bb2')).toBe(46);
    expect(noteToMidi('Cb4')).toBe(59);
    expect(noteToMidi('B#3')).toBe(60);
    expect(noteToMidi('C-1')).toBe(0);
    expect(noteToMidi('H2')).toBeNaN();
    expect(pitchClass('Db')).toBe(1);
  });

  it('converts levels', () => {
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(gainToDb(1)).toBe(0);
  });
});

describe('scales', () => {
  it('walks pentatonic degrees across octaves', () => {
    const a = 57; // A3
    const pent = SCALES.minorPentatonic;
    expect([0, 1, 2, 3, 4, 5].map((d) => scaleDegree(a, pent, d))).toEqual([57, 60, 62, 64, 67, 69]);
    expect(scaleDegree(a, pent, -1)).toBe(55);
    expect(scaleDegree(a, pent, -5)).toBe(45);
    expect(scaleDegree(60, SCALES.major, 7)).toBe(72);
  });

  it('snaps to the nearest scale tone', () => {
    expect(snapToScale(58, 57, SCALES.minorPentatonic)).toBe(57); // A#3 → A3 (tie with C4 resolves down)
    expect(snapToScale(61, 57, SCALES.minorPentatonic)).toBe(60);
    expect(snapToScale(64, 57, SCALES.minorPentatonic)).toBe(64);
  });
});

describe('chords', () => {
  it('voices chord symbols from C3', () => {
    expect(parseChord('Am')?.tones).toEqual([57, 60, 64]);
    expect(parseChord('Fmaj7')?.tones).toEqual([53, 57, 60, 64]);
    expect(parseChord('Em7')?.tones).toEqual([52, 55, 59, 62]);
    expect(parseChord('C')?.tones).toEqual([48, 52, 55]);
    expect(parseChord('E5')?.tones).toEqual([52, 59]);
  });

  it('handles slash bass and rejects junk', () => {
    const c = parseChord('G/B');
    expect(c?.tones).toEqual([55, 59, 62]);
    expect(c?.bass).toBe(59);
    expect(parseChord('Am')?.bass).toBe(57);
    expect(parseChord('Xm')).toBeNull();
    expect(parseChord('Cwhatever')).toBeNull();
  });
});
