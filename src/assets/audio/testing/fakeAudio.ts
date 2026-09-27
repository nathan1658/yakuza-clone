/**
 * Minimal strict stand-in for a Web Audio context, for node tests. It enforces
 * the rules real browsers throw on (non-finite or negative times, exponential
 * ramps to zero, double start/stop, bad connections) and records how many
 * nodes a render creates and the latest time anything is scheduled.
 */
export interface FakeStats {
  nodes: number;
  lastEvent: number;
}

class FakeParam {
  value: number;
  constructor(private readonly stats: FakeStats, v: number) {
    this.value = v;
  }
  private at(t: number, v = 0): this {
    if (!Number.isFinite(t) || !Number.isFinite(v)) throw new TypeError(`non-finite automation (${t}, ${v})`);
    if (t < 0) throw new RangeError(`negative time ${t}`);
    this.stats.lastEvent = Math.max(this.stats.lastEvent, t);
    return this;
  }
  setValueAtTime(v: number, t: number) { return this.at(t, v); }
  linearRampToValueAtTime(v: number, t: number) { return this.at(t, v); }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (v === 0) throw new RangeError('exponential ramp to 0');
    return this.at(t, v);
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    if (!(tc >= 0)) throw new RangeError(`bad time constant ${tc}`);
    return this.at(t, v);
  }
  cancelScheduledValues(t: number) { return this.at(t); }
}

class FakeNode {
  readonly outputs: (FakeNode | FakeParam)[] = [];
  constructor(protected readonly stats: FakeStats) {
    stats.nodes++;
  }
  protected p(v: number): FakeParam {
    return new FakeParam(this.stats, v);
  }
  connect<T extends FakeNode | FakeParam>(dst: T): T {
    if (!(dst instanceof FakeNode) && !(dst instanceof FakeParam)) throw new TypeError('connect to a non-node');
    this.outputs.push(dst);
    return dst;
  }
  disconnect(): void {
    this.outputs.length = 0;
  }
}

class FakeSource extends FakeNode {
  private started = false;
  private stopped = false;
  onended: (() => void) | null = null;
  start(t = 0): void {
    if (this.started) throw new Error('InvalidStateError: start twice');
    if (!(t >= 0)) throw new RangeError(`bad start ${t}`);
    this.started = true;
  }
  stop(t = 0): void {
    if (!this.started || this.stopped) throw new Error('InvalidStateError: stop before start or twice');
    if (!(t >= 0)) throw new RangeError(`bad stop ${t}`);
    this.stats.lastEvent = Math.max(this.stats.lastEvent, t);
    this.stopped = true;
  }
}

class FakeBuffer {
  private readonly data: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    if (!(length > 0) || !Number.isInteger(length)) throw new RangeError(`bad buffer length ${length}`);
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(ch: number): Float32Array {
    return this.data[ch];
  }
  copyToChannel(src: Float32Array, ch: number): void {
    this.data[ch].set(src.subarray(0, this.length));
  }
}

export class FakeContext {
  readonly stats: FakeStats = { nodes: 0, lastEvent: 0 };
  readonly destination = new FakeNode(this.stats);
  readonly listener = {};
  currentTime = 0;
  constructor(readonly sampleRate = 48000) {}

  createGain() {
    const n = new FakeNode(this.stats);
    return Object.assign(n, { gain: new FakeParam(this.stats, 1) });
  }
  createOscillator() {
    const n = new FakeSource(this.stats);
    return Object.assign(n, { type: 'sine', frequency: new FakeParam(this.stats, 440), detune: new FakeParam(this.stats, 0) });
  }
  createBiquadFilter() {
    const s = this.stats;
    const n = new FakeNode(s);
    return Object.assign(n, { type: 'lowpass', frequency: new FakeParam(s, 350), Q: new FakeParam(s, 1), gain: new FakeParam(s, 0) });
  }
  createBufferSource() {
    const n = new FakeSource(this.stats);
    return Object.assign(n, { buffer: null as FakeBuffer | null, loop: false, playbackRate: new FakeParam(this.stats, 1), detune: new FakeParam(this.stats, 0) });
  }
  createBuffer(channels: number, length: number, rate: number) {
    return new FakeBuffer(channels, length, rate);
  }
  createWaveShaper() {
    return Object.assign(new FakeNode(this.stats), { curve: null as Float32Array | null, oversample: 'none' });
  }
  createConvolver() {
    return Object.assign(new FakeNode(this.stats), { buffer: null as FakeBuffer | null, normalize: true });
  }
  createStereoPanner() {
    return Object.assign(new FakeNode(this.stats), { pan: new FakeParam(this.stats, 0) });
  }
  createDynamicsCompressor() {
    const s = this.stats;
    return Object.assign(new FakeNode(s), {
      threshold: new FakeParam(s, -24), knee: new FakeParam(s, 30), ratio: new FakeParam(s, 12),
      attack: new FakeParam(s, 0.003), release: new FakeParam(s, 0.25),
    });
  }
  createPanner() {
    const s = this.stats;
    return Object.assign(new FakeNode(s), {
      panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 1, maxDistance: 10000, rolloffFactor: 1,
      positionX: new FakeParam(s, 0), positionY: new FakeParam(s, 0), positionZ: new FakeParam(s, 0),
    });
  }
}

/** A FakeContext typed as the real thing, for code under test. */
export function fakeContext(sampleRate = 48000): { c: BaseAudioContext; stats: FakeStats; ctx: FakeContext } {
  const ctx = new FakeContext(sampleRate);
  return { c: ctx as unknown as BaseAudioContext, stats: ctx.stats, ctx };
}
