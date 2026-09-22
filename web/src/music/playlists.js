export const MANUAL_PLAYLISTS_KEY = 'frxe.web.playlists.manual.v1';
export const GENERATED_PLAYLISTS_KEY = 'frxe.web.playlists.generated.v1';

function cleanName(value) { return String(value || '').trim().slice(0, 120); }
function validTrack(track) { return track && typeof track === 'object' && String(track.id || '').trim(); }
function cleanTrack(track) { return validTrack(track) ? { ...track, id: String(track.id).trim() } : null; }
function parseJson(raw) { try { return JSON.parse(raw || 'null'); } catch { return null; } }
function stableHash(value) { let hash = 2166136261; for (const ch of String(value || '')) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }
function uniqueTracks(items, artistCap = Infinity, limit = 50) {
  const seen = new Set(); const artists = new Map(); const out = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const track = cleanTrack(raw); if (!track || seen.has(track.id)) continue;
    const artist = String(track.artist || '').trim().toLowerCase() || 'unknown';
    const count = artists.get(artist) || 0; if (count >= artistCap) continue;
    seen.add(track.id); artists.set(artist, count + 1); out.push(track); if (out.length >= limit) break;
  }
  return out;
}

export function parseManualPlaylists(raw) {
  const value = parseJson(raw); if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const id = String(item.id || '').trim(); const name = cleanName(item.name);
    if (!id || !name) return [];
    const createdAt = Number(item.createdAt); const updatedAt = Number(item.updatedAt);
    return [{ id, name, createdAt: Number.isFinite(createdAt) ? createdAt : 0, updatedAt: Number.isFinite(updatedAt) ? updatedAt : (Number.isFinite(createdAt) ? createdAt : 0), tracks: uniqueTracks(item.tracks, Infinity, 1000) }];
  });
}

export function createManualPlaylist(playlists, name, { now = Date.now(), id } = {}) {
  const clean = cleanName(name); if (!clean) return [...(playlists || [])];
  const playlistId = String(id || globalThis.crypto?.randomUUID?.() || `playlist-${now}-${(playlists || []).length + 1}`);
  return [...(playlists || []), { id: playlistId, name: clean, createdAt: now, updatedAt: now, tracks: [] }];
}

function replacePlaylist(playlists, id, updater) {
  let changed = false;
  const next = (playlists || []).map((playlist) => {
    if (playlist.id !== id) return playlist;
    const updated = updater(playlist); if (updated !== playlist) changed = true; return updated;
  });
  return changed ? next : [...(playlists || [])];
}

export function renameManualPlaylist(playlists, id, name, now = Date.now()) {
  const clean = cleanName(name); if (!clean) return [...(playlists || [])];
  return replacePlaylist(playlists, id, (playlist) => playlist.name === clean ? playlist : { ...playlist, name: clean, updatedAt: now });
}
export function deleteManualPlaylist(playlists, id) { return (playlists || []).filter((playlist) => playlist.id !== id); }
export function addTrackToPlaylist(playlists, id, track, now = Date.now()) {
  const normalized = cleanTrack(track); if (!normalized) return [...(playlists || [])];
  return replacePlaylist(playlists, id, (playlist) => playlist.tracks.some((item) => item.id === normalized.id) ? playlist : { ...playlist, updatedAt: now, tracks: [...playlist.tracks, normalized] });
}
export function removeTrackFromPlaylist(playlists, id, trackId, now = Date.now()) {
  return replacePlaylist(playlists, id, (playlist) => {
    const tracks = playlist.tracks.filter((track) => track.id !== trackId); return tracks.length === playlist.tracks.length ? playlist : { ...playlist, updatedAt: now, tracks };
  });
}
export function moveTrackInPlaylist(playlists, id, fromIndex, toIndex, now = Date.now()) {
  return replacePlaylist(playlists, id, (playlist) => {
    const length = playlist.tracks.length; if (!length) return playlist;
    const from = Math.max(0, Math.min(length - 1, Number(fromIndex) || 0)); const to = Math.max(0, Math.min(length - 1, Number(toIndex) || 0)); if (from === to) return playlist;
    const tracks = [...playlist.tracks]; const [track] = tracks.splice(from, 1); tracks.splice(to, 0, track); return { ...playlist, updatedAt: now, tracks };
  });
}

