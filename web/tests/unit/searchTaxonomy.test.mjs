import test from 'node:test';
import assert from 'node:assert/strict';
import { extractArtists, classifyGenres, buildArtistQuery, buildGenreQuery } from '../../src/music/searchTaxonomy.js';

const tracks = [
  { id: '1', title: 'Song A', artist: 'Daft Punk', thumbnail: 'a.jpg' },
  { id: '2', title: 'Song B', artist: 'Daft Punk', thumbnail: 'b.jpg' },
  { id: '3', title: 'Song C', artist: 'Justice', thumbnail: 'c.jpg' },
];

test('extractArtists returns stable unique artists with sample tracks', () => {
  assert.deepEqual(extractArtists(tracks), [
    { id: 'daft-punk', name: 'Daft Punk', thumbnail: 'a.jpg', sampleTrackIds: ['1', '2'] },
    { id: 'justice', name: 'Justice', thumbnail: 'c.jpg', sampleTrackIds: ['3'] },
  ]);
});

test('artist and genre queries are music-focused', () => {
  assert.equal(buildArtistQuery({ name: 'Daft Punk' }), 'Daft Punk songs');
  assert.equal(buildGenreQuery({ name: 'Electronic' }), 'Electronic music');
});

test('classifyGenres recognizes genre language from the query', () => {
  const genres = classifyGenres('dark synthwave electronic mix', tracks);
  assert.equal(genres[0].name, 'Electronic');
});

test('classifyGenres returns deterministic discovery genres when query has no genre', () => {
  const a = classifyGenres('Daft Punk', tracks, 4);
  const b = classifyGenres('Daft Punk', tracks, 4);
  assert.deepEqual(a, b);
  assert.equal(a.length, 4);
});
