export const TUNINGS = {
  standard: { name: 'Standard', description: 'The everyday essential', notes: [40, 45, 50, 55, 59, 64] },
  dropD: { name: 'Drop D', description: 'A little more low end', notes: [38, 45, 50, 55, 59, 64] },
  halfDown: { name: 'Half step down', description: 'A warmer, lower register', notes: [39, 44, 49, 54, 58, 63] },
  wholeDown: { name: 'Whole step down', description: 'Standard, one whole step lower', notes: [38, 43, 48, 53, 57, 62] },
  dropC: { name: 'Drop C', description: 'Deep and resonant', notes: [36, 43, 48, 53, 57, 62] },
  openG: { name: 'Open G', description: 'Made for slide and open chords', notes: [38, 43, 50, 55, 59, 62] },
  openD: { name: 'Open D', description: 'A rich, ringing D major chord', notes: [38, 45, 50, 54, 57, 62] },
  openE: { name: 'Open E', description: 'An open E major chord', notes: [40, 47, 52, 56, 59, 64] },
  dadgad: { name: 'DADGAD', description: 'Open space for something new', notes: [38, 45, 50, 55, 57, 62] },
};
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export function noteName(midi) { return { name: NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1 }; }
export function frequencyFor(midi, a4 = 440) { return a4 * 2 ** ((midi - 69) / 12); }
export function midiFor(frequency, a4 = 440) { return 69 + 12 * Math.log2(frequency / a4); }
export function closestString(frequency, notes, a4 = 440) {
  const midi = midiFor(frequency, a4);
  return notes.reduce((best, note, index) => Math.abs(note - midi) < Math.abs(notes[best] - midi) ? index : best, 0);
}

// YIN difference function with cumulative mean normalization and parabolic refinement.
// Rejects quiet input and nonperiodic signals instead of displaying a spurious note.
export function detectPitch(samples, sampleRate, scratch = new Float32Array(samples.length / 2)) {
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
  if (Math.sqrt(energy / samples.length) < 0.008) return null;
  const maxTau = Math.min(scratch.length - 1, Math.floor(sampleRate / 55));
  const minTau = Math.max(2, Math.floor(sampleRate / 1400));
  const window = samples.length - maxTau;
  scratch[0] = 1;
  let sum = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    let difference = 0;
    for (let i = 0; i < window; i++) { const delta = samples[i] - samples[i + tau]; difference += delta * delta; }
    sum += difference;
    scratch[tau] = sum > 0 ? difference * tau / sum : 1;
  }
  for (let tau = minTau; tau < maxTau - 1; tau++) {
    if (scratch[tau] >= 0.15) continue;
    while (tau + 1 < maxTau && scratch[tau + 1] < scratch[tau]) tau++;
    const a = scratch[tau - 1], b = scratch[tau], c = scratch[tau + 1];
    const denominator = 2 * (2 * b - a - c);
    const refined = tau + (denominator ? (c - a) / denominator : 0);
    return sampleRate / refined;
  }
  return null;
}
