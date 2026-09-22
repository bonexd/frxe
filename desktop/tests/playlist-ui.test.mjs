import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, ui, primitives, styles] = await Promise.all([
  readFile(new URL('../web/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../web/ui.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../web/ui-primitives.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../web/styles-4.css', import.meta.url), 'utf8'),
]);

test('Library exposes complete local playlist controls', () => {
  assert.match(ui, /id="playlist-create-form"/);
  assert.match(ui, /id="playlist-name"/);
  for (const action of ['open-playlist', 'play-playlist', 'delete-playlist', 'remove-from-playlist']) {
    assert.match(ui, new RegExp(`data-action="${action}"`));
  }
});

test('tracks can choose a playlist from cards and player surfaces', () => {
  assert.match(primitives, /data-action="playlist-picker"/);
  assert.match(ui, /playlist-picker-overlay/);
  assert.match(ui, /data-action="add-to-playlist"/);
  assert.match(ui, /data-action="close-playlist-picker"/);
});

test('playlist actions mutate persisted local state and play the playlist as the active queue', () => {
  for (const helper of ['createPlaylist', 'addTrackToPlaylist', 'removeTrackFromPlaylist', 'deletePlaylist']) {
    assert.match(app, new RegExp(`\\b${helper}\\b`));
  }
  assert.match(app, /activePlaylistId/);
  assert.match(app, /playlistPickerTrackKey/);
  assert.match(app, /playTrack\(playlist\.tracks\[0\], playlist\.tracks, 0\)/);
  assert.match(app, /persistLists\(\)/);
});

test('reselecting the current song applies the requested queue before toggling playback', () => {
  const playTrackBody = app.slice(app.indexOf('async function playTrack'), app.indexOf('function pushHistory'));
  assert.match(playTrackBody, /if \(same && audio\.src\) \{\s*if \(queue\) \{/);
});

test('playlist surfaces have dedicated responsive styling', () => {
  for (const selector of ['.playlist-grid', '.playlist-card', '.playlist-detail', '.playlist-picker-overlay']) {
    assert.match(styles, new RegExp(selector.replace('.', '\\.')));
  }
});
