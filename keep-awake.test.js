import test from 'node:test';
import assert from 'node:assert/strict';
import { KeepAwake } from './keep-awake.js';

class ScreenLock extends EventTarget {
  released = false;
  async release() { this.released = true; this.dispatchEvent(new Event('release')); }
}
function setup(request = async () => new ScreenLock()) {
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const states = [];
  const manager = new KeepAwake({wakeLock: {request}, document, onChange: state => states.push(state)});
  return {document, states, manager};
}
test('keeps an active session awake, releases on stop, and reacquires after returning', async () => {
  const {document, manager, states} = setup();
  await manager.setWanted(true);
  const first = manager.lock;
  assert.equal(states.at(-1), 'active');
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(first.released, true);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  await manager.sync();
  assert.ok(manager.lock && manager.lock !== first);
  const second = manager.lock;
  await manager.setWanted(false);
  assert.equal(second.released, true);
  assert.equal(manager.lock, null);
});
test('a late permission result cannot keep the screen awake after stopping', async () => {
  let grant, requests = 0;
  const {manager} = setup(() => { requests++; return new Promise(resolve => {grant = resolve;}); });
  const pending = manager.setWanted(true);
  manager.setWanted(true);
  await manager.setWanted(false);
  const lock = new ScreenLock();
  grant(lock); await pending;
  assert.equal(requests, 1);
  assert.equal(lock.released, true);
  assert.equal(manager.lock, null);
});
test('denial and system release are reported without repeated requests', async () => {
  let requests = 0;
  const {manager, states} = setup(async () => {requests++; throw new Error('Battery saver');});
  await manager.setWanted(true);
  assert.equal(states.at(-1), 'unavailable');
  assert.equal(requests, 1);
  const working = setup();
  await working.manager.setWanted(true);
  await working.manager.lock.release();
  assert.equal(working.states.at(-1), 'unavailable');
  assert.equal(working.manager.lock, null);
});
test('unsupported browsers continue without a lock', async () => {
  const document = new EventTarget();
  let state;
  const manager = new KeepAwake({document, onChange: value => {state = value;}});
  await manager.setWanted(true);
  assert.equal(state, 'unsupported');
});
