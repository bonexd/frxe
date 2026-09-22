import {
  DEFAULT_PREFERENCES,
  addTrackToPlaylist,
  createPlaylist,
  createTrackSourceCache,
  currentLyricIndex,
  deletePlaylist,
  formatClock,
  nextQueueIndex,
  normalizePreferences,
  parseLrc,
  queuePrefetchTracks,
  removeTrackFromPlaylist,
  removeTrackReferences,
  selectPlaybackQueue,
  trackKey,
} from './core.mjs';
import { createBackend } from './backend.mjs';
import { createPersistence } from './persistence.mjs';
import { applyNativeMediaCommand, buildMediaPlaybackSnapshot } from './media-controls.mjs';
import { createView } from './ui.mjs';

const app = document.querySelector('#app');
const audio = document.querySelector('#audio');
const ambient = document.querySelector('#ambient');
const toastHost = document.querySelector('#toast-host');

const tauri = window.__TAURI__ || null;
const invoke = tauri?.core?.invoke
  ? tauri.core.invoke
  : async (command) => { throw new Error(`Native backend unavailable: ${command}`); };
const listen = tauri?.event?.listen ? tauri.event.listen : null;
const convertFileSrc = tauri?.core?.convertFileSrc || ((path) => path);
const backend = createBackend({ invoke, listen, convertFileSrc });
const sourceCache = createTrackSourceCache((track) => backend.resolveTrack(track));

let storage = null;
try { storage = globalThis.localStorage; } catch {}
const persistence = createPersistence(storage);
const persistedLists = persistence.loadLists();

const state = {
  tab: 'home',
  playerOpen: false,
  current: null,
  queue: [],
  queueIndex: -1,
  playing: false,
  resolving: false,
  searchQuery: '',
  searchResults: [],
  searchGroups: { artists: [], albums: [], playlists: [], genres: [] },
  searchLoading: false,
  searchError: '',
  offline: [],
  downloads: [],
  favorites: persistedLists.favorites,
  history: persistedLists.history,
  playlists: persistedLists.playlists,
  activePlaylistId: null,
  playlistPickerTrackKey: '',
  prefs: normalizePreferences(persistence.loadPreferences()),
  lyrics: [],
  plainLyrics: '',
  lyricsLoading: false,
  lyricsTrackKey: '',
  runtimeStatus: null,
  runtimeLoading: false,
  updateLoading: false,
};

document.documentElement.classList.toggle('no-liquid-glass', state.prefs.liquidGlass === false);

const trackRegistry = new Map();
let downloadUnlisten = null;
let playbackRequestId = 0;
let lastPersistedPositionSecond = -1;
let resetInProgress = false;
let updateInProgress = false;
let miniPlayerSyncInFlight = false;

function savePrefs() {
  persistence.savePreferences(state.prefs);
}

function persistLists() {
  persistence.saveLists({
    favorites: state.favorites,
    history: state.history,
    playlists: state.playlists,
  });
}

function floatingMiniSnapshot() {
  const track = state.current;
  const rawCover = track?.cover || '';
  const cover = rawCover && track?.kind === 'local' && !/^(https?:|data:|asset:)/i.test(rawCover)
    ? convertFileSrc(rawCover)
    : rawCover;
  return {
    title: track?.title || '',
    artist: track?.artist || '',
    cover,
    playing: Boolean(track && state.playing),
    positionSeconds: Number(audio.currentTime || 0),
    durationSeconds: Number(audio.duration || track?.durationSeconds || 0),
    liquidGlass: state.prefs.liquidGlass !== false,
    miniPlayerLayout: state.prefs.miniPlayerLayout || 'bar',
  };
}

async function syncFloatingMiniPlayer(force = false) {
  if (!state.prefs.floatingMiniPlayer) return;
  if (miniPlayerSyncInFlight && !force) return;
  miniPlayerSyncInFlight = true;
  try {
    await backend.updateMiniPlayer(floatingMiniSnapshot());
  } catch {
    // The optional floating window may be hidden or not ready yet.
  } finally {
    miniPlayerSyncInFlight = false;
  }
}

