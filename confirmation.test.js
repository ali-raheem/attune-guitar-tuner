import test from 'node:test';
import assert from 'node:assert/strict';
import { TuningConfirmation } from './confirmation.js';

function hold(tracker, note, cents, start, duration) {
  const confirmations = [];
  for (let time = start; time <= start + duration; time += 100) {
    if (tracker.update(note, cents, time)) confirmations.push(time);
  }
  return confirmations;
}
test('confirms a sustained in-tune string once, with independent confirmation for each string', () => {
  const tracker = new TuningConfirmation();
  assert.deepEqual(hold(tracker, 40, 2, 0, 2000), [600]);
  assert.deepEqual(hold(tracker, 45, -3, 2100, 1000), [2700]);
  assert.deepEqual(hold(tracker, 40, 0, 3200, 1000), []);
});
test('brief crossings, silence, long sample gaps, and changed strings cannot complete the dwell', () => {
  const tracker = new TuningConfirmation();
  assert.deepEqual(hold(tracker, 40, 0, 0, 400), []);
  tracker.update(40, 8, 500);
  assert.deepEqual(hold(tracker, 40, 0, 600, 400), []);
  tracker.update(null, null, 1100);
  assert.deepEqual(hold(tracker, 40, 0, 1200, 400), []);
  assert.equal(tracker.update(40, 0, 2200), false);
  assert.deepEqual(hold(tracker, 45, 0, 2300, 400), []);
});
test('minor jitter does not re-arm; a sustained detune or new session does', () => {
  const tracker = new TuningConfirmation();
  hold(tracker, 40, 0, 0, 700);
  hold(tracker, 40, 8, 800, 1000);
  assert.deepEqual(hold(tracker, 40, 0, 1900, 900), []);
  hold(tracker, 40, -20, 2900, 800);
  assert.deepEqual(hold(tracker, 40, 0, 3800, 900), [4400]);
  tracker.reset();
  assert.deepEqual(hold(tracker, 40, 0, 4800, 700), [5400]);
});
