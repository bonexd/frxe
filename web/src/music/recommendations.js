import { classifyGenres } from './searchTaxonomy.js';

export const SIGNAL_WEIGHTS = Object.freeze({ played: 0.40, saved: 0.25, genre: 0.20, wildcard: 0.15 });
export const RECOMMENDATION_CACHE_KEY = 'frxe.web.recommendations.v1';
export const RECOMMENDATION_TTL_MS = 6 * 60 * 60 * 1000;

const WILDCARDS = ['new music', 'underrated music', 'fresh alternative music', 'global music discovery'];
const COLD_GENRES = ['Electronic', 'Hip-Hop', 'Pop', 'R&B', 'Rock', 'Indie', 'Latin', 'Jazz', 'Metal', 'Classical'];

function clean(value) { return String(value || '').trim(); }
function key(value) { return clean(value).toLocaleLowerCase(); }
function slug(value) { return key(value).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'seed'; }
function stableHash(value) {
  let hash = 2166136261;
  for (const ch of String(value || '')) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function prioritizeRecommendationMix(ordered, headLimit = 6) {
  const cap = Math.min(Math.max(0, headLimit), ordered.length);
  if (cap < 3) return ordered;

  const familiar = ordered.filter((seed) => seed.kind === 'artist' || seed.kind === 'track');
  const genres = ordered.filter((seed) => seed.kind === 'genre');
  const wildcards = ordered.filter((seed) => seed.kind === 'wildcard');
  const selected = [...familiar.slice(0, Math.max(0, cap - 2))];
  if (genres[0]) selected.push(genres[0]);
  if (wildcards[0]) selected.push(wildcards[0]);

  const ids = new Set(selected.map((seed) => seed.id));
  for (const seed of ordered) {
    if (selected.length >= cap) break;
    if (ids.has(seed.id)) continue;
    selected.push(seed);
    ids.add(seed.id);
  }

  return [...selected, ...ordered.filter((seed) => !ids.has(seed.id))];
}

export function buildRecommendationSeeds({ history = [], library = [], recentSearches = [] } = {}) {
  const seeds = new Map();
  const artistCounts = new Map();
  for (const track of history) {
    const artist = clean(track?.artist);
    if (artist) artistCounts.set(key(artist), { name: artist, count: (artistCounts.get(key(artist))?.count || 0) + 1 });
  }
  for (const { name, count } of artistCounts.values()) {
    const id = `artist:${slug(name)}`;
    seeds.set(id, { id, kind: 'artist', label: name, query: `${name} songs`, weight: SIGNAL_WEIGHTS.played + Math.min(0.09, (count - 1) * 0.03) });
  }

  const trackMap = new Map();
  for (const track of [...library, ...history.slice(0, 4)]) {
    const id = clean(track?.id);
    const title = clean(track?.title);
    const artist = clean(track?.artist);
    if (!id || !title) continue;
    const current = trackMap.get(id);
    const isSaved = library.some((item) => String(item?.id) === id);
    const weight = isSaved ? SIGNAL_WEIGHTS.saved : SIGNAL_WEIGHTS.played * 0.72;
    if (!current || current.weight < weight) trackMap.set(id, { id: `track:${id}`, kind: 'track', label: title, query: `${artist} ${title} similar songs`.trim(), weight });
  }
  for (const seed of trackMap.values()) seeds.set(seed.id, seed);

  const genres = classifyGenres(recentSearches.join(' '), [], 3);
  genres.forEach((genre, index) => {
    const id = `genre:${genre.id}`;
    seeds.set(id, { id, kind: 'genre', label: genre.name, query: genre.query, weight: SIGNAL_WEIGHTS.genre - index * 0.01 });
  });

  WILDCARDS.forEach((query, index) => {
    const id = `wildcard:${slug(query)}`;
    seeds.set(id, { id, kind: 'wildcard', label: query.replace(/\b\w/g, (char) => char.toUpperCase()), query, weight: SIGNAL_WEIGHTS.wildcard - index * 0.005 });
  });

  const ordered = [...seeds.values()].sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  return prioritizeRecommendationMix(ordered, 6);
}

export function buildColdStartSeeds(keyValue = '', limit = 6) {
  const cap = Math.max(0, Number(limit) || 0);
  if (!cap) return [];
  const size = Math.max(1, COLD_GENRES.length);
  const offset = stableHash(keyValue) % size;
  const reserveWildcard = cap >= 2 ? 1 : 0;
  const genreSlots = Math.min(cap - reserveWildcard, COLD_GENRES.length);
  const seeds = [];

  for (let index = 0; index < genreSlots; index += 1) {
    const name = COLD_GENRES[(offset + index) % size];
    seeds.push({ id: `genre:${slug(name)}`, kind: 'genre', label: name, query: `${name} music`, weight: SIGNAL_WEIGHTS.genre });
  }

  if (reserveWildcard) {
    const query = WILDCARDS[offset % WILDCARDS.length];
    seeds.push({ id: `wildcard:${slug(query)}`, kind: 'wildcard', label: query.replace(/\b\w/g, (char) => char.toUpperCase()), query, weight: SIGNAL_WEIGHTS.wildcard });
  }

  for (let index = 0; seeds.length < cap && index < WILDCARDS.length; index += 1) {
    const query = WILDCARDS[(offset + index) % WILDCARDS.length];
    if (seeds.some((seed) => seed.query === query)) continue;
    seeds.push({ id: `wildcard:${slug(query)}`, kind: 'wildcard', label: query.replace(/\b\w/g, (char) => char.toUpperCase()), query, weight: SIGNAL_WEIGHTS.wildcard });
  }
  return seeds.slice(0, cap);
}

export function diversifyTracks(tracks, { artistCap = 2, limit = 12, excludeIds = [] } = {}) {
  const seen = new Set(excludeIds.map(String));
  const artistCounts = new Map();
  const output = [];
  for (const track of Array.isArray(tracks) ? tracks : []) {
    const id = clean(track?.id);
    if (!id || seen.has(id)) continue;
    const artist = key(track?.artist) || 'unknown';
    const count = artistCounts.get(artist) || 0;
    if (count >= artistCap) continue;
    seen.add(id);
    artistCounts.set(artist, count + 1);
    output.push(track);
    if (output.length >= limit) break;
  }
  return output;
}

export function recommendationSignature({ history = [], library = [], recentSearches = [] } = {}) {
  const source = JSON.stringify({
    history: history.slice(0, 20).map((track) => [track?.id, track?.artist]),
    library: library.slice(0, 50).map((track) => [track?.id, track?.artist]),
    recentSearches: recentSearches.slice(0, 20).map((value) => clean(value).toLowerCase()),
  });
  return stableHash(source).toString(36);
}

export function readRecommendationCache(storage, signature, now = Date.now()) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(RECOMMENDATION_CACHE_KEY) || 'null');
    if (!parsed || parsed.version !== 1 || parsed.signature !== signature) return null;
    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= now || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch { return null; }
}

export function writeRecommendationCache(storage, payload) {
  try { storage?.setItem?.(RECOMMENDATION_CACHE_KEY, JSON.stringify(payload)); return true; } catch { return false; }
}

export function makeRecommendationCache(signature, rows, now = Date.now()) {
  return { version: 1, signature, createdAt: now, expiresAt: now + RECOMMENDATION_TTL_MS, rows };
}