async function showFloatingMiniPlayerForPlayback() {
  if (!state.prefs.floatingMiniPlayer || !state.current) return;
  try {
    await backend.setMiniPlayerEnabled(true, state.prefs.miniPlayerLayout || 'bar');
    await syncFloatingMiniPlayer(true);
  } catch {}
}

const { render, toast, updateAmbient, isFavorite } = createView({
  state, app, audio, ambient, toastHost, backend, convertFileSrc, trackRegistry, savePrefs, persistLists,
  actions: { performSearch, refreshOffline, syncPlayerUi, syncFloatingMiniPlayer, createLocalPlaylist, seekTo, setVolume },
});

async function performSearch(query) {
  const clean = String(query || '').trim();
  state.searchQuery = clean;
  if (!clean) {
    state.searchResults = [];
    state.searchGroups = { artists: [], albums: [], playlists: [], genres: [] };
    state.searchError = '';
    render();
    return;
  }
  state.searchLoading = true;
  state.searchError = '';
  render();
  try {
    const discovery = await backend.discover(clean);
    state.searchResults = discovery.tracks || [];
    state.searchGroups = {
      artists: discovery.artists || [],
      albums: discovery.albums || [],
      playlists: discovery.playlists || [],
      genres: discovery.genres || [],
    };
  } catch (error) {
    state.searchResults = [];
    state.searchGroups = { artists: [], albums: [], playlists: [], genres: [] };
    state.searchError = readableError(error);
  } finally {
    state.searchLoading = false;
    render();
  }
}

function readableError(error) {
  const value = String(error?.message || error || 'Something went wrong.');
  return value.length > 220 ? `${value.slice(0, 217)}…` : value;
}

function syncNativeMediaControls() {
  const snapshot = buildMediaPlaybackSnapshot({
    track: state.current,
    queue: state.queue,
    queueIndex: state.queueIndex,
    prefs: state.prefs,
    playing: state.playing,
    positionSeconds: audio.currentTime,
    durationSeconds: audio.duration,
  });
  void backend.updateMediaControls(snapshot).catch(() => {});
  void syncFloatingMiniPlayer();
}

function seekTo(position) {
  const value = Math.max(0, Number(position) || 0);
  audio.currentTime = Number.isFinite(audio.duration) && audio.duration > 0
    ? Math.min(value, audio.duration)
    : value;
  syncPlayerUi();
  syncNativeMediaControls();
}

function seekBy(offset) {
  seekTo((Number(audio.currentTime) || 0) + (Number(offset) || 0));
}

function setVolume(volume) {
  const value = Math.max(0, Math.min(1, Number(volume) || 0));
  state.prefs.volume = value;
  state.prefs.muted = value === 0;
  audio.volume = value;
  audio.muted = state.prefs.muted;
  savePrefs();
  render();
  syncNativeMediaControls();
}

function setShuffle(enabled) {
  state.prefs.shuffle = Boolean(enabled);
  savePrefs();
  render();
  syncNativeMediaControls();
}

function setRepeat(mode) {
  if (!['off', 'queue', 'track'].includes(mode)) return;
  state.prefs.repeat = mode;
  savePrefs();
  render();
  syncNativeMediaControls();
}

function stopPlayback() {
  audio.pause();
  audio.currentTime = 0;
  state.playing = false;
  render();
  syncNativeMediaControls();
}

const nativeMediaActions = {
  play: async () => { if (state.current) await audio.play().catch(() => {}); },
  pause: () => audio.pause(),
  togglePlay: () => togglePlay(),
  next: () => goNext(),
  previous: () => goPrevious(),
  stop: stopPlayback,
  seekTo,
  seekBy,
  setVolume,
  setShuffle,
  setRepeat,
};

function updateMediaSession(track) {
  if (!('mediaSession' in navigator) || !track) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Unknown track',
      artist: track.artist || 'Unknown artist',
      album: track.album || 'vitr',
      artwork: track.cover ? [{ src: track.kind === 'local' && !/^https?:|^data:|^asset:/.test(track.cover) ? convertFileSrc(track.cover) : track.cover }] : [],
    });
  } catch {}
}

