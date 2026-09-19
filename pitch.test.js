import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, frequencyFor, midiFor, closestString, TUNINGS } from './pitch.js';

function signal(frequency, sampleRate, harmonics = false) {
  return Float32Array.from({ length: 4096 }, (_, i) => {
    const phase = 2 * Math.PI * frequency * i / sampleRate;
    return harmonics ? .15 * Math.sin(phase) + .25 * Math.sin(2 * phase) + .1 * Math.sin(3 * phase) : .3 * Math.sin(phase);
  });
}
test('detects all tuning strings at common sample rates within two cents', () => {
  for (const rate of [44100, 48000]) for (const midi of new Set(Object.values(TUNINGS).flatMap(t => t.notes))) {
    for (const cents of [-35, 0, 27]) {
      const expected = frequencyFor(midi) * 2 ** (cents / 1200);
      for (const harmonics of [false, true]) {
        const actual = detectPitch(signal(expected, rate, harmonics), rate);
        assert.ok(actual && Math.abs(1200 * Math.log2(actual / expected)) < 2, `${expected} Hz at ${rate}: ${actual}`);
      }
    }
  }
});
test('rejects silence, quiet signals, DC input, and deterministic noise', () => {
  assert.equal(detectPitch(new Float32Array(4096), 48000), null);
  assert.equal(detectPitch(signal(110, 48000).map(v => v / 1000), 48000), null);
  assert.equal(detectPitch(new Float32Array(4096).fill(.1), 48000), null);
  let seed = 5;
  const noise = Float32Array.from({ length: 4096 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed / 2 ** 32 - .5) * .5; });
  assert.equal(detectPitch(noise, 48000), null);
});
test('calibration and nearest-string selection respect pitch and octave', () => {
  assert.equal(frequencyFor(69, 442), 442);
  assert.equal(midiFor(442, 442), 69);
  assert.equal(closestString(83, TUNINGS.standard.notes), 0);
  assert.equal(closestString(328, TUNINGS.standard.notes), 5);
  assert.equal(closestString(74, TUNINGS.dropD.notes), 0);
});
