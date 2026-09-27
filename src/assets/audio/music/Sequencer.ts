import { gain } from '../synth/nodes';
import { reverb } from '../synth/reverb';
import { makeClock, pump, type Clock } from './clock';
import { chordAt, compileTrack, type CompiledSection, type CompiledTrack } from './compile';
import { INSTRUMENTS } from './instruments';
import { pan } from './instruments/util';
import type { Chord } from './theory';
import { STEPS_PER_BAR, type Layer, type Note, type Out, type PatEvent, type TrackDef } from './types';

/**
 * Plays one track: walks the form bar by bar and hands each 16th step's events
 * to instruments at exact AudioContext times. Output goes through `fader`,
 * which the MusicPlayer crossfades.
 */
export class Sequencer {
  readonly fader: GainNode;
  /** Boss phase / intensity. Latched at bar starts so changes land on the downbeat. */
  level = 1;
  private readonly track: CompiledTrack;
  private readonly clock: Clock;
  private readonly outs = new Map<Layer, Out>();
  private readonly last = new Map<Layer, number>();
  private readonly note: Note = { t: 0, midi: 0, dur: 0, vel: 0, from: NaN };
  private form = 0;
  private bar = 0;
  private barLevel = 1;
  private transpose = 0;
  private endTime = Infinity;

  constructor(private readonly c: BaseAudioContext, def: TrackDef, dest: AudioNode, start: number) {
    this.track = compileTrack(def);
    this.fader = gain(c, 0);
    this.fader.connect(dest);
    const bus = gain(c, def.gain);
    bus.connect(this.fader);
    const wet = reverb(c, def.space ?? 2.2);
    wet.connect(bus);
    for (const s of this.track.form) this.wire(s, bus, wet);
    this.clock = makeClock(start, def.bpm);
    this.latch();
  }

  get id(): TrackDef['id'] {
    return this.track.def.id;
  }

  /** A non-looping track has scheduled its last note. */
  get done(): boolean {
    return this.endTime !== Infinity;
  }

  /** True once a non-looping track has played out, plus its release tail. */
  finished(now: number): boolean {
    return now > this.endTime + 1.5;
  }

  /** Schedule every step that starts before now + horizon. */
  advance(now: number, horizon: number): void {
    if (this.endTime !== Infinity) return;
    pump(this.clock, now, horizon, this.onStep);
  }

  dispose(): void {
    this.fader.disconnect();
  }

  private wire(s: CompiledSection, bus: AudioNode, wet: AudioNode): void {
    for (const { layer } of s.layers) {
      if (this.outs.has(layer)) continue;
      const dry = gain(this.c, layer.vol ?? 1);
      dry.connect(pan(this.c, layer.pan ?? 0)).connect(bus);
      const send = gain(this.c, layer.vol ?? 1);
      send.connect(wet);
      this.outs.set(layer, { c: this.c, dry, wet: send });
    }
  }

  private latch(): void {
    this.barLevel = this.level;
    this.transpose = this.track.def.levelTranspose?.[this.level] ?? 0;
  }

  private readonly onStep = (abs: number, t: number): void => {
    if (this.done) return;
    const step = abs % STEPS_PER_BAR;
    if (step === 0 && abs > 0) this.nextBar(t);
    if (this.done) return;
    const s = this.track.form[this.form];
    const swing = step % 2 ? (this.track.def.swing ?? 0) * this.track.stepDur : 0;
    const chord = s.chords.length ? chordAt(s, this.bar, step) : null;
    const inBar = this.bar * STEPS_PER_BAR + step;
    for (const cl of s.layers) {
      if (this.barLevel < (cl.layer.min ?? 0) || this.barLevel > (cl.layer.max ?? 99)) continue;
      for (const ev of cl.pat.at[inBar % cl.pat.steps]) this.play(cl.layer, ev, chord, t + swing);
    }
  };

  private nextBar(t: number): void {
    this.latch();
    if (++this.bar < this.track.form[this.form].bars) return;
    this.bar = 0;
    if (++this.form < this.track.form.length) return;
    if (!this.track.def.loop) {
      this.endTime = t;
      return;
    }
    this.form = this.track.def.loopFrom ?? 0;
  }

  private play(layer: Layer, ev: PatEvent, chord: Chord | null, t: number): void {
    const n = this.note;
    const inst = INSTRUMENTS[ev.inst ?? layer.inst!];
    n.t = t;
    n.dur = Math.max(0.03, ev.len * this.track.stepDur - 0.01);
    n.vel = ev.vel;
    const shift = (layer.oct ?? 0) + this.transpose;
    const p = ev.pitch;
    const out = this.outs.get(layer)!;
    n.from = NaN;
    if (p.k === 'chord') {
      for (const m of chord!.tones) {
        n.midi = m + shift + 12 * p.o;
        inst(out, n);
      }
      return;
    }
    n.midi = p.k === 'hit' ? NaN : pitchOf(p, chord) + shift;
    const prev = this.last.get(layer);
    if (ev.slide && prev !== undefined) n.from = prev;
    this.last.set(layer, n.midi);
    inst(out, n);
  }
}

function pitchOf(p: PatEvent['pitch'], chord: Chord | null): number {
  if (p.k === 'abs') return p.m;
  if (p.k === 'root') return chord!.bass + 12 * p.o;
  if (p.k !== 'tone') return NaN;
  const tones = chord!.tones;
  return tones[p.i % tones.length] + 12 * (Math.floor(p.i / tones.length) + p.o);
}
