import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ExternalLink,
  Heart,
  Home,
  Library,
  ListMusic,
  Loader2,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Search as SearchIcon,
  Settings,
  Shuffle,
  Sparkles,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { mergeAndRankMusicResults, refineMusicMetadata } from '../shared/musicSearch.js';
import {
  buildColdStartSeeds,
  buildRecommendationSeeds,
  diversifyTracks,
  makeRecommendationCache,
  readRecommendationCache,
  recommendationSignature,
  writeRecommendationCache,
} from './recommendations.js';
import { buildArtistQuery, buildGenreQuery, classifyGenres, extractArtists } from './searchTaxonomy.js';
import {
  addTrackToPlaylist,
  buildGeneratedPlaylists,
  createManualPlaylist,
  deleteManualPlaylist,
  GENERATED_PLAYLISTS_KEY,
  MANUAL_PLAYLISTS_KEY,
  moveTrackInPlaylist,
  parseGeneratedPlaylists,
  parseManualPlaylists,
  removeTrackFromPlaylist,
  renameManualPlaylist,
} from './playlists.js';
import { loadYouTubeIframeApi } from './youtubeIframeApi.js';
import { resetVitrWebStorage } from './resetWebPlayer.js';
import './vitr-web.css';

type Track = {
  id: string;
  title: string;
  artist: string;
  thumbnail?: string;
  duration?: string | null;
  publishedAt?: string | null;
  official?: boolean;
  topic?: boolean;
  vevo?: boolean;
};

type RecommendationRow = {
  id: string;
  title: string;
  subtitle?: string;
  seedKind?: string;
  seedLabel?: string;
  tracks: Track[];
};

type ManualPlaylist = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
};

type GeneratedPlaylist = {
  id: string;
  kind: string;
  name: string;
  subtitle: string;
  generatedAt: number;
  tracks: Track[];
};

type Tab = 'home' | 'search' | 'library' | 'settings';
type RepeatMode = 'off' | 'queue' | 'track';

export const VITR_WEB_VERSION = '0.5.7';
const BLOOD_GITHUB = 'https://github.com/bloodvitr';
const VITR_REPO = 'https://github.com/voidnont/vitr';
const VITR_RELEASES = 'https://github.com/bloodvitr/vitr/releases';
const VITR_DONATE = 'https://ko-fi.com/bloodvitr';
const LIBRARY_KEY = 'vitr.web.library.v1';
const LEGACY_VITR_LIBRARY_KEY = 'frxe.web.library.v1';
const HISTORY_KEY = 'vitr.web.history.v1';
const LEGACY_HISTORY_KEY = 'frxe.web.history.v1';
const RECENT_SEARCHES_KEY = 'vitr.web.searches.v1';
const LEGACY_SEARCHES_KEY = 'frxe.web.searches.v1';
const SETTINGS_KEY = 'vitr.web.player.v1';
const LEGACY_SETTINGS_KEY = 'frxe.web.player.v1';
const LEGACY_LIBRARY_KEY = 'nont.music.youtube.favorites.v1';

function safeJson<T>(raw: string | null, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

function loadTracks(key: string): Track[] {
  const raw = safeJson<unknown>(localStorage.getItem(key), []);
  return Array.isArray(raw) ? raw.filter((item: any) => item?.id).map((item) => refineMusicMetadata(item) as Track) : [];
}

function loadLibrary() {
  const current = loadTracks(LIBRARY_KEY);
  if (current.length) return current;
  const frxe = loadTracks(LEGACY_VITR_LIBRARY_KEY);
  return frxe.length ? frxe : loadTracks(LEGACY_LIBRARY_KEY);
}

function loadStrings(key: string) {
  const raw = safeJson<unknown>(localStorage.getItem(key), []);
  return Array.isArray(raw) ? raw.map(String).filter(Boolean).slice(0, 20) : [];
}

function decodeHtml(value: string) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value || '';
  return textarea.value;
}