function makeGenerated(id, kind, name, subtitle, now, tracks) {
  return { id, kind, name, subtitle, generatedAt: now, tracks: uniqueTracks(tracks, 3, 40) };
}
function interleave(a, b) { const out = []; const max = Math.max(a.length, b.length); for (let i = 0; i < max; i += 1) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); } return out; }

export function buildGeneratedPlaylists({ history = [], library = [], recommendationRows = [], now = Date.now() } = {}) {
  const historyCopy = uniqueTracks(history, Infinity, 100); const libraryCopy = uniqueTracks(library, Infinity, 100);
  const rows = Array.isArray(recommendationRows) ? recommendationRows : []; const recommended = uniqueTracks(rows.flatMap((row) => row?.tracks || []), Infinity, 100);
  const artistCounts = new Map();
  for (const track of [...historyCopy, ...libraryCopy]) { const artist = String(track.artist || '').trim(); if (artist) artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1); }
  const familiarArtists = [...artistCounts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  const familiarSet = new Set(familiarArtists.slice(0, 5).map((name) => name.toLowerCase()));
  const generated = [];
  const daily = uniqueTracks(interleave(uniqueTracks([...historyCopy, ...libraryCopy], 3, 15), recommended), 3, 30); if (daily.length) generated.push(makeGenerated('frxe-daily-mix', 'daily', 'Daily Mix', 'Your favorites mixed with fresh recommendations', now, daily));
  const discovery = recommended.filter((track) => !familiarSet.has(String(track.artist || '').toLowerCase())); if (discovery.length) generated.push(makeGenerated('frxe-discovery-mix', 'discovery', 'Discovery Mix', 'Artists outside your usual rotation', now, discovery));
  if (libraryCopy.length) generated.push(makeGenerated('frxe-liked-mix', 'liked', 'Liked Mix', 'Built from your saved songs', now, libraryCopy));
  const throwback = historyCopy.slice(Math.min(3, Math.floor(historyCopy.length / 2))); if (throwback.length) generated.push(makeGenerated('frxe-throwback-mix', 'throwback', 'Throwback Mix', 'Older plays worth another spin', now, throwback));
  const freshRow = rows.find((row) => row?.seedKind === 'wildcard') || rows[0]; if (freshRow?.tracks?.length) generated.push(makeGenerated('frxe-fresh-mix', 'fresh', 'Fresh Mix', 'Fresh picks from your discovery feed', now, freshRow.tracks));
  const topArtist = familiarArtists[0]; if (topArtist) {
    const artistTracks = [...historyCopy, ...libraryCopy].filter((track) => String(track.artist || '').toLowerCase() === topArtist.toLowerCase());
    const aroundArtist = rows.find((row) => String(row?.seedLabel || '').toLowerCase() === topArtist.toLowerCase())?.tracks || recommended;
    generated.push(makeGenerated(`frxe-artist-${stableHash(topArtist)}`, 'artist', `Artist Mix · ${topArtist}`, `More around ${topArtist}`, now, interleave(artistTracks, aroundArtist)));
  }
  for (const row of rows.filter((row) => row?.seedKind === 'genre').slice(0, 3)) {
    const label = String(row.seedLabel || row.title || 'Genre').replace(/^Explore\s+/i, '').trim();
    if (row.tracks?.length) generated.push(makeGenerated(`frxe-genre-${stableHash(label)}`, 'genre', `${label} Mix`, `A ${label} mix shaped by your listening`, now, row.tracks));
  }
  return generated.filter((playlist) => playlist.tracks.length > 0);
}

export function parseGeneratedPlaylists(raw) {
  const value = parseJson(raw); if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const id = String(item.id || '').trim(); const kind = String(item.kind || '').trim(); const name = cleanName(item.name); const generatedAt = Number(item.generatedAt);
    if (!id || !kind || !name || !Array.isArray(item.tracks)) return [];
    return [{ id, kind, name, subtitle: String(item.subtitle || ''), generatedAt: Number.isFinite(generatedAt) ? generatedAt : 0, tracks: uniqueTracks(item.tracks, 3, 40) }];
  });
}

export function generatedPlaylistSignature({ history = [], library = [], recommendationRows = [] } = {}) {
  return stableHash(JSON.stringify({ history: history.map((track) => track?.id), library: library.map((track) => track?.id), rows: recommendationRows.map((row) => [row?.id, ...(row?.tracks || []).map((track) => track?.id)]) }));
}
