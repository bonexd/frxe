import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecommendationSeeds,
  buildColdStartSeeds,
  diversifyTracks,
  recommendationSignature,
  readRecommendationCache,
  writeRecommendationCache,
  SIGNAL_WEIGHTS,
  RECOMMENDATION_CACHE_KEY,
} from '../../src/music/recommendations.js';

const history = [
  { id: 'h1', title: 'One More Time', artist: 'Daft Punk', thumbnail: '1.jpg' },
  { id: 'h2', title: 'Harder Better Faster Stronger', artist: 'Daft Punk', thumbnail: '2.jpg' },
  { id: 'h3', title: 'Genesis', artist: 'Justice', thumbnail: '3.jpg' },
];
const library = [
  { id: 'l1', title: 'D.A.N.C.E.', artist: 'Justice', thumbnail: '4.jpg' },
  { id: 'l2', title: 'Midnight City', artist: 'M83', thumbnail: '5.jpg' },
];

test('recommendation seeds combine played saved genre and wildcard signals', () => {
  const seeds = buildRecommendationSeeds({ history, library, recentSearches: ['electronic mix'] });
  assert.equal(SIGNAL_WEIGHTS.played, 0.40);
  assert.ok(seeds.some((seed) => seed.kind === 'artist'));
  assert.ok(seeds.some((seed) => seed.kind === 'track'));
  assert.ok(seeds.some((seed) => seed.kind === 'genre'));
  assert.ok(seeds.some((seed) => seed.kind === 'wildcard'));
  assert.ok(seeds.find((seed) => seed.kind === 'artist').weight > seeds.find((seed) => seed.kind === 'wildcard').weight);
});

test('top six home seeds stay mixed even with many familiar artists', () => {
  const crowdedHistory = Array.from({ length: 8 }, (_, index) => ({
    id: `crowded-${index}`,
    title: `Song ${index}`,
    artist: `Artist ${index}`,
  }));
  const top = buildRecommendationSeeds({
    history: crowdedHistory,
    library: crowdedHistory.slice(0, 3),
    recentSearches: ['electronic'],
  }).slice(0, 6);
  assert.ok(top.some((seed) => seed.kind === 'artist' || seed.kind === 'track'));
  assert.ok(top.some((seed) => seed.kind === 'genre'));
  assert.ok(top.some((seed) => seed.kind === 'wildcard'));
});

test('diversifyTracks de-duplicates ids and caps one artist at two tracks', () => {
  const input = [
    { id: '1', artist: 'Daft Punk' }, { id: '1', artist: 'Daft Punk' },
    { id: '2', artist: 'Daft Punk' }, { id: '3', artist: 'Daft Punk' },
    { id: '4', artist: 'Justice' }, { id: '5', artist: 'M83' },
  ];
  const output = diversifyTracks(input, { artistCap: 2, limit: 8 });
  assert.equal(new Set(output.map((track) => track.id)).size, output.length);
  assert.ok(output.filter((track) => track.artist === 'Daft Punk').length <= 2);
});

test('cold start seeds are deterministic and mix genres with wildcard discovery', () => {
  const seeds = buildColdStartSeeds('2026-W38', 6);
  assert.deepEqual(seeds, buildColdStartSeeds('2026-W38', 6));
  assert.ok(seeds.some((seed) => seed.kind === 'genre'));
  assert.ok(seeds.some((seed) => seed.kind === 'wildcard'));
});

test('recommendation signature changes with listening signals', () => {
  const a = recommendationSignature({ history, library, recentSearches: [] });
  const b = recommendationSignature({ history: history.slice(1), library, recentSearches: [] });
  assert.notEqual(a, b);
});

test('cache helpers accept matching fresh data and reject malformed stale or mismatched data', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const payload = { version: 1, signature: 'sig', createdAt: 1000, expiresAt: 2000, rows: [{ id: 'x', tracks: [] }] };
  writeRecommendationCache(storage, payload);
  assert.equal(RECOMMENDATION_CACHE_KEY, 'frxe.web.recommendations.v1');
  assert.deepEqual(readRecommendationCache(storage, 'sig', 1500), payload);
  assert.equal(readRecommendationCache(storage, 'other', 1500), null);
  assert.equal(readRecommendationCache(storage, 'sig', 2500), null);
  values.set(RECOMMENDATION_CACHE_KEY, '{bad');
  assert.equal(readRecommendationCache(storage, 'sig', 1500), null);
});
