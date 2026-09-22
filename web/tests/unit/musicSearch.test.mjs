import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderMusicQuery,
  cleanArtistName,
  cleanDisplayTitle,
  mergeAndRankMusicResults,
  refineMusicMetadata,
} from '../../src/shared/musicSearch.js';

test('provider query quietly adds music intent', () => {
  assert.equal(buildProviderMusicQuery('The Weeknd Blinding Lights'), 'The Weeknd Blinding Lights song');
  assert.equal(buildProviderMusicQuery('The Weeknd Blinding Lights official audio'), 'The Weeknd Blinding Lights official audio');
});

test('metadata cleanup normalizes provider labels and titles', () => {
  assert.equal(cleanArtistName('Artist - Topic'), 'Artist');
  assert.equal(cleanArtistName('ArtistVEVO'), 'Artist');
  assert.equal(cleanDisplayTitle('Artist - Signal (Official Video)'), 'Artist - Signal');
  assert.deepEqual(
    refineMusicMetadata({ title: 'Artist - Signal [Lyrics]', artist: 'Artist' }),
    { title: 'Signal', artist: 'Artist' },
  );
});

test('duplicate versions collapse and official result wins', () => {
  const results = mergeAndRankMusicResults([
    { id: 'lyrics', title: 'Artist - Signal [Lyrics]', artist: 'Artist', official: false },
    { id: 'official', title: 'Artist - Signal (Official Video)', artist: 'Artist - Topic', official: true, topic: true },
    { id: 'reaction', title: 'Signal reaction', artist: 'Random Channel', official: false },
  ], 'Artist Signal');

  assert.equal(results.filter((item) => item.title === 'Signal' && item.artist === 'Artist').length, 1);
  assert.equal(results[0].id, 'official');
  assert.equal(results[0].official, true);
});
