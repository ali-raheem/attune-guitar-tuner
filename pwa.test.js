import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import './version.js';

const code = await readFile(new URL('./sw.js', import.meta.url), 'utf8');
function worker(base) {
  const handlers = {}, deleted = [], cached = [];
  const store = new Map();
  vm.runInNewContext(code, {
    URL, Request, Set, ATTUNE_BUILD: globalThis.ATTUNE_BUILD,
    importScripts: name => assert.equal(name, './version.js'),
    self: { location: {href: `${base}sw.js`}, clients: {claim: async () => {}}, addEventListener: (name, callback) => {handlers[name] = callback;} },
    caches: {
      open: async () => ({addAll: async requests => {for (const request of requests) {cached.push(request.url);store.set(request.url, 'cached');}}, match: async url => store.get(url)}),
      keys: async () => ['attune:/at/:old', `attune:/at/:${globalThis.ATTUNE_BUILD.cacheVersion}`, 'attune:/other/:v1', 'another-app'],
      delete: async name => {deleted.push(name);}
    },
    fetch: async () => 'network'
  });
  return {handlers, deleted, cached};
}

test('offline installation includes every required local asset at root and under /at/', async () => {
  for (const prefix of ['/', '/at/']) {
    const {handlers, cached} = worker(`https://example.test${prefix}`);
    let installed;
    handlers.install({waitUntil: promise => {installed = promise;}});
    await installed;
    for (const url of cached) {
      assert.ok(url.startsWith(`https://example.test${prefix}`));
      const file = url.slice(`https://example.test${prefix}`.length) || 'index.html';
      assert.ok((await readFile(new URL(file, import.meta.url))).length > 0, file);
    }
    assert.ok(cached.includes(`https://example.test${prefix}pwa.js`));
    assert.ok(cached.includes(`https://example.test${prefix}fonts/dm-sans.ttf`));
  }
});

test('activation deletes only outdated caches for this app deployment', async () => {
  const {handlers, deleted} = worker('https://example.test/at/');
  let activated; handlers.activate({waitUntil: promise => {activated = promise;}}); await activated;
  assert.deepEqual(deleted, ['attune:/at/:old']);
});

test('fetch handles app navigations offline and leaves unrelated requests alone', async () => {
  const {handlers} = worker('https://example.test/at/');
  let installed; handlers.install({waitUntil: promise => {installed = promise;}}); await installed;
  async function request(url, mode = 'navigate', method = 'GET') {
    let result; handlers.fetch({request:{url, mode, method},respondWith: promise => {result = promise;}}); return result;
  }
  assert.equal(await request('https://example.test/at/?launch=home'), 'cached');
  assert.equal(await request('https://example.test/at/pitch.js', 'cors'), 'cached');
  assert.equal(await request('https://example.test/other/'), undefined);
  assert.equal(await request('https://example.test/at/missing'), undefined);
  assert.equal(await request('https://external.test/at/'), undefined);
  assert.equal(await request('https://example.test/at/', 'navigate', 'POST'), undefined);
});

test('manifest id is a stable app identity distinct from start_url', async () => {
  const manifest = JSON.parse(await readFile(new URL('./manifest.webmanifest', import.meta.url), 'utf8'));
  // Browsers resolve id against the start_url's origin, not the manifest URL.
  const start = new URL(manifest.start_url, 'https://example.test/at/manifest.webmanifest');
  const id = new URL(manifest.id, start.origin);
  assert.equal(id.href, 'https://example.test/attune');
  assert.notEqual(id.href, start.href);
});
