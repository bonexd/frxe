import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistence, normalizeSession, PERSISTENCE_KEYS } from '../web/persistence.mjs';

const track = { id: 'abc', kind: 'youtube', title: 'Song' };

test('session restore preserves current track queue and safe position', () => {
  assert.deepEqual(normalizeSession({ current: track, queue: [track], queueIndex: 0, positionSeconds: 42 }), {
    current: track,
    queue: [track],
    queueIndex: 0,
    positionSeconds: 42,
  });
});

test('legacy session fields migrate without losing playback state', () => {
  assert.deepEqual(normalizeSession({ track, queue: [track], queueIndex: 0, position: 18 }), {
    current: track,
    queue: [track],
    queueIndex: 0,
    positionSeconds: 18,
  });
});

test('malformed session falls back without throwing', () => {
  assert.deepEqual(normalizeSession({ queue: 'bad', queueIndex: 99, positionSeconds: -10 }), {
    current: null,
    queue: [],
    queueIndex: -1,
    positionSeconds: 0,
  });
});

test('persistence tolerates unavailable storage and caps saved collections', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const persistence = createPersistence(storage);

  const favorites = Array.from({ length: 305 }, (_, index) => ({ id: `f-${index}` }));
  const history = Array.from({ length: 125 }, (_, index) => ({ id: `h-${index}` }));
  const playlists = Array.from({ length: 85 }, (_, index) => ({ id: `p-${index}`, tracks: [] }));
  persistence.saveLists({ favorites, history, playlists });

  const lists = persistence.loadLists();
  assert.equal(lists.favorites.length, 300);
  assert.equal(lists.history.length, 120);
  assert.equal(lists.playlists.length, 80);

  const unavailable = createPersistence({
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  });
  assert.doesNotThrow(() => unavailable.loadSession());
  assert.doesNotThrow(() => unavailable.saveSession({ current: track, queue: [track], queueIndex: 0, positionSeconds: 2 }));
});


test('desktop app uses hardened persistence and saves playback position at whole-second changes', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../web/app.mjs', import.meta.url), 'utf8');
  assert.match(appSource, /from ['"]\.\/persistence\.mjs['"]/);
  assert.match(appSource, /createPersistence\(/);
  assert.match(appSource, /persistence\.loadLists\(\)/);
  assert.match(appSource, /persistence\.loadSession\(\)/);
  assert.match(appSource, /persistence\.saveSession\(/);
  assert.match(appSource, /Math\.floor\(.*audio\.currentTime/s);
});


test('reset clears vitr state and legacy Frxe keys without touching unrelated storage', () => {
  const values = new Map([
    ...Object.values(PERSISTENCE_KEYS).map((key) => [key, '{"saved":true}']),
    ['frxe.desktop.preferences.v1', '{"legacy":true}'],
    ['frxe.desktop.favorites.v1', '[]'],
    ['frxe.desktop.history.v1', '[]'],
    ['frxe.desktop.playlists.v1', '[]'],
    ['frxe.desktop.session.v1', '{"legacy":true}'],
    ['unrelated.key', 'keep-me'],
  ]);
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };

  const persistence = createPersistence(storage);
  assert.equal(persistence.resetAll(), true);

  for (const key of Object.values(PERSISTENCE_KEYS)) assert.equal(values.has(key), false);
  assert.equal([...values.keys()].some((key) => key.startsWith('frxe.desktop.')), false);
  assert.equal(values.get('unrelated.key'), 'keep-me');
});
