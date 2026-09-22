import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANUAL_PLAYLISTS_KEY,
  GENERATED_PLAYLISTS_KEY,
  parseManualPlaylists,
  parseGeneratedPlaylists,
  createManualPlaylist,
  renameManualPlaylist,
  deleteManualPlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  moveTrackInPlaylist,
  buildGeneratedPlaylists,
  generatedPlaylistSignature,
} from '../../src/music/playlists.js';

const trackA = { id: 'a', title: 'A', artist: 'Daft Punk', thumbnail: 'a.jpg' };
const trackB = { id: 'b', title: 'B', artist: 'Justice', thumbnail: 'b.jpg' };
const trackC = { id: 'c', title: 'C', artist: 'M83', thumbnail: 'c.jpg' };

test('manual playlist parser survives malformed storage', () => {
  assert.deepEqual(parseManualPlaylists('{broken'), []);
  assert.deepEqual(parseManualPlaylists('null'), []);
  assert.equal(MANUAL_PLAYLISTS_KEY, 'frxe.web.playlists.manual.v1');
  assert.equal(GENERATED_PLAYLISTS_KEY, 'frxe.web.playlists.generated.v1');
});

test('manual playlist operations are immutable and preserve ordered unique tracks', () => {
  const now = 1789400000000;
  let playlists = createManualPlaylist([], 'Night Drive', { now, id: 'pl-night' });
  assert.equal(playlists[0].id, 'pl-night');
  assert.equal(playlists[0].name, 'Night Drive');
  playlists = addTrackToPlaylist(playlists, 'pl-night', trackA, now + 1);
  playlists = addTrackToPlaylist(playlists, 'pl-night', trackA, now + 2);
  playlists = addTrackToPlaylist(playlists, 'pl-night', trackB, now + 3);
  playlists = addTrackToPlaylist(playlists, 'pl-night', trackC, now + 4);
  assert.deepEqual(playlists[0].tracks.map((track) => track.id), ['a', 'b', 'c']);
  playlists = moveTrackInPlaylist(playlists, 'pl-night', 2, 0, now + 5);
  assert.deepEqual(playlists[0].tracks.map((track) => track.id), ['c', 'a', 'b']);
  playlists = removeTrackFromPlaylist(playlists, 'pl-night', 'a', now + 6);
  assert.deepEqual(playlists[0].tracks.map((track) => track.id), ['c', 'b']);
  playlists = renameManualPlaylist(playlists, 'pl-night', 'Late Drive', now + 7);
  assert.equal(playlists[0].name, 'Late Drive');
  assert.deepEqual(deleteManualPlaylist(playlists, 'pl-night'), []);
});

test('generated playlists include core FRXE mixes and do not mutate manual playlists', () => {
  const manual = createManualPlaylist([], 'Keep Me', { now: 1, id: 'manual-1' });
  const snapshot = structuredClone(manual);
  const history = [trackA, trackB, trackC, { id: 'd', title: 'D', artist: 'Daft Punk' }, { id: 'e', title: 'E', artist: 'Phoenix' }];
  const library = [trackA, trackC];
  const recommendationRows = [
    { id: 'electronic', title: 'Explore Electronic', seedKind: 'genre', seedLabel: 'Electronic', tracks: [{ id: 'r1', title: 'R1', artist: 'Kavinsky' }, { id: 'r2', title: 'R2', artist: 'CHVRCHES' }] },
    { id: 'discovery', title: 'Discovery', seedKind: 'wildcard', tracks: [{ id: 'r3', title: 'R3', artist: 'New Artist' }, { id: 'r4', title: 'R4', artist: 'Another Artist' }] },
  ];
  const generated = buildGeneratedPlaylists({ history, library, recommendationRows, now: 1789400000000 });
  assert.ok(generated.some((playlist) => playlist.name === 'Daily Mix'));
  assert.ok(generated.some((playlist) => playlist.name === 'Discovery Mix'));
  assert.ok(generated.some((playlist) => playlist.name === 'Liked Mix'));
  assert.ok(generated.some((playlist) => /Electronic Mix|Artist Mix/.test(playlist.name)));
  assert.deepEqual(manual, snapshot);
  assert.deepEqual(parseGeneratedPlaylists(JSON.stringify(generated)), generated);
  assert.notEqual(generatedPlaylistSignature({ history, library, recommendationRows }), generatedPlaylistSignature({ history: history.slice(1), library, recommendationRows }));
});