function uniqueTracks(items: Track[]) {
  const seen = new Set<string>();
  return items.filter((track) => {
    if (!track?.id || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function shuffleCopy<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function weekKey() {
  const date = new Date();
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return `${date.getUTCFullYear()}-W${Math.ceil((day + start.getUTCDay() + 1) / 7)}`;
}

function rowTitle(seed: any) {
  if (seed.kind === 'artist') return `More from ${seed.label}`;
  if (seed.kind === 'track') return `Because you listened to ${seed.label}`;
  if (seed.kind === 'genre') return `Explore ${seed.label}`;
  return 'Fresh discovery';
}

export default function VitrWebApp() {
  const initialSettings = useRef(safeJson(localStorage.getItem(SETTINGS_KEY) || localStorage.getItem(LEGACY_SETTINGS_KEY), { volume: 76, muted: false, shuffle: false, repeat: 'off', finish: 'normal' }));
  const playerRef = useRef<any>(null);
  const playerReadyRef = useRef(false);
  const pendingVideoRef = useRef<string | null>(null);
  const endedRef = useRef<() => void>(() => undefined);
  const searchRequestRef = useRef(0);

  const [tab, setTab] = useState<Tab>('home');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [library, setLibrary] = useState<Track[]>(loadLibrary);
  const [history, setHistory] = useState<Track[]>(() => { const current = loadTracks(HISTORY_KEY); return current.length ? current : loadTracks(LEGACY_HISTORY_KEY); });
  const [recentSearches, setRecentSearches] = useState<string[]>(() => { const current = loadStrings(RECENT_SEARCHES_KEY); return current.length ? current : loadStrings(LEGACY_SEARCHES_KEY); });
  const [recommendationRows, setRecommendationRows] = useState<RecommendationRow[]>([]);
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [manualPlaylists, setManualPlaylists] = useState<ManualPlaylist[]>(() => parseManualPlaylists(localStorage.getItem(MANUAL_PLAYLISTS_KEY)) as ManualPlaylist[]);
  const [generatedPlaylists, setGeneratedPlaylists] = useState<GeneratedPlaylist[]>(() => parseGeneratedPlaylists(localStorage.getItem(GENERATED_PLAYLISTS_KEY)) as GeneratedPlaylist[]);
  const [playlistName, setPlaylistName] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlistPickerTrack, setPlaylistPickerTrack] = useState<Track | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(Number(initialSettings.current.volume) || 76);
  const [muted, setMuted] = useState(Boolean(initialSettings.current.muted));
  const [shuffle, setShuffle] = useState(Boolean(initialSettings.current.shuffle));
  const [repeat, setRepeat] = useState<RepeatMode>(['queue', 'track'].includes(initialSettings.current.repeat) ? initialSettings.current.repeat : 'off');
  const savedFinish = String(initialSettings.current.finish || 'normal');
  const [finish, setFinish] = useState<'normal' | 'glass' | 'blood'>(savedFinish === 'glass' ? 'glass' : savedFinish === 'blood' ? 'blood' : 'normal');

  const libraryIds = useMemo(() => new Set(library.map((track) => track.id)), [library]);
  const artists = useMemo(() => extractArtists(results, 8), [results]);
  const genres = useMemo(() => classifyGenres(query, results, 8), [query, results]);
  const topResult = results[0] || null;
  const selectedPlaylist = manualPlaylists.find((playlist) => playlist.id === selectedPlaylistId) || null;

  useEffect(() => { try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(library.slice(0, 300))); } catch {} }, [library]);
  useEffect(() => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100))); } catch {} }, [history]);
  useEffect(() => { try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recentSearches.slice(0, 20))); } catch {} }, [recentSearches]);
  useEffect(() => { try { localStorage.setItem(MANUAL_PLAYLISTS_KEY, JSON.stringify(manualPlaylists)); } catch {} }, [manualPlaylists]);
  useEffect(() => { try { localStorage.setItem(GENERATED_PLAYLISTS_KEY, JSON.stringify(generatedPlaylists)); } catch {} }, [generatedPlaylists]);
  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ volume, muted, shuffle, repeat, finish })); } catch {} }, [volume, muted, shuffle, repeat, finish]);

  useEffect(() => {
    let cancelled = false;
    void loadYouTubeIframeApi().then((yt: any) => {
      if (cancelled || playerRef.current) return;
      playerRef.current = new yt.Player('frxe-youtube-player', {
        height: '1',
        width: '1',
        playerVars: {
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            playerReadyRef.current = true;
            event.target.setVolume(volume);
            if (muted) event.target.mute();
            if (pendingVideoRef.current) {
              event.target.loadVideoById(pendingVideoRef.current);
              pendingVideoRef.current = null;
            }
          },
          onStateChange: (event: any) => {
            if (event.data === yt.PlayerState.PLAYING) setPlaying(true);
            if (event.data === yt.PlayerState.PAUSED || event.data === yt.PlayerState.CUED) setPlaying(false);
            if (event.data === yt.PlayerState.ENDED) { setPlaying(false); endedRef.current(); }
          },
          onError: (event: any) => {
            setPlaying(false);
            const code = Number(event?.data);
            const reason = code === 101 || code === 150
              ? 'This track does not allow embedded web playback.'
              : code === 100
                ? 'This track is unavailable.'
                : 'YouTube web playback failed for this track.';
            setSearchError(`${reason} Try another result.`);
          },
        },
      });
    }).catch((error) => {
      if (!cancelled) setSearchError(error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = null;
      playerReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!playerReadyRef.current || !playerRef.current) return;
      try {
        const nextPosition = Number(playerRef.current.getCurrentTime?.() || 0);
        const nextDuration = Number(playerRef.current.getDuration?.() || 0);
        if (Number.isFinite(nextPosition)) setPosition(nextPosition);
        if (Number.isFinite(nextDuration)) setDuration(nextDuration);
      } catch {}
    }, 400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!playerReadyRef.current || !playerRef.current) return;
    try {
      playerRef.current.setVolume(volume);
      if (muted) playerRef.current.mute(); else playerRef.current.unMute();
    } catch {}
  }, [volume, muted]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (current && 'MediaMetadata' in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: `VITR Web ${VITR_WEB_VERSION}`,
        artwork: current.thumbnail ? [{ src: current.thumbnail }] : [],
      });
    }
    try { navigator.mediaSession.setActionHandler('play', () => playerRef.current?.playVideo?.()); } catch {}
    try { navigator.mediaSession.setActionHandler('pause', () => playerRef.current?.pauseVideo?.()); } catch {}
    try { navigator.mediaSession.setActionHandler('nexttrack', () => move(1)); } catch {}
    try { navigator.mediaSession.setActionHandler('previoustrack', () => move(-1)); } catch {}
  }, [current, queue, shuffle]);

  useEffect(() => {
    if (tab !== 'home') return;
    let cancelled = false;
    const signature = recommendationSignature({ history, library, recentSearches });
    const cached = readRecommendationCache(localStorage, signature, Date.now());
    if (cached?.rows?.length) setRecommendationRows(cached.rows as RecommendationRow[]);
    if (cached) return;

    const seeds = (history.length || library.length || recentSearches.length)
      ? buildRecommendationSeeds({ history, library, recentSearches }).slice(0, 6)
      : buildColdStartSeeds(weekKey(), 6);
    setRecommendationBusy(true);

    Promise.allSettled(seeds.map(async (seed: any) => {
      const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(seed.query)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Search failed (${response.status}).`);
      const decoded = (data.items || []).map((item: Track) => refineMusicMetadata({ ...item, title: decodeHtml(item.title), artist: decodeHtml(item.artist) }) as Track);
      return { seed, tracks: mergeAndRankMusicResults(decoded, seed.query, 24) as Track[] };
    })).then((settled) => {
      if (cancelled) return;
      const seen = new Set<string>();
      const rows: RecommendationRow[] = [];
      for (const result of settled) {
        if (result.status !== 'fulfilled') continue;
        const { seed, tracks } = result.value;
        const diversified = diversifyTracks(tracks, { artistCap: 2, limit: 10, excludeIds: [...seen] }) as Track[];
        if (!diversified.length) continue;
        diversified.forEach((track) => seen.add(track.id));
        rows.push({ id: seed.id, title: rowTitle(seed), subtitle: seed.kind === 'wildcard' ? 'A little outside your usual rotation' : undefined, seedKind: seed.kind, seedLabel: seed.label, tracks: diversified });
      }
      if (rows.length) {
        setRecommendationRows(rows);
        writeRecommendationCache(localStorage, makeRecommendationCache(signature, rows));
      }
    }).finally(() => { if (!cancelled) setRecommendationBusy(false); });

    return () => { cancelled = true; };
  }, [tab, history, library, recentSearches]);

  useEffect(() => {
    const next = buildGeneratedPlaylists({ history, library, recommendationRows, now: Date.now() }) as GeneratedPlaylist[];
    if (next.length) setGeneratedPlaylists(next);
  }, [history, library, recommendationRows]);

  function playTrack(track: Track, nextQueue: Track[] = [track]) {
    const clean = refineMusicMetadata(track) as Track;
    const cleanQueue = uniqueTracks(nextQueue.length ? nextQueue : [clean]);
    setCurrent(clean);
    setQueue(cleanQueue);
    setHistory((items) => [clean, ...items.filter((item) => item.id !== clean.id)].slice(0, 100));
    setPosition(0);
    setDuration(0);
    setSearchError('');
    if (playerReadyRef.current && playerRef.current) playerRef.current.loadVideoById(clean.id);
    else pendingVideoRef.current = clean.id;
  }

  function playPlaylist(tracks: Track[], shuffled = false) {
    const next = shuffled ? shuffleCopy(tracks) : [...tracks];
    if (next[0]) playTrack(next[0], next);
  }

  function move(direction: 1 | -1) {
    if (!current || !queue.length) return;
    if (shuffle && direction === 1 && queue.length > 1) {
      const candidates = queue.filter((track) => track.id !== current.id);
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      if (next) playTrack(next, queue);
      return;
    }
    const index = Math.max(0, queue.findIndex((track) => track.id === current.id));
    playTrack(queue[(index + direction + queue.length) % queue.length], queue);
  }

  function onEnded() {
    if (!current) return;
    if (repeat === 'track') {
      playerRef.current?.seekTo?.(0, true);
      playerRef.current?.playVideo?.();
      return;
    }
    const index = queue.findIndex((track) => track.id === current.id);
    if (index < queue.length - 1 || repeat === 'queue') move(1);
  }
  endedRef.current = onEnded;

  function togglePlay() {
    if (!playerReadyRef.current || !playerRef.current) return;
    if (!current) {
      const first = results[0] || library[0] || history[0] || recommendationRows[0]?.tracks[0];
      if (first) playTrack(first, results.length ? results : [first]);
      return;
    }
    const win = window as any;
    if (playerRef.current.getPlayerState?.() === win.YT?.PlayerState?.PLAYING) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }

  function seek(value: number) {
    playerRef.current?.seekTo?.(value, true);
    setPosition(value);
  }

  function toggleLibrary(track: Track) {
    setLibrary((items) => items.some((item) => item.id === track.id) ? items.filter((item) => item.id !== track.id) : [track, ...items]);
  }

  async function runSearch(text: string, record = true) {
    const term = text.trim();
    if (!term || searching) return;
    const requestId = ++searchRequestRef.current;
    setQuery(term);
    setSearching(true);
    setSearchError('');
    try {
      const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(term)}`);
      const data = await response.json().catch(() => ({}));
      if (requestId !== searchRequestRef.current) return;
      if (!response.ok) throw new Error(data.error || `Search failed (${response.status}).`);
      const decoded = (data.items || []).map((item: Track) => refineMusicMetadata({ ...item, title: decodeHtml(item.title), artist: decodeHtml(item.artist) }) as Track);
      const tracks = mergeAndRankMusicResults(decoded, term, 40) as Track[];
      setResults(tracks);
      setQueue(tracks);
      if (record) setRecentSearches((items) => [term, ...items.filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, 20));
      if (!tracks.length) setSearchError('No playable music results were found for that search.');
    } catch (error) {
      if (requestId !== searchRequestRef.current) return;
      setResults([]);
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      if (requestId === searchRequestRef.current) setSearching(false);
    }
  }

  async function searchSubmit(event: FormEvent) {
    event.preventDefault();
    await runSearch(query);
  }

  function clearSearch() {
    searchRequestRef.current += 1;
    setQuery('');
    setResults([]);
    setSearchError('');
    setSearching(false);
  }

  function createPlaylist() {
    const name = playlistName.trim();
    if (!name) return;
    setManualPlaylists((items) => createManualPlaylist(items, name, { now: Date.now() }) as ManualPlaylist[]);
    setPlaylistName('');
  }

  function addToPlaylist(playlistId: string, track: Track) {
    setManualPlaylists((items) => addTrackToPlaylist(items, playlistId, track, Date.now()) as ManualPlaylist[]);
    setPlaylistPickerTrack(null);
  }

  function resetWebPlayer() {
    const confirmed = window.confirm('Reset VITR Web? This clears your saved songs, history, playlists, searches and player settings on this device.');
    if (!confirmed) return;
    try { playerRef.current?.stopVideo?.(); } catch {}
    resetVitrWebStorage(localStorage);
    window.location.reload();
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Home }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'search', label: 'Search', icon: SearchIcon },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="frxe-app frxe069-app" data-vitr-finish={finish}>
      <div className="frxe-ambient" aria-hidden="true" />
      <div className="frxe-noise" aria-hidden="true" />
      <div className="frxe-source-player" aria-hidden="true"><div id="frxe-youtube-player" /></div>

      <main className="frxe-stage frxe069-stage">
        <div className="vitr-theme-switcher" role="group" aria-label="Interface style">
          <span className="vitr-theme-switcher-label"><Sparkles size={15} /> UI</span>
          <button className={finish === 'normal' ? 'active' : ''} aria-pressed={finish === 'normal'} onClick={() => setFinish('normal')}><i className="theme-dot normal" /> Normal</button>
          <button className={finish === 'glass' ? 'active' : ''} aria-pressed={finish === 'glass'} onClick={() => setFinish('glass')}><i className="theme-dot glass" /> Liquid Glass</button>
          <button className={finish === 'blood' ? 'active blood' : 'blood'} aria-pressed={finish === 'blood'} onClick={() => setFinish('blood')}><i className="theme-dot blood" /> Blood Crystallized</button>
        </div>
        {tab === 'home' && (
          <section className="frxe-screen">
            <header className="frxe-heading frxe069-heading">
              <div className="frxe069-home-brand"><img className="frxe069-brand-icon" src="/vitr-icon.png" alt="" /><div><span className="frxe-kicker">VITR WEB · v{VITR_WEB_VERSION}</span><h1>VITR</h1><p>Music flows different here. Your plays, saves, artists, genres and discovery signals stay at the center.</p></div></div>
              <a className="frxe-icon-button" href={VITR_REPO} target="_blank" rel="noreferrer" aria-label="Open VITR support"><ExternalLink size={19} /></a>
            </header>
            {generatedPlaylists.length > 0 && <PlaylistShelf title="Made for you" playlists={generatedPlaylists.slice(0, 6)} onPlay={playPlaylist} />}
            {recommendationRows.map((row) => <TrackRail key={row.id} title={row.title} subtitle={row.subtitle} tracks={row.tracks} onPlay={(track) => playTrack(track, row.tracks)} onAdd={setPlaylistPickerTrack} />)}
            {recommendationBusy && <div className="frxe069-loading"><Loader2 className="frxe-spin" size={18} /> Refreshing your mixes…</div>}
            {history.length > 0 && <TrackRail title="Recently played" tracks={history.slice(0, 12)} onPlay={(track) => playTrack(track, history)} onAdd={setPlaylistPickerTrack} />}
            {!history.length && !recommendationRows.length && !recommendationBusy && <EmptyState onSearch={() => setTab('search')} />}
          </section>
        )}

        {tab === 'search' && (
          <section className="frxe-screen">
            <div className="frxe069-sticky-search">
              <header className="frxe-heading compact frxe069-page-title"><div><h2>Search</h2><p>Songs, artists, genres and related mixes.</p></div></header>
              <div className="frxe-glass strong frxe-search-glass frxe069-search-bar"><form onSubmit={searchSubmit}><SearchIcon size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs, artists, genres…" aria-label="Search VITR" /><button type="button" aria-label="Clear search" className="frxe-search-clear" onClick={clearSearch} disabled={!query && !results.length && !searchError && !searching}><X size={17} /></button><button type="submit" aria-label="Search music" className="frxe-search-submit" disabled={searching || !query.trim()}>{searching ? <Loader2 size={18} className="frxe-spin" /> : <ArrowDown size={18} />}</button></form></div>
            </div>
            {recentSearches.length > 0 && <div className="frxe069-chips">{recentSearches.slice(0, 8).map((term) => <button key={term} onClick={() => runSearch(term)}>{term}</button>)}</div>}
            {searchError && <div className="frxe-error" role="alert">{searchError}</div>}
            {topResult && <section className="frxe069-section"><h3>Top Result</h3><TrackRow track={topResult} current={current} playing={playing} saved={libraryIds.has(topResult.id)} onPlay={() => current?.id === topResult.id ? togglePlay() : playTrack(topResult, results)} onSave={() => toggleLibrary(topResult)} onAdd={() => setPlaylistPickerTrack(topResult)} /></section>}
            {results.length > 0 && <section className="frxe069-section"><div className="frxe069-section-title"><h3>Songs</h3><span>{results.length} results</span></div><div className="frxe-result-list">{results.slice(0, 20).map((track) => <TrackRow key={track.id} track={track} current={current} playing={playing} saved={libraryIds.has(track.id)} onPlay={() => current?.id === track.id ? togglePlay() : playTrack(track, results)} onSave={() => toggleLibrary(track)} onAdd={() => setPlaylistPickerTrack(track)} />)}</div></section>}
            {results.length > 0 && <div className="frxe069-search-columns">
              <section className="frxe069-section"><h3>Artists</h3><div className="frxe069-artist-grid">{artists.map((artist: any) => <button key={artist.id} className="frxe-glass frxe069-artist" onClick={() => runSearch(buildArtistQuery(artist))}>{artist.thumbnail ? <img src={artist.thumbnail} alt="" /> : <Music2 size={28} />}<strong>{artist.name}</strong><span>Artist</span></button>)}</div></section>
              <section className="frxe069-section"><h3>Genres</h3><div className="frxe069-genre-grid">{genres.map((genre: any) => <button key={genre.id} className="frxe069-genre" onClick={() => runSearch(buildGenreQuery(genre))}>{genre.name}</button>)}</div></section>
            </div>}
            {results.length > 0 && <section className="frxe069-section"><h3>Related Mixes</h3><div className="frxe069-mix-grid">{[...artists.slice(0, 2).map((artist: any) => ({ id: `artist-${artist.id}`, title: `${artist.name} Mix`, query: buildArtistQuery(artist) })), ...genres.slice(0, 3).map((genre: any) => ({ id: `genre-${genre.id}`, title: `${genre.name} Mix`, query: buildGenreQuery(genre) }))].map((mix) => <button key={mix.id} className="frxe-glass frxe069-mix" onClick={() => runSearch(mix.query)}><ListMusic size={22} /><strong>{mix.title}</strong><span>Open mix</span></button>)}</div></section>}
            {!searching && !results.length && !searchError && <div className="frxe-quiet-state">Search for anything—VITR will separate songs, artists, genres and mixes.</div>}
          </section>
        )}

        {tab === 'library' && (
          <section className="frxe-screen">
            <header className="frxe-heading compact frxe069-page-title frxe069-sticky-title"><div><h2>Library</h2><p>Saved songs, Your Playlists and VITR Mixes stay on this device.</p></div></header>
            <TrackRail title="Saved songs" tracks={library} onPlay={(track) => playTrack(track, library)} onAdd={setPlaylistPickerTrack} empty="Heart a song to save it here." />
            <section className="frxe069-section">
              <div className="frxe069-section-title"><h3>Your Playlists</h3><span>{manualPlaylists.length}</span></div>
              <div className="frxe069-create-row"><input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} placeholder="New playlist name" aria-label="New playlist name" /><button className="frxe-primary" onClick={createPlaylist} disabled={!playlistName.trim()}><Plus size={16} /> Create playlist</button></div>
              <div className="frxe069-playlist-grid">{manualPlaylists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => setSelectedPlaylistId(playlist.id)} onPlay={() => playPlaylist(playlist.tracks)} onShuffle={() => playPlaylist(playlist.tracks, true)} />)}{!manualPlaylists.length && <p className="frxe069-muted">Create a playlist, then add songs from Search or Now Playing.</p>}</div>
            </section>
            {selectedPlaylist && <section className="frxe069-section frxe-glass strong frxe069-editor"><div className="frxe069-editor-head"><div><span className="frxe-kicker">PLAYLIST</span><h3>{selectedPlaylist.name}</h3><p>{selectedPlaylist.tracks.length} songs</p></div><div className="frxe069-actions"><button onClick={() => playPlaylist(selectedPlaylist.tracks)}><Play size={16} /> Play All</button><button onClick={() => playPlaylist(selectedPlaylist.tracks, true)}><Shuffle size={16} /> Shuffle</button><button onClick={() => { const name = window.prompt('Rename playlist', selectedPlaylist.name); if (name) setManualPlaylists((items) => renameManualPlaylist(items, selectedPlaylist.id, name, Date.now()) as ManualPlaylist[]); }}>Rename</button><button onClick={() => { setManualPlaylists((items) => deleteManualPlaylist(items, selectedPlaylist.id) as ManualPlaylist[]); setSelectedPlaylistId(null); }}><Trash2 size={16} /> Delete</button><button aria-label="Close playlist" onClick={() => setSelectedPlaylistId(null)}><X size={16} /></button></div></div><div className="frxe069-editor-tracks">{selectedPlaylist.tracks.map((track, index) => <div key={track.id} className="frxe069-editor-track"><button aria-label={`Play ${track.title}`} onClick={() => playTrack(track, selectedPlaylist.tracks)}><Play size={15} /></button><span><strong>{track.title}</strong><small>{track.artist}</small></span><button aria-label="Move up" disabled={index === 0} onClick={() => setManualPlaylists((items) => moveTrackInPlaylist(items, selectedPlaylist.id, index, index - 1, Date.now()) as ManualPlaylist[])}><ArrowUp size={15} /></button><button aria-label="Move down" disabled={index === selectedPlaylist.tracks.length - 1} onClick={() => setManualPlaylists((items) => moveTrackInPlaylist(items, selectedPlaylist.id, index, index + 1, Date.now()) as ManualPlaylist[])}><ArrowDown size={15} /></button><button aria-label="Remove track" onClick={() => setManualPlaylists((items) => removeTrackFromPlaylist(items, selectedPlaylist.id, track.id, Date.now()) as ManualPlaylist[])}><Trash2 size={15} /></button></div>)}</div></section>}
            <section className="frxe069-section"><h3>VITR Mixes</h3><PlaylistShelf playlists={generatedPlaylists} onPlay={playPlaylist} />{!generatedPlaylists.length && <p className="frxe069-muted">Play and save more music to build VITR mixes.</p>}</section>
          </section>
        )}

        {tab === 'settings' && (
          <section className="frxe-screen">
            <header className="frxe-heading compact frxe069-page-title frxe069-sticky-title"><div><h2>Settings</h2><p>Appearance, support and local VITR data.</p></div></header>
            <div className="frxe-glass strong frxe069-settings">
              <div className="frxe069-setting-row vitr-setting-appearance"><Sparkles size={18} /><span><strong>Appearance</strong><small>{finish === 'normal' ? 'Normal' : finish === 'glass' ? 'Liquid Glass' : 'Blood Crystallized'}</small></span><div className="vitr-settings-theme-buttons"><button aria-label="Use Normal UI" className={finish === 'normal' ? 'active' : ''} onClick={() => setFinish('normal')}>Normal</button><button aria-label="Use Liquid Glass UI" className={finish === 'glass' ? 'active' : ''} onClick={() => setFinish('glass')}>Glass</button><button aria-label="Use Blood Crystallized UI" className={finish === 'blood' ? 'active blood' : 'blood'} onClick={() => setFinish('blood')}>Blood</button></div></div>
              <a className="frxe069-setting-row" href={BLOOD_GITHUB} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Blood · GitHub · github.com/bloodvitr</a>
              <a className="frxe069-setting-row" href={VITR_DONATE} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Blood · Ko-fi · ko-fi.com/bloodvitr</a>
              <a className="frxe069-setting-row" href={VITR_RELEASES} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Releases &amp; updates</a>
              <button className="frxe069-setting-row frxe069-reset" onClick={resetWebPlayer}><Trash2 size={18} /> Reset VITR Web</button>
              <p className="frxe069-reset-copy">Clears saved songs, history, playlists, recent searches and player settings from this browser, then starts VITR fresh.</p>
              <div className="frxe069-version"><span>VITR WEB</span><strong>v{VITR_WEB_VERSION}</strong><small>Playback runs directly in the browser with no VITR server token or worker setup.</small></div>
            </div>
          </section>
        )}
      </main>

      {current && !playerOpen && <div className="frxe-glass strong frxe-mini-player frxe069-mini"><button className="frxe-mini-main" onClick={() => setPlayerOpen(true)}>{current.thumbnail ? <img src={current.thumbnail} alt="" /> : <Music2 size={34} />}<span><strong>{current.title}</strong><small>{current.artist}</small></span></button><div className="frxe-mini-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap', maxWidth: 250 }}><button aria-label="Previous track" className="frxe-icon-button small" onClick={() => move(-1)}><SkipBack size={17} fill="currentColor" /></button><button aria-label={playing ? 'Pause' : 'Play'} className="frxe-icon-button small" onClick={togglePlay}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button><button aria-label="Next track" className="frxe-icon-button small" onClick={() => move(1)}><SkipForward size={17} fill="currentColor" /></button><button aria-label={muted ? 'Unmute' : 'Mute'} className="frxe-icon-button small" onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><input aria-label="Mini player volume" type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} style={{ width: 72, accentColor: '#fff' }} /></div></div>}

      {!playerOpen && <div className="frxe-glass strong frxe-nav"><div className="frxe-nav-brand" aria-label="Vitr Web"><img src="/vitr-icon.png" alt="" /><span><strong>vitr</strong><small>web</small></span></div>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={20} /><span>{label}</span></button>)}</div>}

      {playerOpen && current && <div className="frxe-player-overlay"><div className="frxe-player-bg" aria-hidden="true" /><div className="frxe-player-content frxe069-player"><div className="frxe-player-top"><button className="frxe-icon-button" aria-label="Close player" onClick={() => setPlayerOpen(false)}><ChevronDown size={23} /></button><div className="frxe-player-heading"><img className="frxe-player-logo" src="/vitr-icon.png" alt="" /><div><strong>NOW PLAYING</strong><span>VITR {VITR_WEB_VERSION}</span></div></div><button className="frxe-icon-button" aria-label="Add to playlist" onClick={() => setPlaylistPickerTrack(current)}><Plus size={20} /></button></div><div className="frxe069-player-main">{current.thumbnail ? <img className="frxe-player-art" src={current.thumbnail} alt="" /> : <div className="frxe069-art"><Music2 size={72} /></div>}<div className="frxe-player-meta"><h2>{current.title}</h2><p>{current.artist}</p></div><div className="frxe-progress"><input aria-label="Seek" type="range" min="0" max={Math.max(duration, 1)} value={Math.min(position, Math.max(duration, 1))} onChange={(event) => seek(Number(event.target.value))} /><div><span>{formatTime(position)}</span><span>{formatTime(duration)}</span></div></div><div className="frxe-player-controls"><button aria-label="Toggle shuffle" className={shuffle ? 'active' : ''} onClick={() => setShuffle((value) => !value)}><Shuffle size={21} /></button><button aria-label="Previous track" onClick={() => move(-1)}><SkipBack size={31} /></button><button aria-label={playing ? 'Pause' : 'Play'} className="main" onClick={togglePlay}>{playing ? <Pause size={38} fill="currentColor" /> : <Play size={38} fill="currentColor" />}</button><button aria-label="Next track" onClick={() => move(1)}><SkipForward size={31} /></button><button aria-label="Change repeat mode" className={repeat !== 'off' ? 'active' : ''} onClick={() => setRepeat((value) => value === 'off' ? 'queue' : value === 'queue' ? 'track' : 'off')}><Repeat2 size={21} /></button></div><div className="frxe069-player-actions"><button onClick={() => toggleLibrary(current)}><Heart size={20} fill={libraryIds.has(current.id) ? 'currentColor' : 'none'} /> {libraryIds.has(current.id) ? 'Saved' : 'Save'}</button><button onClick={() => setPlaylistPickerTrack(current)}><Plus size={20} /> Add to playlist</button><button onClick={() => setTab('library')}><ListMusic size={20} /> Queue · {queue.length}</button></div></div></div></div>}

      {playlistPickerTrack && <div className="frxe069-modal-backdrop" role="presentation" onClick={() => setPlaylistPickerTrack(null)}><div className="frxe-glass strong frxe069-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="frxe069-modal-head"><div><span className="frxe-kicker">ADD TO PLAYLIST</span><h3>{playlistPickerTrack.title}</h3></div><button className="frxe-icon-button small" aria-label="Close add to playlist" onClick={() => setPlaylistPickerTrack(null)}><X size={17} /></button></div>{manualPlaylists.map((playlist) => <button key={playlist.id} className="frxe069-picker-row" onClick={() => addToPlaylist(playlist.id, playlistPickerTrack)}><ListMusic size={18} /><span><strong>{playlist.name}</strong><small>{playlist.tracks.length} songs</small></span></button>)}<div className="frxe069-create-row"><input aria-label="Create new playlist" value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} placeholder="Create new playlist" /><button onClick={() => { const name = playlistName.trim(); if (!name) return; const id = globalThis.crypto?.randomUUID?.() || `playlist-${Date.now()}`; setManualPlaylists((items) => addTrackToPlaylist(createManualPlaylist(items, name, { now: Date.now(), id }), id, playlistPickerTrack, Date.now()) as ManualPlaylist[]); setPlaylistName(''); setPlaylistPickerTrack(null); }} disabled={!playlistName.trim()}><Plus size={16} /> Create & add</button></div>{!manualPlaylists.length && <p className="frxe069-muted">No playlists yet. Create one below.</p>}</div></div>}
    </div>
  );
}

