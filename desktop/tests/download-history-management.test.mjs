import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as core from '../web/core.mjs';

const [app, ui, primitives] = await Promise.all([
  readFile(new URL('../web/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../web/ui.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../web/ui-primitives.mjs', import.meta.url), 'utf8'),
]);

test('removing a downloaded track prunes saved references and keeps queue index valid', () => {
  const removed = { kind: 'local', id: 'removed', title: 'Removed' };
  const kept = { kind: 'local', id: 'kept', title: 'Kept' };
  const next = core.pruneTrackReferences({
    favorites: [removed, kept],
    history: [removed, kept],
    playlists: [{ id: 'mix', name: 'Mix', tracks: [removed, kept] }],
    queue: [kept, removed],
    queueIndex: 1,
  }, removed);

  assert.deepEqual(next.favorites, [kept]);
  assert.deepEqual(next.history, [kept]);
  assert.deepEqual(next.playlists[0].tracks, [kept]);
  assert.deepEqual(next.queue, [kept]);
  assert.equal(next.queueIndex, 0);
});

test('Save and Library expose working download and history management actions', () => {
  assert.match(ui, /data-action="remove-download"/);
  assert.match(app, /case 'remove-download'/);
  assert.match(app, /backend\.removeDownload\(/);
  for (const action of ['remove-history', 'clear-history']) {
    assert.match(ui, new RegExp(`data-action="${action}"`));
    assert.match(primitives, new RegExp(`['"]${action}['"]`));
  }
  assert.match(ui, /Recently played/);
  assert.match(primitives, /vitr\.desktop\.history\.v1/);
});