function prefetchQueueSources() {
  for (const track of queuePrefetchTracks(state.queue, state.queueIndex, 2)) {
    sourceCache.prefetch(track);
  }
}

async function playTrack(track, queue = null, index = null) {
  if (!track) return;
  const same = trackKey(track) === trackKey(state.current);
  if (same && audio.src) {
    if (queue) {
      state.queue = [...queue];
      state.queueIndex = index ?? Math.max(0, state.queue.findIndex((item) => trackKey(item) === trackKey(track)));
      prefetchQueueSources();
      saveSession();
      syncNativeMediaControls();
    }
    if (audio.paused) await audio.play().catch((error) => toast(readableError(error), 'error'));
    else audio.pause();
    return;
  }

  const requestId = ++playbackRequestId;
  if (queue) {
    state.queue = [...queue];
    state.queueIndex = index ?? Math.max(0, state.queue.findIndex((item) => trackKey(item) === trackKey(track)));
  } else if (!state.queue.some((item) => trackKey(item) === trackKey(track))) {
    state.queue = [track];
    state.queueIndex = 0;
  } else {
    state.queueIndex = state.queue.findIndex((item) => trackKey(item) === trackKey(track));
  }

  state.current = track;
  state.resolving = true;
  state.playing = false;
  updateAmbient(track);
  updateMediaSession(track);
  pushHistory(track);
  prefetchQueueSources();
  render();
  syncNativeMediaControls();

  try {
    const source = await sourceCache.get(track);
    if (requestId !== playbackRequestId || trackKey(state.current) !== trackKey(track)) return;
    audio.src = source;
    audio.volume = state.prefs.volume;
    audio.muted = state.prefs.muted;
    await audio.play();
    if (requestId !== playbackRequestId) return;
    state.playing = true;
    if (state.playerOpen) void loadLyrics(track);
  } catch (error) {
    if (requestId !== playbackRequestId) return;
    sourceCache.clear(track);
    toast(`Could not play ${track.title}: ${readableError(error)}`, 'error');
    state.playing = false;
  } finally {
    if (requestId === playbackRequestId) {
      state.resolving = false;
      saveSession();
      render();
      syncNativeMediaControls();
    }
  }
}

function pushHistory(track) {
  const key = trackKey(track);
  state.history = [track, ...state.history.filter((item) => trackKey(item) !== key)].slice(0, 120);
  persistLists();
}

async function togglePlay() {
  if (!state.current) return;
  if (audio.paused) {
    try { await audio.play(); } catch (error) { toast(readableError(error), 'error'); }
  } else audio.pause();
}

async function goNext() {
  const nextIndex = nextQueueIndex({ index: state.queueIndex, length: state.queue.length, repeat: state.prefs.repeat, shuffle: state.prefs.shuffle });
  if (nextIndex < 0) { audio.pause(); audio.currentTime = 0; syncNativeMediaControls(); return; }
  if (nextIndex === state.queueIndex) {
    audio.currentTime = 0;
    syncNativeMediaControls();
    if (audio.paused) await audio.play().catch(() => {});
    return;
  }
  await playTrack(state.queue[nextIndex], state.queue, nextIndex);
}

async function goPrevious() {
  if (audio.currentTime > 4) { audio.currentTime = 0; syncNativeMediaControls(); return; }
  if (!state.queue.length) return;
  let index = state.queueIndex - 1;
  if (index < 0) index = state.prefs.repeat === 'queue' ? state.queue.length - 1 : 0;
  if (index === state.queueIndex) {
    audio.currentTime = 0;
    syncNativeMediaControls();
    if (audio.paused) await audio.play().catch(() => {});
    return;
  }
  await playTrack(state.queue[index], state.queue, index);
}

function toggleFavorite(track) {
  if (!track) return;
  const key = trackKey(track);
  if (isFavorite(track)) state.favorites = state.favorites.filter((item) => trackKey(item) !== key);
  else state.favorites = [track, ...state.favorites.filter((item) => trackKey(item) !== key)];
  persistLists();
  render();
}

