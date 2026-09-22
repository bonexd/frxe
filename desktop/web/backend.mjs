import { dedupeTracks } from './core.mjs';

const DISCOVERY_TERMS = [
  ['Pop', 'genre'], ['Hip-hop', 'genre'], ['R&B', 'genre'], ['Rock', 'genre'],
  ['Electronic', 'genre'], ['Indie', 'genre'], ['Jazz', 'genre'], ['Classical', 'genre'],
  ['Metal', 'genre'], ['Afrobeats', 'genre'], ['Latin', 'genre'], ['Country', 'genre'],
  ['Reggae', 'genre'], ['K-pop', 'genre'], ['Ambient', 'genre'], ['Lo-fi', 'genre'],
  ['Chill', 'mood'], ['Workout', 'mood'], ['Focus', 'mood'], ['Party', 'mood'],
  ['Sleep', 'mood'], ['Romance', 'mood'], ['Energy', 'mood'],
];

function normalizeCatalogItem(item, fallbackType = 'item', source = 'youtube_music') {
  if (!item?.title) return null;
  const entityType = String(item?.metadata?.entityType || item?.kind || fallbackType).toLowerCase();
  const title = String(item.title).trim();
  const searchQuery = String(
    item?.metadata?.searchQuery ||
    (entityType === 'album' ? `${title} album` :
      entityType === 'playlist' ? `${title} playlist` :
      entityType === 'genre' ? `${title} music` :
      title)
  ).trim();

  return {
    ...item,
    kind: entityType,
    metadata: {
      entityType,
      source: String(item?.metadata?.source || source),
      browseId: item?.metadata?.browseId || item?.id || null,
      searchQuery,
      confidence: Number(item?.metadata?.confidence ?? 0.7),
    },
  };
}

function discoverySuggestions(query) {
  const clean = String(query || '').trim().toLowerCase();
  if (!clean) return [];
  return DISCOVERY_TERMS
    .filter(([title]) => title.toLowerCase().includes(clean) || clean.includes(title.toLowerCase()))
    .slice(0, 6)
    .map(([title, kind]) => normalizeCatalogItem({
      id: `suggested:${kind}:${title.toLowerCase()}`,
      kind: 'genre',
      title,
      subtitle: kind === 'mood' ? 'Mood' : 'Genre',
      cover: null,
      metadata: {
        entityType: 'genre',
        source: 'vitr_discovery',
        browseId: null,
        searchQuery: `${title} music`,
        confidence: 0.72,
      },
    }, 'genre', 'vitr_discovery'));
}

