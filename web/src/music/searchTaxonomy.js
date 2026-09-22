const GENRES = [
  ['Hip-Hop', ['hip hop', 'hip-hop', 'rap', 'trap']],
  ['Pop', ['pop', 'dance pop']],
  ['R&B', ['r&b', 'rnb', 'soul']],
  ['Rock', ['rock', 'alt rock', 'alternative']],
  ['Electronic', ['electronic', 'edm', 'house', 'techno', 'synthwave']],
  ['Indie', ['indie', 'indie pop', 'indie rock']],
  ['Metal', ['metal', 'metalcore']],
  ['Jazz', ['jazz']],
  ['Latin', ['latin', 'reggaeton', 'bachata']],
  ['Classical', ['classical', 'orchestral']],
];

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'artist';
}

function hash(value) {
  let out = 2166136261;
  for (const ch of String(value || '')) {
    out ^= ch.charCodeAt(0);
    out = Math.imul(out, 16777619);
  }
  return out >>> 0;
}

export function extractArtists(tracks, limit = 8) {
  const map = new Map();
  for (const track of Array.isArray(tracks) ? tracks : []) {
    const name = String(track?.artist || '').trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    let item = map.get(key);
    if (!item) {
      item = {
        id: slug(name),
        name,
        thumbnail: String(track?.thumbnail || ''),
        sampleTrackIds: [],
      };
      map.set(key, item);
    }
    if (!item.thumbnail && track?.thumbnail) item.thumbnail = String(track.thumbnail);
    const id = String(track?.id || '');
    if (id && !item.sampleTrackIds.includes(id) && item.sampleTrackIds.length < 4) item.sampleTrackIds.push(id);
  }
  return [...map.values()].slice(0, Math.max(0, limit));
}

export function buildArtistQuery(artist) {
  return `${String(artist?.name || artist || '').trim()} songs`.trim();
}

export function buildGenreQuery(genre) {
  return `${String(genre?.name || genre || '').trim()} music`.trim();
}

export function classifyGenres(query, tracks = [], limit = 8) {
  const text = `${String(query || '')} ${(Array.isArray(tracks) ? tracks : []).map((track) => `${track?.title || ''} ${track?.artist || ''}`).join(' ')}`.toLowerCase();
  const recognized = [];
  const used = new Set();
  for (const [name, aliases] of GENRES) {
    if (aliases.some((alias) => text.includes(alias))) {
      recognized.push({ id: slug(name), name, query: `${name} music` });
      used.add(name);
    }
  }
  const remaining = GENRES.filter(([name]) => !used.has(name));
  if (remaining.length) {
    const offset = hash(String(query || '').toLowerCase()) % remaining.length;
    for (let index = 0; index < remaining.length && recognized.length < limit; index += 1) {
      const [name] = remaining[(offset + index) % remaining.length];
      recognized.push({ id: slug(name), name, query: `${name} music` });
    }
  }
  return recognized.slice(0, Math.max(0, limit));
}

export { GENRES };
