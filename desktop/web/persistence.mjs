const KEYS = Object.freeze({
  prefs: 'vitr.desktop.preferences.v1',
  favorites: 'vitr.desktop.favorites.v1',
  history: 'vitr.desktop.history.v1',
  playlists: 'vitr.desktop.playlists.v1',
  session: 'vitr.desktop.session.v1',
});

const LEGACY_KEYS = Object.freeze([
  'frxe.desktop.preferences.v1',
  'frxe.desktop.favorites.v1',
  'frxe.desktop.history.v1',
  'frxe.desktop.playlists.v1',
  'frxe.desktop.session.v1',
]);

const LIMITS = Object.freeze({
  favorites: 300,
  history: 120,
  playlists: 80,
});

function safeRead(storage, key, fallback) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return fallback;
    const raw = storage.getItem(key);
    if (raw == null || raw === '') return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeWrite(storage, key, value) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safeRemove(storage, key) {
  try {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function cleanArray(value, limit) {
  return (Array.isArray(value) ? value : []).slice(0, limit);
}

function cleanTrack(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function normalizeSession(raw = null) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const current = cleanTrack(value.current ?? value.track);
  let queue = Array.isArray(value.queue)
    ? value.queue.filter((item) => cleanTrack(item))
    : [];
  if (current && queue.length === 0) queue = [current];

  let queueIndex = -1;
  if (queue.length > 0) {
    const requested = Number.isInteger(value.queueIndex) ? value.queueIndex : 0;
    queueIndex = Math.max(0, Math.min(requested, queue.length - 1));
  }

  const rawPosition = value.positionSeconds ?? value.position ?? 0;
  const numericPosition = Number(rawPosition);
  const positionSeconds = Number.isFinite(numericPosition) && numericPosition > 0
    ? numericPosition
    : 0;

  return { current, queue, queueIndex, positionSeconds };
}

export function createPersistence(storage) {
  return {
    loadPreferences() {
      const value = safeRead(storage, KEYS.prefs, {});
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    },

    savePreferences(preferences) {
      return safeWrite(storage, KEYS.prefs, preferences && typeof preferences === 'object' ? preferences : {});
    },

    loadLists() {
      return {
        favorites: cleanArray(safeRead(storage, KEYS.favorites, []), LIMITS.favorites),
        history: cleanArray(safeRead(storage, KEYS.history, []), LIMITS.history),
        playlists: cleanArray(safeRead(storage, KEYS.playlists, []), LIMITS.playlists),
      };
    },

    saveLists({ favorites = [], history = [], playlists = [] } = {}) {
      const savedFavorites = safeWrite(storage, KEYS.favorites, cleanArray(favorites, LIMITS.favorites));
      const savedHistory = safeWrite(storage, KEYS.history, cleanArray(history, LIMITS.history));
      const savedPlaylists = safeWrite(storage, KEYS.playlists, cleanArray(playlists, LIMITS.playlists));
      return savedFavorites && savedHistory && savedPlaylists;
    },

    loadSession() {
      return normalizeSession(safeRead(storage, KEYS.session, null));
    },

    saveSession(session) {
      return safeWrite(storage, KEYS.session, normalizeSession(session));
    },

    resetAll() {
      let success = true;
      for (const key of [...Object.values(KEYS), ...LEGACY_KEYS]) {
        if (!safeRemove(storage, key)) success = false;
      }
      return success;
    },
  };
}

export { KEYS as PERSISTENCE_KEYS };