function dedupeCatalogItems(groups) {
  const seen = new Set();
  const output = [];
  for (const raw of groups.flat()) {
    const item = normalizeCatalogItem(raw);
    if (!item?.title) continue;
    const key = `${item.metadata.entityType}:${item.id || item.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function trackDerivedArtists(tracks) {
  const seen = new Set();
  const output = [];
  for (const track of tracks || []) {
    const title = String(track?.artist || '').trim();
    if (!title || /^unknown artist$/i.test(title)) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalizeCatalogItem({
      id: `artist:derived:${encodeURIComponent(key)}`,
      kind: 'artist',
      title,
      subtitle: 'Artist',
      cover: track?.cover || track?.artworkUrl || track?.thumbnail || null,
      metadata: {
        entityType: 'artist',
        source: 'track_metadata',
        browseId: null,
        searchQuery: title,
        confidence: 0.68,
      },
    }, 'artist', 'track_metadata'));
  }
  return output;
}

function groupedCatalog(items) {
  const catalog = { artists: [], albums: [], playlists: [], genres: [] };
  for (const item of items || []) {
    const type = item?.metadata?.entityType;
    if (type === 'artist') catalog.artists.push(item);
    else if (type === 'album') catalog.albums.push(item);
    else if (type === 'playlist') catalog.playlists.push(item);
    else if (type === 'genre') catalog.genres.push(item);
  }
  return catalog;
}

export function createBackend({ invoke, listen = null, convertFileSrc = (path) => path }) {
  if (typeof invoke !== 'function') throw new TypeError('vitr backend requires an invoke function');

  const trySearch = async (command, payload) => {
    try {
      const result = await invoke(command, payload);
      return { ok: true, results: Array.isArray(result) ? result : [] };
    } catch (error) {
      return { ok: false, error };
    }
  };

  const tryCatalog = async (payload) => {
    try {
      const result = await invoke('innertube_catalog_search', payload);
      return {
        ok: true,
        catalog: {
          tracks: Array.isArray(result?.tracks) ? result.tracks : [],
          items: Array.isArray(result?.items) ? result.items : [],
          artists: Array.isArray(result?.artists) ? result.artists : [],
          albums: Array.isArray(result?.albums) ? result.albums : [],
          playlists: Array.isArray(result?.playlists) ? result.playlists : [],
          genres: Array.isArray(result?.genres) ? result.genres : [],
        },
      };
    } catch (error) {
      return { ok: false, error, catalog: { tracks: [], items: [], artists: [], albums: [], playlists: [], genres: [] } };
    }
  };

  return {
    async search(query) {
      const clean = String(query || '').trim();
      if (!clean) return [];
      const providerQuery = /\b(song|music|audio|lyrics?|official|album|artist|playlist|remix|instrumental|soundtrack|single)\b/i.test(clean)
        ? clean
        : `${clean} song`;
      const attempts = await Promise.all([
        trySearch('innertube_search', { query: providerQuery, client: 'music' }),
        trySearch('innertube_search', { query: providerQuery, client: 'web' }),
        trySearch('ytdlp_search', { query: providerQuery }),
      ]);
      const successful = attempts.filter((attempt) => attempt.ok);
      if (!successful.length) {
        throw new Error('Search providers are temporarily unavailable. Try again.');
      }
      return dedupeTracks(successful.map((attempt) => attempt.results));
    },

    async discover(query, preferredType = 'all') {
      const clean = String(query || '').trim();
      if (!clean) return { tracks: [], items: [], artists: [], albums: [], playlists: [], genres: [] };
      const type = String(preferredType || 'all').toLowerCase();
      const suffix =
        type === 'artist' ? 'artist' :
        type === 'album' ? 'album' :
        type === 'playlist' ? 'playlist' :
        type === 'genre' ? 'genre' :
        type === 'track' ? 'song' :
        'music';
      const providerQuery = /\b(song|music|audio|lyrics?|official|album|artist|playlist|remix|instrumental|soundtrack|single|genre|mood)\b/i.test(clean)
        ? clean
        : `${clean} ${suffix}`;
      const [musicCatalog, webAttempt, ytdlpAttempt] = await Promise.all([
        tryCatalog({ query: providerQuery }),
        trySearch('innertube_search', { query: providerQuery, client: 'web' }),
        trySearch('ytdlp_search', { query: providerQuery }),
      ]);
      if (!musicCatalog.ok && !webAttempt.ok && !ytdlpAttempt.ok) {
        throw new Error('Search providers are temporarily unavailable. Try again.');
      }
      const tracks = dedupeTracks([
        musicCatalog.catalog.tracks,
        webAttempt.results || [],
        ytdlpAttempt.results || [],
      ]);
      const providerItems = dedupeCatalogItems([
        musicCatalog.catalog.items || [],
        musicCatalog.catalog.artists || [],
        musicCatalog.catalog.albums || [],
        musicCatalog.catalog.playlists || [],
        musicCatalog.catalog.genres || [],
      ]);
      const items = dedupeCatalogItems([
        providerItems,
        trackDerivedArtists(tracks),
        discoverySuggestions(clean),
      ]);
      const grouped = groupedCatalog(items);
      return {
        tracks,
        items,
        artists: grouped.artists,
        albums: grouped.albums,
        playlists: grouped.playlists,
        genres: grouped.genres,
      };
    },

    async resolveTrack(track) {
      if (track?.kind === 'local' && track.path) {
        await invoke('authorize_media_path', { path: track.path });
        return convertFileSrc(track.path);
      }
      if (!track?.id) throw new Error('This track has no playable source.');
      return invoke('resolve_stream_url', { videoId: track.id });
    },

    defaultDownloadDir() {
      return invoke('default_download_dir');
    },

    chooseAudioDownloadDir() {
      return invoke('choose_audio_download_dir');
    },

    scanDownloads(dir) {
      return invoke('scan_downloads', { dir });
    },

    clearRemovedDownloads(downloadDir) {
      return invoke('clear_removed_downloads', { downloadDir });
    },

    downloadAlreadyExists(videoId, outputDir) {
      return invoke('download_already_exists', { videoId, outputDir });
    },

    startDownload({ taskId, track, outputDir, format, quality, allowPlaylist = false }) {
      if (!track?.id) throw new Error('This track cannot be downloaded.');
      return invoke('download_track', {
        taskId,
        url: `https://www.youtube.com/watch?v=${track.id}`,
        outputDir,
        format,
        quality,
        allowPlaylist,
      });
    },

    cancelDownload(taskId) {
      return invoke('cancel_download', { taskId });
    },

    removeDownload(path, downloadDir) {
      return invoke('remove_download', { path, downloadDir });
    },

    startDownloadSync(downloadDir) {
      return invoke('start_download_sync', { downloadDir });
    },

    downloadSyncStatus() {
      return invoke('download_sync_status');
    },

    syncDownloadsFromPeer(peerId, pairCode, outputDir) {
      return invoke('sync_downloads_from_peer', { peerId, pairCode, outputDir });
    },

    lyrics(track) {
      return invoke('fetch_metadata_lyrics', {
        title: track?.title || '',
        artist: track?.artist || '',
        album: track?.album || '',
        durationSeconds: Number(track?.durationSeconds || 0),
      });
    },

    currentRuntimeStatus() {
      return invoke('current_runtime_status');
    },

    updateRuntimeDependencies() {
      return invoke('update_runtime_dependencies');
    },

    checkClientUpdate() {
      return invoke('check_client_update');
    },

    openReleasePage(url) {
      return invoke('open_release_page', { url: url || null });
    },

    setMiniPlayerEnabled(enabled, layout = 'bar') {
      return invoke('set_mini_player_enabled', { enabled, layout });
    },

    setMiniPlayerLayout(layout = 'bar') {
      return invoke('set_mini_player_layout', { layout });
    },

    updateMiniPlayer(snapshot) {
      return invoke('update_mini_player', { snapshot });
    },

    setTrayEnabled(enabled) {
      return invoke('set_tray_enabled', { enabled });
    },

    updateMediaControls(snapshot) {
      return invoke('update_media_controls', { snapshot });
    },

    onDownloadProgress(handler) {
      if (typeof listen !== 'function') return Promise.resolve(() => {});
      return listen('download-progress', (event) => handler(event.payload));
    },
  };
}
