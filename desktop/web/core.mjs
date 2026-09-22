export const DEFAULT_PREFERENCES = Object.freeze({
  downloadDir: '',
  format: 'm4a',
  quality: 'best',
  volume: 0.82,
  muted: false,
  shuffle: false,
  repeat: 'off',
  reducedMotion: false,
  liquidGlass: true,
  autoUpdate: true,
  floatingMiniPlayer: false,
  miniPlayerLayout: 'bar',
  trayEnabled: true,
});

export function trackKey(track) {
  if (!track) return '';
  return `${track.kind || 'unknown'}:${track.id || ''}`;
}

export function dedupeTracks(groups) {
  const output = [];
  const seen = new Set();
  for (const track of groups.flat()) {
    if (!track?.id) continue;
    const key = trackKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(track);
  }
  return output;
}

export function selectPlaybackQueue(track, candidates = []) {
  if (!track) return { queue: [], index: -1 };
  const candidateQueue = Array.isArray(candidates) ? candidates : [];
  const index = candidateQueue.findIndex((item) => trackKey(item) === trackKey(track));
  if (index >= 0) return { queue: [...candidateQueue], index };
  return { queue: [track], index: 0 };
}

export function createPlaylist(playlists, name, id) {
  const current = Array.isArray(playlists) ? playlists : [];
  const cleanName = String(name || '').trim();
  if (!cleanName || !id) return [...current];
  return [...current, { id, name: cleanName, tracks: [] }];
}

export function addTrackToPlaylist(playlists, playlistId, track) {
  const current = Array.isArray(playlists) ? playlists : [];
  if (!playlistId || !trackKey(track)) return [...current];
  return current.map((playlist) => {
    if (playlist?.id !== playlistId) return playlist;
    const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    if (tracks.some((item) => trackKey(item) === trackKey(track))) return playlist;
    return { ...playlist, tracks: [...tracks, track] };
  });
}

export function removeTrackFromPlaylist(playlists, playlistId, track) {
  const current = Array.isArray(playlists) ? playlists : [];
  const key = trackKey(track);
  if (!playlistId || !key) return [...current];
  return current.map((playlist) => {
    if (playlist?.id !== playlistId) return playlist;
    const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    return { ...playlist, tracks: tracks.filter((item) => trackKey(item) !== key) };
  });
}

export function deletePlaylist(playlists, playlistId) {
  const current = Array.isArray(playlists) ? playlists : [];
  return current.filter((playlist) => playlist?.id !== playlistId);
}

export function pruneTrackReferences(collections, track) {
  const key = trackKey(track);
  const filterTracks = (items) => (Array.isArray(items) ? items : []).filter((item) => trackKey(item) !== key);
  const queue = filterTracks(collections?.queue);
  const requestedIndex = Number.isInteger(collections?.queueIndex) ? collections.queueIndex : -1;
  const queueIndex = !queue.length || requestedIndex < 0 ? -1 : Math.min(requestedIndex, queue.length - 1);
  const playlists = (Array.isArray(collections?.playlists) ? collections.playlists : []).map((playlist) => ({
    ...playlist,
    tracks: filterTracks(playlist?.tracks),
  }));
  return {
    queue,
    queueIndex,
    favorites: filterTracks(collections?.favorites),
    history: filterTracks(collections?.history),
    playlists,
  };
}

export const removeTrackReferences = pruneTrackReferences;

export function queuePrefetchTracks(queue, index, distance = 2) {
  if (!Array.isArray(queue) || !queue.length || !Number.isInteger(index)) return [];
  const output = [];
  const seen = new Set();
  for (let step = 1; step <= Math.max(1, distance); step += 1) {
    for (const candidate of [index - step, index + step]) {
      const track = queue[candidate];
      if (!track) continue;
      const key = trackKey(track);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      output.push(track);
    }
  }
  return output;
}

export function createTrackSourceCache(resolveTrack, { ttlMs = 120_000, maxEntries = 16, now = Date.now } = {}) {
  if (typeof resolveTrack !== 'function') throw new TypeError('resolveTrack must be a function');
  const cache = new Map();

  function trim() {
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }

  function get(track) {
    const key = trackKey(track);
    if (!key) return Promise.reject(new Error('Track has no cache key.'));
    const cached = cache.get(key);
    if (cached && now() - cached.createdAt < ttlMs) return cached.promise;
    if (cached) cache.delete(key);
    const promise = Promise.resolve()
      .then(() => resolveTrack(track))
      .catch((error) => {
        cache.delete(key);
        throw error;
      });
    cache.set(key, { createdAt: now(), promise });
    trim();
    return promise;
  }

  function prefetch(track) {
    if (!track) return;
    void get(track).catch(() => {});
  }

  function clear(track) {
    if (!track) cache.clear();
    else cache.delete(trackKey(track));
  }

  return { get, prefetch, clear };
}

export function formatClock(value) {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function nextQueueIndex({ index, length, repeat = 'off', shuffle = false, random = Math.random }) {
  if (!Number.isInteger(length) || length <= 0) return -1;
  if (repeat === 'track' && index >= 0 && index < length) return index;
  if (shuffle && length > 1) {
    const candidate = Math.floor(Math.max(0, Math.min(0.999999, random())) * length);
    return candidate === index ? (candidate + 1) % length : candidate;
  }
  const next = index + 1;
  if (next < length) return next;
  return repeat === 'queue' ? 0 : -1;
}

export function normalizePreferences(raw = {}, detectedDownloadDir = '') {
  const next = { ...DEFAULT_PREFERENCES, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!String(next.downloadDir || '').trim() && detectedDownloadDir) next.downloadDir = detectedDownloadDir;
  next.volume = Math.max(0, Math.min(1, Number(next.volume) || 0));
  if (!['mp3', 'm4a', 'flac', 'wav'].includes(next.format)) next.format = DEFAULT_PREFERENCES.format;
  if (!['best', 'high', 'balanced'].includes(next.quality)) next.quality = DEFAULT_PREFERENCES.quality;
  if (!['off', 'queue', 'track'].includes(next.repeat)) next.repeat = DEFAULT_PREFERENCES.repeat;
  next.trayEnabled = next.trayEnabled !== false;
  next.liquidGlass = next.liquidGlass !== false;
  next.autoUpdate = next.autoUpdate !== false;
  next.floatingMiniPlayer = Boolean(next.floatingMiniPlayer);
  if (!['bar', 'square'].includes(next.miniPlayerLayout)) next.miniPlayerLayout = DEFAULT_PREFERENCES.miniPlayerLayout;
  next.muted = Boolean(next.muted);
  next.shuffle = Boolean(next.shuffle);
  return next;
}

export function parseLrc(value = '') {
  const lines = [];
  const re = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]\s*(.*)$/;
  for (const raw of String(value).split(/\r?\n/)) {
    const match = raw.match(re);
    if (!match) continue;
    const time = Number(match[1]) * 60 + Number(match[2]);
    if (!Number.isFinite(time)) continue;
    lines.push({ time, text: match[3].trim() });
  }
  return lines.sort((left, right) => left.time - right.time);
}

export function currentLyricIndex(lines, position) {
  let found = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time <= position) found = index;
    else break;
  }
  return found;
}

export function safeJsonParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}
