/** Thin node factories. Each returns a started/configured node ready to connect. */

export function gain(c: BaseAudioContext, value = 0): GainNode {
  const g = c.createGain();
  g.gain.value = value;
  return g;
}

export function osc(c: BaseAudioContext, type: OscillatorType, freq: number, t: number, dur: number, detune = 0): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.setValueAtTime(detune, t);
  o.start(t);
  o.stop(t + dur);
  return o;
}

export function biquad(c: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.707, gainDb = 0): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gainDb;
  return f;
}

/** Connect nodes in series; returns the last so callers can keep chaining. */
export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]);
  return nodes[nodes.length - 1];
}

/** Vowel formant centres (Hz) for voice-like filtering. */
export const FORMANTS = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  e: [400, 2000, 2550],
  u: [325, 700, 2530],
} as const;

/** Parallel resonant band-passes (a vowel) from `input` into `output`; F1 loudest. */
export function formant(c: BaseAudioContext, input: AudioNode, output: AudioNode, vowel: keyof typeof FORMANTS, q = 8): void {
  FORMANTS[vowel].forEach((f, i) => chain(input, biquad(c, 'bandpass', f, q), gain(c, 1 / (1 + i)), output));
}
