import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const core = await import('../web/core.mjs');
const [appSource, uiSource, primitivesSource] = await Promise.all([
  readFile(new URL('../web/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../web/ui.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../web/ui-primitives.mjs', import.meta.url), 'utf8'),
]);

const localTrack = { kind: 'local', id: '/music/song.mp3', path: '/music/song.mp3', title: 'Song' };
const otherTrack = { kind: 'youtube', id: 'video-1', title: 'Other' };

test('removing a downloaded track prunes every saved reference to that local track', () => {
  assert.equal(typeof core.removeTrackReferences, 'function');

  const result = core.removeTrackReferences({
    queue: [localTrack, otherTrack],
    favorites: [localTrack, otherTrack],
    history: [otherTrack, localTrack],
    playlists: [
      { id: 'mix', name: 'Mix', tracks: [localTrack, otherTrack] },
      { id: 'empty', name: 'Empty', tracks: [] },
    ],
  }, localTrack);

  assert.deepEqual(result.queue, [otherTrack]);
  assert.deepEqual(result.favorites, [otherTrack]);
  assert.deepEqual(result.history, [otherTrack]);
  assert.deepEqual(result.playlists, [
    { id: 'mix', name: 'Mix', tracks: [otherTrack] },
    { id: 'empty', name: 'Empty', tracks: [] },
  ]);
});

test('downloaded tracks can be removed through the safe native delete flow', () => {
  assert.match(uiSource, /data-action="remove-download"/);
  assert.match(appSource, /case 'remove-download'/);
  assert.match(appSource, /backend\.removeDownload\(target\.path, state\.prefs\.downloadDir\)/);
  assert.match(appSource, /removeTrackReferences\(/);
});

test('Library history can remove one track or clear all recent playback', () => {
  assert.match(uiSource, /<h2>Recently played<\/h2>/);
  assert.match(uiSource, /data-action="remove-history"/);
  assert.match(uiSource, /data-action="clear-history"/);
  assert.match(primitivesSource, /action !== 'remove-history' && action !== 'clear-history'/);
  assert.match(primitivesSource, /state\.history = state\.history\.filter/);
  assert.match(primitivesSource, /state\.history = \[\]/);
  assert.match(primitivesSource, /vitr\.desktop\.history\.v1/);
  assert.match(primitivesSource, /localStorage\.setItem\(historyKey/);
});