function playlistById(playlistId) {
  return state.playlists.find((playlist) => playlist?.id === playlistId) || null;
}

function findTrackByKey(key) {
  if (!key) return null;
  const groups = [
    state.current ? [state.current] : [],
    state.queue,
    state.searchResults,
    state.favorites,
    state.history,
    state.offline,
    ...state.playlists.map((playlist) => Array.isArray(playlist?.tracks) ? playlist.tracks : []),
  ];
  for (const group of groups) {
    const found = group.find((item) => trackKey(item) === key);
    if (found) return found;
  }
  return null;
}

function createLocalPlaylist(name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    toast('Give the playlist a name.', 'error');
    return;
  }
  const id = globalThis.crypto?.randomUUID?.() || `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const next = createPlaylist(state.playlists, cleanName, id);
  if (next.length === state.playlists.length) return;
  state.playlists = next;
  state.activePlaylistId = id;
  persistLists();
  render();
}

async function queueDownload(track, retryTask = null) {
  if (!track || track.kind !== 'youtube') return;
  if (!state.prefs.downloadDir.trim()) {
    state.tab = 'settings';
    render();
    toast('Choose a Music folder before downloading.', 'error');
    return;
  }
  try {
    if (!retryTask) {
      const exists = await backend.downloadAlreadyExists(track.id, state.prefs.downloadDir).catch(() => false);
      if (exists) { toast('That track is already downloaded.'); return; }
    }
    const task = retryTask || { id: crypto.randomUUID(), track, status: 'queued', progress: 0 };
    task.status = 'downloading';
    task.error = '';
    if (!state.downloads.some((item) => item.id === task.id)) state.downloads.push(task);
    state.tab = 'save';
    render();
    await backend.startDownload({ taskId: task.id, track, outputDir: state.prefs.downloadDir, format: state.prefs.format, quality: state.prefs.quality, allowPlaylist: false });
    state.downloads = state.downloads.filter((item) => item.id !== task.id);
    toast(`Saved ${track.title}`);
    await refreshOffline();
  } catch (error) {
    taskError(retryTask?.id || state.downloads.find((item) => trackKey(item.track) === trackKey(track))?.id, error);
  }
  render();
}

function taskError(id, error) {
  const task = state.downloads.find((item) => item.id === id);
  if (task) { task.status = 'failed'; task.error = readableError(error); }
  toast(`Download failed: ${readableError(error)}`, 'error');
}

async function refreshOffline() {
  if (!state.prefs.downloadDir.trim()) return;
  try {
    await backend.clearRemovedDownloads(state.prefs.downloadDir).catch(() => 0);
    const tracks = await backend.scanDownloads(state.prefs.downloadDir);
    state.offline = Array.isArray(tracks) ? tracks : [];
    if (state.tab === 'save' || state.tab === 'library' || state.tab === 'home') render();
  } catch (error) {
    console.warn('vitr offline scan failed', error);
  }
}

async function removeOfflineTrack(target) {
  if (!target?.path || target.kind !== 'local') return;
  try {
    await backend.removeDownload(target.path, state.prefs.downloadDir);
    const removedKey = trackKey(target);
    const cleaned = removeTrackReferences({
      queue: state.queue,
      favorites: state.favorites,
      history: state.history,
      playlists: state.playlists,
    }, target);

    state.queue = cleaned.queue;
    state.favorites = cleaned.favorites;
    state.history = cleaned.history;
    state.playlists = cleaned.playlists;
    state.offline = state.offline.filter((item) => trackKey(item) !== removedKey);
    sourceCache.clear(target);

    if (trackKey(state.current) === removedKey) {
      playbackRequestId += 1;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      state.current = null;
      state.queueIndex = -1;
      state.playerOpen = false;
      state.playing = false;
      state.resolving = false;
      updateAmbient(null);
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    } else if (state.current) {
      const currentIndex = state.queue.findIndex((item) => trackKey(item) === trackKey(state.current));
      if (currentIndex >= 0) state.queueIndex = currentIndex;
      else {
        state.queue = [state.current];
        state.queueIndex = 0;
      }
    } else {
      state.queueIndex = -1;
    }

    persistLists();
    saveSession();
    await refreshOffline();
    render();
    syncNativeMediaControls();
    toast(`Removed ${target.title}`);
  } catch (error) {
    toast(`Could not remove ${target.title}: ${readableError(error)}`, 'error');
  }
}

async function loadLyrics(track) {
  const key = trackKey(track);
  if (!track || state.lyricsTrackKey === key || state.lyricsLoading) return;
  state.lyricsTrackKey = key;
  state.lyricsLoading = true;
  state.lyrics = [];
  state.plainLyrics = '';
  if (state.playerOpen) render();
  try {
    const result = await backend.lyrics(track);
    if (result?.syncedLyrics) state.lyrics = parseLrc(result.syncedLyrics);
    state.plainLyrics = result?.plainLyrics || '';
  } catch {
    state.plainLyrics = '';
  } finally {
    state.lyricsLoading = false;
    if (state.playerOpen && trackKey(state.current) === key) render();
  }
}

async function updateRuntime() {
  state.runtimeLoading = true;
  render();
  try {
    state.runtimeStatus = await backend.updateRuntimeDependencies();
    toast(state.runtimeStatus?.warnings?.length
      ? 'yt-dlp updated. Runtime checks found warnings.'
      : 'yt-dlp updated.');
  } catch (error) {
    toast(`yt-dlp update failed: ${readableError(error)}`, 'error');
  } finally {
    state.runtimeLoading = false;
    render();
  }
}

async function checkForAppUpdate(silent = false) {
  if (updateInProgress) return;
  updateInProgress = true;
  state.updateLoading = true;
  if (state.tab === 'settings') render();
  try {
    saveSession();
    const version = await backend.autoUpdate();
    if (!version && !silent) toast('Vitr is up to date.');
  } catch (error) {
    if (!silent) toast(`Update check failed: ${readableError(error)}`, 'error');
  } finally {
    updateInProgress = false;
    state.updateLoading = false;
    if (state.tab === 'settings') render();
  }
}

function resetVitrApp() {
  const confirmed = window.confirm('Reset Vitr? This clears favorites, history, playlists, preferences, and saved playback. Downloaded music files stay on disk.');
  if (!confirmed) return;

  resetInProgress = true;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  sourceCache.clear();

  if (!persistence.resetAll()) {
    resetInProgress = false;
    toast('Could not reset Vitr app data.', 'error');
    return;
  }

  window.location.reload();
}

function saveSession(positionSeconds = audio.currentTime || 0) {
  persistence.saveSession({
    current: state.current,
    queue: state.queue,
    queueIndex: state.queueIndex,
    positionSeconds,
  });
}

function savePlaybackPositionIfChanged() {
  const positionSecond = Math.max(0, Math.floor(Number(audio.currentTime) || 0));
  if (positionSecond === lastPersistedPositionSecond) return;
  lastPersistedPositionSecond = positionSecond;
  saveSession(positionSecond);
}

async function restoreSession() {
  const session = persistence.loadSession();
  if (!session.current) return;
  state.current = session.current;
  state.queue = session.queue.length ? session.queue : [session.current];
  state.queueIndex = session.queueIndex >= 0 ? session.queueIndex : 0;
  updateAmbient(state.current);
  updateMediaSession(state.current);
  prefetchQueueSources();
  render();
  syncNativeMediaControls();
  try {
    audio.src = await sourceCache.get(state.current);
    audio.addEventListener('loadedmetadata', () => {
      if (session.positionSeconds > 0) {
        audio.currentTime = Math.min(session.positionSeconds, audio.duration || session.positionSeconds);
      }
      lastPersistedPositionSecond = Math.max(0, Math.floor(Number(audio.currentTime) || 0));
      syncNativeMediaControls();
    }, { once: true });
  } catch {}
  syncNativeMediaControls();
}

function ensureUiEnhancements() {
  const miniActions = document.querySelector('.mini-actions');
  if (miniActions && !document.querySelector('#mini-volume')) {
    const volumeControl = document.createElement('label');
    volumeControl.className = 'mini-volume';
    volumeControl.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"></path><path d="M15 9a4 4 0 0 1 0 6"></path><path d="M17.8 6.5a8 8 0 0 1 0 11"></path></svg><input id="mini-volume" type="range" min="0" max="1" step="0.01" value="${state.prefs.muted ? 0 : state.prefs.volume}" aria-label="Volume"/>`;
    miniActions.prepend(volumeControl);
  }

  const miniVolume = document.querySelector('#mini-volume');
  if (miniVolume && miniVolume.dataset.bound !== '1') {
    miniVolume.dataset.bound = '1';
    miniVolume.addEventListener('input', (event) => {
      setVolume(Number(event.target.value));
    });
  }
  if (miniVolume && !miniVolume.matches(':active')) {
    miniVolume.value = String(state.prefs.muted ? 0 : state.prefs.volume);
  }
}

