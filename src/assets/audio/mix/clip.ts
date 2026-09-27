/**
 * Safety clipper curve for the end of the master chain. Identity up to `knee`,
 * then a tanh shoulder, so the limiter's attack overshoot can never reach
 * full scale. WaveShaper clamps its input to [-1, 1], so the curve's end
 * value is the absolute output ceiling.
 */
export function softClipCurve(knee: number, size = 4096): Float32Array<ArrayBuffer> {
  const room = 1 - knee;
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = a <= knee ? x : Math.sign(x) * (knee + room * Math.tanh((a - knee) / room));
  }
  return curve;
}