function TrackRow({ track, current, playing, saved, onPlay, onSave, onAdd }: { track: Track; current: Track | null; playing: boolean; saved: boolean; onPlay: () => void; onSave: () => void; onAdd: () => void }) {
  return <div className={current?.id === track.id ? 'frxe-glass frxe-result active' : 'frxe-glass frxe-result'}><button className="frxe-result-play" aria-label={`Play ${track.title}`} onClick={onPlay}>{current?.id === track.id && playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button><button className="frxe-result-main" onClick={onPlay}>{track.thumbnail ? <img src={track.thumbnail} alt="" loading="lazy" /> : <span className="frxe069-thumb"><Music2 size={20} /></span>}<span><strong className="frxe-result-title">{track.title}</strong><small>{track.artist}</small></span></button><span className="frxe-result-badge">{track.official ? 'Official' : track.duration || 'Music'}</span><button className="frxe-save-button" aria-label="Add to playlist" title="Add to playlist" onClick={onAdd}><Plus size={17} /></button><button className={saved ? 'frxe-save-button saved' : 'frxe-save-button'} aria-label={saved ? 'Remove from Library' : 'Save to Library'} onClick={onSave}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button></div>;
}

function TrackRail({ title, subtitle, tracks, onPlay, onAdd, empty }: { title: string; subtitle?: string; tracks: Track[]; onPlay: (track: Track) => void; onAdd?: (track: Track) => void; empty?: string }) {
  return <section className="frxe069-section frxe-recommendation-row"><div className="frxe069-section-title"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div><span>{tracks.length ? `${tracks.length} tracks` : ''}</span></div>{tracks.length ? <div className="frxe069-track-rail">{tracks.map((track) => <article key={track.id} className="frxe-glass frxe069-track-card"><button className="frxe069-cover" onClick={() => onPlay(track)}>{track.thumbnail ? <img src={track.thumbnail} alt="" loading="lazy" /> : <Music2 size={32} />}<span className="frxe069-play"><Play size={18} fill="currentColor" /></span></button><div className="frxe069-track-meta"><button onClick={() => onPlay(track)}><strong>{track.title}</strong><small>{track.artist}</small></button>{onAdd && <button aria-label="Add to playlist" title="Add to playlist" onClick={() => onAdd(track)}><Plus size={16} /></button>}</div></article>)}</div> : <p className="frxe069-muted">{empty || 'Nothing here yet.'}</p>}</section>;
}

function PlaylistShelf({ title, playlists, onPlay }: { title?: string; playlists: GeneratedPlaylist[]; onPlay: (tracks: Track[], shuffled?: boolean) => void }) {
  return <section className="frxe069-section">{title && <h3>{title}</h3>}<div className="frxe069-playlist-grid">{playlists.map((playlist) => <div key={playlist.id} className="frxe-glass frxe069-playlist-card"><div className="frxe069-generated-art"><ListMusic size={30} /></div><div><strong>{playlist.name}</strong><p>{playlist.subtitle}</p><small>{playlist.tracks.length} songs · VITR-generated</small></div><div className="frxe069-actions"><button onClick={() => onPlay(playlist.tracks)}><Play size={15} /> Play</button><button onClick={() => onPlay(playlist.tracks, true)}><Shuffle size={15} /> Shuffle</button></div></div>)}</div></section>;
}

function PlaylistCard({ playlist, onOpen, onPlay, onShuffle }: { playlist: ManualPlaylist; onOpen: () => void; onPlay: () => void; onShuffle: () => void }) {
  return <div className="frxe-glass frxe069-playlist-card"><button className="frxe069-playlist-open" onClick={onOpen}><div className="frxe069-generated-art"><ListMusic size={28} /></div><span><strong>{playlist.name}</strong><small>{playlist.tracks.length} songs</small></span></button><div className="frxe069-actions"><button onClick={onPlay}><Play size={15} /> Play All</button><button onClick={onShuffle}><Shuffle size={15} /> Shuffle</button></div></div>;
}

function EmptyState({ onSearch }: { onSearch: () => void }) {
  return <div className="frxe-glass strong frxe-empty-home"><Music2 size={34} /><h2>Build your sound</h2><p>Start searching and playing music. VITR will mix artists, genres, favorites and new discoveries here.</p><button className="frxe-primary" onClick={onSearch}><SearchIcon size={17} /> Search music</button></div>;
}