function syncPlayerUi() {
  ensureUiEnhancements();
  const progress = audio.duration ? Math.max(0, Math.min(100, (audio.currentTime / audio.duration) * 100)) : 0;
  document.querySelector('.mini-progress i')?.style.setProperty('width', `${progress}%`);
  const seek = document.querySelector('#seek');
  if (seek && !seek.matches(':active')) { seek.max = String(Math.max(1, audio.duration || state.current?.durationSeconds || 1)); seek.value = String(audio.currentTime || 0); }
  const pos = document.querySelector('#position-label');
  const duration = document.querySelector('#duration-label');
  if (pos) pos.textContent = formatClock(audio.currentTime || 0);
  if (duration) duration.textContent = formatClock(audio.duration || state.current?.durationSeconds || 0);
  const activeLine = state.playerOpen ? currentLyricIndex(state.lyrics, audio.currentTime || 0) : -1;
  document.querySelectorAll('.lyric-line').forEach((line, index) => line.classList.toggle('active', index === activeLine));
  document.querySelector('.lyric-line.active')?.scrollIntoView({ block: 'center', behavior: state.prefs.reducedMotion ? 'auto' : 'smooth' });
}

app.addEventListener('click', async (event) => {
  const externalLink = event.target.closest('[data-external]');
  if (externalLink) {
    event.preventDefault();
    const url = externalLink.dataset.external;
    try {
      if (tauri?.opener?.openUrl) await tauri.opener.openUrl(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return;
  }

  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    state.tab = tabButton.dataset.tab;
    state.playerOpen = false;
    state.playlistPickerTrackKey = '';
    render();
    if (state.tab === 'save' || state.tab === 'library') void refreshOffline();
    if (state.tab === 'search') setTimeout(() => document.querySelector('#search-input')?.focus(), 40);
    return;
  }
  const searchChip = event.target.closest('[data-search]');
  if (searchChip) { state.tab = 'search'; await performSearch(searchChip.dataset.search); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const track = button.dataset.track ? trackRegistry.get(button.dataset.track) : null;
  switch (button.dataset.action) {
    case 'play-track': {
      const activePlaylist = state.tab === 'library' ? playlistById(state.activePlaylistId) : null;
      const sourceList = state.tab === 'search' ? state.searchResults : state.tab === 'library' && activePlaylist ? activePlaylist.tracks : state.tab === 'library' ? [...state.favorites, ...state.offline] : state.tab === 'save' ? state.offline : state.history.length ? state.history : [track];
      const selection = selectPlaybackQueue(track, sourceList);
      await playTrack(track, selection.queue, selection.index);
      break;
    }
    case 'toggle-play': await togglePlay(); break;
    case 'open-player': state.playerOpen = true; state.playlistPickerTrackKey = ''; await loadLyrics(state.current); render(); break;
    case 'close-player': state.playerOpen = false; render(); break;
    case 'next': await goNext(); break;
    case 'previous': await goPrevious(); break;
    case 'favorite': toggleFavorite(track || state.current); break;
    case 'download': await queueDownload(track || state.current); break;
    case 'remove-download': await removeOfflineTrack(track); break;
    case 'playlist-picker': {
      const target = track || state.current;
      if (!target) break;
      state.playlistPickerTrackKey = trackKey(target);
      render();
      break;
    }
    case 'close-playlist-picker': state.playlistPickerTrackKey = ''; render(); break;
    case 'add-to-playlist': {
      const target = findTrackByKey(state.playlistPickerTrackKey);
      const playlist = playlistById(button.dataset.playlist);
      if (!target || !playlist) { state.playlistPickerTrackKey = ''; render(); break; }
      const before = Array.isArray(playlist.tracks) ? playlist.tracks.length : 0;
      state.playlists = addTrackToPlaylist(state.playlists, playlist.id, target);
      const after = playlistById(playlist.id)?.tracks?.length || 0;
      state.playlistPickerTrackKey = '';
      persistLists();
      render();
      toast(after > before ? `Added to ${playlist.name}` : `Already in ${playlist.name}`);
      break;
    }
    case 'open-playlist': state.tab = 'library'; state.activePlaylistId = button.dataset.playlist || null; render(); break;
    case 'back-playlists': state.activePlaylistId = null; render(); break;
    case 'play-playlist': {
      const playlist = playlistById(button.dataset.playlist);
      if (!playlist?.tracks?.length) { toast('This playlist is empty.'); break; }
      await playTrack(playlist.tracks[0], playlist.tracks, 0);
      break;
    }
    case 'delete-playlist': {
      const playlist = playlistById(button.dataset.playlist);
      if (!playlist) break;
      state.playlists = deletePlaylist(state.playlists, playlist.id);
      if (state.activePlaylistId === playlist.id) state.activePlaylistId = null;
      persistLists();
      render();
      toast(`Deleted ${playlist.name}`);
      break;
    }
    case 'remove-from-playlist': {
      const playlist = playlistById(button.dataset.playlist);
      const target = track || findTrackByKey(button.dataset.track);
      if (!playlist || !target) break;
      state.playlists = removeTrackFromPlaylist(state.playlists, playlist.id, target);
      persistLists();
      render();
      break;
    }
    case 'clear-search': state.searchQuery = ''; state.searchResults = []; state.searchGroups = { artists: [], albums: [], playlists: [], genres: [] }; state.searchError = ''; render(); setTimeout(() => document.querySelector('#search-input')?.focus(), 0); break;
    case 'retry-search': await performSearch(state.searchQuery); break;
    case 'shuffle': state.prefs.shuffle = !state.prefs.shuffle; savePrefs(); render(); syncNativeMediaControls(); break;
    case 'repeat': state.prefs.repeat = state.prefs.repeat === 'off' ? 'queue' : state.prefs.repeat === 'queue' ? 'track' : 'off'; savePrefs(); render(); syncNativeMediaControls(); break;
    case 'queue-play': { const index = Number(button.dataset.index); if (state.queue[index]) await playTrack(state.queue[index], state.queue, index); break; }
    case 'cancel-download': { const task = state.downloads.find((item) => item.id === button.dataset.task); if (task) { await backend.cancelDownload(task.id).catch(() => {}); state.downloads = state.downloads.filter((item) => item.id !== task.id); render(); } break; }
    case 'retry-download': { const task = state.downloads.find((item) => item.id === button.dataset.task); if (task) await queueDownload(task.track, task); break; }
    case 'update-runtime': await updateRuntime(); break;
    case 'check-app-update': await checkForAppUpdate(false); break;
    case 'reset-app': resetVitrApp(); break;
  }
});


audio.addEventListener('play', () => {
  state.playing = true;
  document.body.classList.add('is-playing');
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  render();
  syncNativeMediaControls();
  void showFloatingMiniPlayerForPlayback();
});
audio.addEventListener('pause', () => { state.playing = false; document.body.classList.remove('is-playing'); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; render(); saveSession(); syncNativeMediaControls(); });
audio.addEventListener('timeupdate', () => { syncPlayerUi(); savePlaybackPositionIfChanged(); syncNativeMediaControls(); });
audio.addEventListener('durationchange', () => { syncPlayerUi(); syncNativeMediaControls(); });
audio.addEventListener('ended', goNext);
audio.addEventListener('error', () => {
  if (state.current) {
    sourceCache.clear(state.current);
    toast(`Playback error: ${state.current.title}`, 'error');
  }
});

window.addEventListener('keydown', (event) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (event.ctrlKey && event.key.toLowerCase() === 'f') {
    event.preventDefault(); state.tab = 'search'; state.playerOpen = false; state.playlistPickerTrackKey = ''; render(); setTimeout(() => document.querySelector('#search-input')?.focus(), 30); return;
  }
  if (typing) return;
  if (event.code === 'Space') { event.preventDefault(); void togglePlay(); }
  if (event.key === 'Escape' && state.playlistPickerTrackKey) { state.playlistPickerTrackKey = ''; render(); return; }
  if (event.key === 'Escape' && state.playerOpen) { state.playerOpen = false; render(); }
  if (event.altKey && event.key === 'ArrowRight') void goNext();
  if (event.altKey && event.key === 'ArrowLeft') void goPrevious();
});

async function initialize() {
  // Paint the shell before any native/runtime work so Vitr never opens as a dead black window.
  render();

  // A saved mini-player preference means "show while playing", never "spawn on app launch".
  void backend.setMiniPlayerEnabled(false, state.prefs.miniPlayerLayout || 'bar').catch(() => {});

  if ('mediaSession' in navigator) {
    const handlers = {
      play: () => void audio.play(),
      pause: () => audio.pause(),
      previoustrack: () => void goPrevious(),
      nexttrack: () => void goNext(),
      seekto: (details) => { if (Number.isFinite(details.seekTime)) seekTo(details.seekTime); },
      seekbackward: (details) => { seekBy(-(details.seekOffset || 10)); },
      seekforward: (details) => { seekBy(details.seekOffset || 10); },
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
    }
  }

  if (listen) {
    try {
      await listen('player-command', ({ payload }) => {
        void applyNativeMediaCommand(nativeMediaActions, payload);
      });
      await listen('mini-player-command', ({ payload }) => {
        void applyNativeMediaCommand(nativeMediaActions, payload);
      });
      await listen('mini-player-disabled', () => {
        state.prefs.floatingMiniPlayer = false;
        savePrefs();
        if (state.tab === 'settings') render();
      });
    } catch {}
  }

  document.documentElement.classList.toggle('no-liquid-glass', state.prefs.liquidGlass === false);
  document.documentElement.classList.toggle(
    'reduce-motion',
    state.prefs.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  try {
    if (!state.prefs.downloadDir && tauri?.path?.audioDir) {
      const dir = await tauri.path.audioDir();
      state.prefs = normalizePreferences(state.prefs, dir || '');
      savePrefs();
      render();
    }
  } catch {}

  void backend.setTrayEnabled(state.prefs.trayEnabled).catch(() => {});

  void backend.currentRuntimeStatus()
    .then((status) => {
      state.runtimeStatus = status;
      if (state.tab === 'settings') render();
    })
    .catch(() => {});

  try {
    downloadUnlisten = await backend.onDownloadProgress((payload) => {
      const task = state.downloads.find((item) => item.id === payload.task_id);
      if (!task) return;
      task.progress = Number(payload.percent || 0);
      task.speed = payload.speed || '';
      task.eta = payload.eta || '';
      task.itemTitle = payload.item_title || '';
      if (state.tab === 'save') render();
    });
  } catch {}

  void restoreSession()
    .then(() => {
      render();
      syncNativeMediaControls();
    })
    .catch(() => {});

  void refreshOffline()
    .then(() => render())
    .catch(() => {});

  if (state.prefs.autoUpdate !== false) {
    setTimeout(() => { void checkForAppUpdate(true); }, 8000);
  }
}

window.addEventListener('beforeunload', () => {
  if (!resetInProgress) saveSession();
  if (typeof downloadUnlisten === 'function') downloadUnlisten();
});
void initialize();