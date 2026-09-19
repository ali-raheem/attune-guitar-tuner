import test from 'node:test';
import assert from 'node:assert/strict';
import { TuningConfirmation } from './confirmation.js';

function hold(tracker, cents, start, duration = 1000) {
  let count = 0;
  for (let time = start; time <= start + duration; time += 100) {
    if (tracker.update(40, cents, time)) count++;
  }
  return count;
}
test('each tolerance accepts its boundary and rejects notes just outside it', () => {
  for (const tolerance of [2, 5, 10, 15, 20]) {
    assert.equal(hold(new TuningConfirmation(tolerance), tolerance, 0), 1);
    assert.equal(hold(new TuningConfirmation(tolerance), -tolerance, 0), 1);
    assert.equal(hold(new TuningConfirmation(tolerance), tolerance + .1, 0), 0);
  }
});
test('loose tolerance never re-arms a chime for notes still inside the selected zone', () => {
  const tracker = new TuningConfirmation(20);
  assert.equal(hold(tracker, 18, 0), 1);
  assert.equal(hold(tracker, 18, 1100, 3000), 0);
  assert.equal(hold(tracker, 30, 4200), 0);
  assert.equal(hold(tracker, 18, 5300), 1);
});
test('changing tolerance discards a pending or previous confirmation', () => {
  const tracker = new TuningConfirmation(5);
  assert.equal(hold(tracker, 8, 0), 0);
  tracker.setTolerance(10);
  assert.equal(hold(tracker, 8, 1100), 1);
  tracker.setTolerance(2);
  assert.equal(hold(tracker, 3, 2200), 0);
  assert.equal(hold(tracker, 1, 3300), 1);
});
