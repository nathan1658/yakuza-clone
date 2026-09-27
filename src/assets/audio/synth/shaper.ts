/** Waveshaping distortion. */
const curves = new Map<number, Float32Array<ArrayBuffer>>();

/** Normalised tanh curve: odd-symmetric, maps ±1 to ±1, harder with larger `drive`. Cached. */
export function driveCurve(drive: number): Float32Array<ArrayBuffer> {
  let curve = curves.get(drive);
  if (curve) return curve;
  curve = new Float32Array(2048);
  const norm = Math.tanh(drive);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  curves.set(drive, curve);
  return curve;
}

export function shaper(c: BaseAudioContext, drive: number): WaveShaperNode {
  const w = c.createWaveShaper();
  w.curve = driveCurve(drive);
  w.oversample = '4x';
  return w;
}
