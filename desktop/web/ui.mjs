import { currentLyricIndex, formatClock, trackKey } from './core.mjs';
import { createPrimitives } from './ui-primitives.mjs';

export function createView({
  state,
  app,
  audio,
  ambient,
  toastHost,
  backend,
  convertFileSrc,
  trackRegistry,
  savePrefs,
  actions,
}) {
  const {
    escapeHtml,
    registerTracks,
    icon,
    artwork,
    isFavorite,
    toast,
    updateAmbient,
    trackRow,
    emptyState,
    renderSection,
  } = createPrimitives({ state, ambient, toastHost, convertFileSrc, trackRegistry });

  function homeTrackCard(track, badge = '') {
    if (!track) return '';
    const key = trackKey(track);
    registerTracks([track]);
    return `<button class="music-card glass-soft" data-action="play-track" data-track="${escapeHtml(key)}">
      ${artwork(track, 'music-card-art')}
      <span class="music-card-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist || 'Unknown artist')}</small>${badge ? `<em>${escapeHtml(badge)}</em>` : ''}</span>
      <span class="music-card-play">${icon('play', 16)}</span>
    </button>`;
  }

  function renderHome() {
    const recent = state.history.slice(0, 8);
    const favorites = state.favorites.slice(0, 8);
    const offline = state.offline.slice(0, 8);
    const madeForYou = [...favorites, ...recent, ...offline]
      .filter((track, index, list) => list.findIndex((item) => trackKey(item) === trackKey(track)) === index)
      .slice(0, 5);
    const heroTrack = state.current || recent[0] || favorites[0] || offline[0] || null;
    registerTracks([...recent, ...favorites, ...offline, ...(heroTrack ? [heroTrack] : [])]);

    return `<div class="screen home-screen">
      <header class="home-welcome">
        <div><span class="eyebrow">vitr / by blood</span><h1>${heroTrack ? 'Good to see you.' : 'Your music. Your space.'}</h1><p>${heroTrack ? 'Keep the music close.' : 'Search, play, save and shape vitr around you.'}</p></div>
        <div class="home-links"><a class="support-pill pill" href="https://github.com/bloodvitr/vitr" data-external="https://github.com/bloodvitr/vitr">Support</a><a class="support-pill pill" href="https://github.com/bloodvitr/vitr/releases" data-external="https://github.com/bloodvitr/vitr/releases">Releases</a><a class="support-pill pill ko-fi" href="https://ko-fi.com/bloodvitr" data-external="https://ko-fi.com/bloodvitr">Ko-fi</a></div>
      </header>

      <section class="dashboard-grid">
        <article class="featured-track glass">
          <div class="featured-art">${artwork(heroTrack, 'featured-cover')}</div>
          <div class="featured-copy">
            <span class="eyebrow">NOW PLAYING</span>
            <h2>${escapeHtml(heroTrack?.title || 'Find your next track')}</h2>
            <p>${escapeHtml(heroTrack?.artist || 'Search Vitr and start listening.')}</p>
            <div class="featured-actions">
              ${heroTrack
                ? `<button class="primary round-play" data-action="play-track" data-track="${escapeHtml(trackKey(heroTrack))}">${icon(state.playing ? 'pause' : 'play', 20)}</button><button class="icon-button ${isFavorite(heroTrack) ? 'active' : ''}" data-action="favorite" data-track="${escapeHtml(trackKey(heroTrack))}">${icon('heart', 18)}</button>`
                : `<button class="primary pill" data-tab="search">${icon('search', 17)} Find music</button>`}
            </div>
          </div>
        </article>

        <section class="dashboard-panel">
          <div class="section-title"><div><span>FOR YOU</span><h2>Made for you</h2></div></div>
          <div class="made-for-you-grid">
            ${madeForYou.length ? madeForYou.map((track, index) => homeTrackCard(track, index === 0 ? 'Vitr pick' : '')).join('') : '<div class="dashboard-empty">Play a few songs and Vitr will fill this space.</div>'}
          </div>
        </section>
      </section>

      <section class="dashboard-section">
        <div class="section-title"><div><span>RECENT</span><h2>Recently played</h2></div><button class="text-action" data-tab="library">View all</button></div>
        ${recent.length ? `<div class="music-card-grid">${recent.map((track) => homeTrackCard(track)).join('')}</div>` : emptyState('Nothing played yet', 'Your recently played music will show up here.')}
      </section>

      <section class="dashboard-section">
        <div class="section-title"><div><span>YOURS</span><h2>Your playlists</h2></div><button class="text-action" data-tab="library">Manage</button></div>
        ${state.playlists.length
          ? `<div class="playlist-showcase">${state.playlists.slice(0, 6).map((playlist) => {
              const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
              return `<button class="playlist-showcase-card glass-soft" data-action="open-playlist" data-playlist="${escapeHtml(playlist.id)}">${artwork(tracks[0] || null, 'playlist-showcase-art')}<span><strong>${escapeHtml(playlist.name)}</strong><small>${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}</small></span></button>`;
            }).join('')}</div>`
          : emptyState('No playlists yet', 'Create one in Library and it will appear here.')}
      </section>
    </div>`;
  }

  function catalogSearchQuery(item, kind) {
    const title = String(item?.title || '').trim();
    const subtitle = String(item?.subtitle || '').trim();
    if (kind === 'playlist') return `${title} playlist`;
    if (kind === 'album') return [title, subtitle].filter(Boolean).join(' ');
    if (kind === 'genre') return `${title} music`;
    return title;
  }

  function renderCatalogSection(title, items, kind) {
    if (!Array.isArray(items) || !items.length) return '';
    return `<section class="catalog-section">
      <div class="section-title"><div><span>${items.length} ${kind === 'genre' ? 'DISCOVERY' : kind.toUpperCase() + (items.length === 1 ? '' : 'S')}</span><h2>${escapeHtml(title)}</h2></div></div>
      <div class="catalog-grid">${items.slice(0, 12).map((item) => {
        const query = catalogSearchQuery(item, kind);
        const initial = escapeHtml(String(item.title || '?').slice(0, 1).toUpperCase());
        return `<button class="catalog-card glass-soft" data-search="${escapeHtml(query)}" aria-label="Search ${escapeHtml(item.title || title)}">
          <span class="catalog-cover ${kind === 'artist' ? 'round' : ''}">${item.cover
            ? `<img src="${escapeHtml(item.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
            : `<b>${initial}</b>`}</span>
          <span class="catalog-copy">
            <strong>${escapeHtml(item.title || 'Untitled')}</strong>
            <small>${escapeHtml(item.subtitle || (kind === 'genre' ? 'Genre & mood' : kind))}</small>
          </span>
        </button>`;
      }).join('')}</div>
    </section>`;
  }

  function renderSearch() {
    registerTracks(state.searchResults);
    const groups = state.searchGroups || { artists: [], albums: [], playlists: [], genres: [] };
    const entityCount = groups.artists.length + groups.albums.length + groups.playlists.length + groups.genres.length;
    const hasResults = state.searchResults.length || entityCount;
    return `<div class="screen search-screen">
      <div class="screen-heading"><span class="eyebrow">DISCOVER</span><h1>Search</h1><p>Find songs, artists, albums, playlists, genres and moods through vitr.</p></div>
      <form id="search-form" class="search-box glass" autocomplete="off">
        ${icon('search', 22)}
        <input id="search-input" value="${escapeHtml(state.searchQuery)}" placeholder="Songs, artists, albums, playlists, genres…" aria-label="Search music" />
        ${state.searchQuery ? `<button type="button" class="icon-button" data-action="clear-search" aria-label="Clear search">${icon('x', 18)}</button>` : ''}
      </form>
      ${state.searchLoading ? `<div class="loading-line"><i></i><span>Searching YouTube Music and playback sources…</span></div>` : ''}
      ${state.searchError ? `<div class="inline-error glass-soft">${escapeHtml(state.searchError)} <button data-action="retry-search">Retry</button></div>` : ''}
      ${!state.searchLoading && state.searchQuery ? `
        ${renderCatalogSection('Artists', groups.artists, 'artist')}
        ${renderCatalogSection('Albums & singles', groups.albums, 'album')}
        ${renderCatalogSection('Playlists', groups.playlists, 'playlist')}
        ${renderCatalogSection('Genres & moods', groups.genres, 'genre')}
        ${state.searchResults.length
          ? renderSection('Songs', state.searchResults, { eyebrow: `${state.searchResults.length} TRACKS` })
          : (!hasResults ? emptyState('No results', 'Try a different title, artist, album, playlist or genre.') : '')}
      ` : (!state.searchQuery ? `<div class="search-suggestions">
              <button class="suggestion glass-soft" data-search="late night r&b">Late night R&B</button>
              <button class="suggestion glass-soft" data-search="new hip hop">New hip-hop</button>
              <button class="suggestion glass-soft" data-search="indie chill">Indie chill</button>
              <button class="suggestion glass-soft" data-search="electronic mix">Electronic mix</button>
              <button class="suggestion glass-soft" data-search="rock">Rock</button>
              <button class="suggestion glass-soft" data-search="workout">Workout</button>
            </div>` : '')}
    </div>`;
  }

  function renderSave() {
    registerTracks(state.offline);
    return `<div class="screen save-screen">
      <div class="screen-heading"><span class="eyebrow">OFFLINE</span><h1>Save</h1><p>Downloads use vitr's native media pipeline.</p></div>
      <section class="content-section">
        <div class="section-title"><div><span>ACTIVE</span><h2>Downloads</h2></div></div>
        ${state.downloads.length ? `<div class="download-list">${state.downloads.map((task) => `<div class="download-row glass-soft">
          ${artwork(task.track, 'track-art')}
          <div class="download-copy">
            <strong>${escapeHtml(task.itemTitle || task.track.title)}</strong>
            <small>${escapeHtml(task.status)}${task.speed ? ` · ${escapeHtml(task.speed)}` : ''}${task.eta ? ` · ETA ${escapeHtml(task.eta)}` : ''}</small>
            <div class="progress-rail"><i style="width:${Math.max(0, Math.min(100, task.progress || 0))}%"></i></div>
            ${task.error ? `<em>${escapeHtml(task.error)}</em>` : ''}
          </div>
          <span>${Math.round(task.progress || 0)}%</span>
          ${task.status === 'failed'
            ? `<button class="icon-button" data-action="retry-download" data-task="${escapeHtml(task.id)}">↻</button>`
            : `<button class="icon-button" data-action="cancel-download" data-task="${escapeHtml(task.id)}">${icon('x', 18)}</button>`}
        </div>`).join('')}</div>` : emptyState('No active downloads', 'Save a track from Search, Home or Now Playing.')}
      </section>
      <section class="content-section">
        <div class="section-title"><div><span>${state.offline.length} OFFLINE</span><h2>Downloaded music</h2></div></div>
        ${state.offline.length ? `<div class="track-list">${state.offline.map((track) => `<div class="playlist-track-wrap">${trackRow(track, { showDownload: false })}<button class="icon-button danger playlist-remove" data-action="remove-download" data-track="${escapeHtml(trackKey(track))}" aria-label="Remove downloaded file ${escapeHtml(track.title)}">${icon('trash', 17)}</button></div>`).join('')}</div>` : emptyState('Nothing downloaded', 'Saved tracks will appear here automatically.')}
      </section>
    </div>`;
  }

  function renderPlaylistDetail(playlist) {
    const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    registerTracks(tracks);
    return `<div class="screen library-screen playlist-detail">
      <div class="playlist-detail-head">
        <button class="secondary pill" data-action="back-playlists">${icon('prev', 17)} All playlists</button>
        <div class="playlist-detail-copy"><span class="eyebrow">PLAYLIST</span><h1>${escapeHtml(playlist.name)}</h1><p>${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'} · stored locally on this device.</p></div>
        <div class="playlist-detail-actions">
          <button class="primary pill" data-action="play-playlist" data-playlist="${escapeHtml(playlist.id)}" ${tracks.length ? '' : 'disabled'}>${icon('play', 17)} Play</button>
          <button class="icon-button danger" data-action="delete-playlist" data-playlist="${escapeHtml(playlist.id)}" aria-label="Delete playlist">${icon('trash', 18)}</button>
        </div>
      </div>
      <section class="content-section">
        <div class="section-title"><div><span>${tracks.length} TRACKS</span><h2>Playlist tracks</h2></div></div>
        ${tracks.length ? `<div class="playlist-track-list">${tracks.map((track, index) => `<div class="playlist-track-wrap">${trackRow(track, { index, showDownload: false })}<button class="icon-button playlist-remove" data-action="remove-from-playlist" data-playlist="${escapeHtml(playlist.id)}" data-track="${escapeHtml(trackKey(track))}" aria-label="Remove ${escapeHtml(track.title)} from playlist">${icon('x', 17)}</button></div>`).join('')}</div>` : emptyState('This playlist is empty', 'Add tracks from Search, Home, Library or Now Playing.')}
      </section>
    </div>`;
  }

  function renderLibrary() {
    const activePlaylist = state.playlists.find((playlist) => playlist?.id === state.activePlaylistId);
    if (activePlaylist) return renderPlaylistDetail(activePlaylist);

    const favoriteKeys = new Set(state.favorites.map(trackKey));
    const combined = [...state.favorites, ...state.offline.filter((track) => !favoriteKeys.has(trackKey(track)))];
    return `<div class="screen library-screen">
      <div class="screen-heading"><span class="eyebrow">COLLECTION</span><h1>Library</h1><p>Favorites, downloads and your local playlists in one place.</p></div>
      <div class="library-stats">
        <div class="stat glass-soft"><b>${state.favorites.length}</b><span>Favorites</span></div>
        <div class="stat glass-soft"><b>${state.offline.length}</b><span>Offline</span></div>
        <div class="stat glass-soft"><b>${state.playlists.length}</b><span>Playlists</span></div>
        <div class="stat glass-soft"><b>${state.history.length}</b><span>Recent</span></div>
      </div>
      <section class="content-section playlist-section">
        <div class="section-title"><div><span>LOCAL</span><h2>Playlists</h2></div></div>
        <form id="playlist-create-form" class="playlist-create glass-soft" autocomplete="off">
          <input id="playlist-name" maxlength="80" placeholder="New playlist name" aria-label="New playlist name" />
          <button class="primary pill" type="submit">${icon('plus', 17)} Create playlist</button>
        </form>
        ${state.playlists.length ? `<div class="playlist-grid">${state.playlists.map((playlist) => {
          const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
          return `<article class="playlist-card glass-soft">
            <button class="playlist-card-main" data-action="open-playlist" data-playlist="${escapeHtml(playlist.id)}">
              ${artwork(tracks[0] || { title: playlist.name }, 'playlist-art')}
              <span><strong>${escapeHtml(playlist.name)}</strong><small>${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}</small></span>
            </button>
            <div class="playlist-card-actions">
              <button class="icon-button" data-action="play-playlist" data-playlist="${escapeHtml(playlist.id)}" aria-label="Play ${escapeHtml(playlist.name)}" ${tracks.length ? '' : 'disabled'}>${icon('play', 17)}</button>
              <button class="icon-button danger" data-action="delete-playlist" data-playlist="${escapeHtml(playlist.id)}" aria-label="Delete ${escapeHtml(playlist.name)}">${icon('trash', 17)}</button>
            </div>
          </article>`;
        }).join('')}</div>` : emptyState('No playlists yet', 'Create a playlist, then add tracks from anywhere in vitr.')}
      </section>
      <section class="content-section history-section">
        <div class="section-title"><div><span>${state.history.length} RECENT</span><h2>Recently played</h2></div>${state.history.length ? '<button class="secondary pill" data-action="clear-history">Clear history</button>' : ''}</div>
        ${state.history.length ? `<div class="track-list">${state.history.slice(0, 50).map((track, index) => `<div class="playlist-track-wrap">${trackRow(track, { index, showDownload: false })}<button class="icon-button playlist-remove" data-action="remove-history" data-track="${escapeHtml(trackKey(track))}" aria-label="Remove ${escapeHtml(track.title)} from history">${icon('x', 17)}</button></div>`).join('')}</div>` : emptyState('No listening history', 'Tracks you play will appear here.')}
      </section>
      ${renderSection('Your music', combined, { eyebrow: `${combined.length} TRACKS`, emptyTitle: 'Your library is empty', emptyBody: 'Heart a song or download it to start building your library.' })}
    </div>`;
  }

  function renderSettings() {
    const status = state.runtimeStatus;
    return `<div class="screen settings-screen">
      <div class="screen-heading settings-heading"><span class="eyebrow">vitr / by blood</span><h1>Settings</h1><p>Shape how Vitr looks, sounds and behaves.</p></div>
      <div class="settings-stack">
        <section class="settings-card glass appearance-card">
          <div class="setting-head"><div><span>APPEARANCE</span><h2>Choose your Vitr</h2></div>${icon('settings', 22)}</div>
          <div class="appearance-presets">
            <label class="appearance-option ${state.prefs.liquidGlass === false ? 'selected' : ''}">
              <input type="radio" name="appearance-mode" value="dark" ${state.prefs.liquidGlass === false ? 'checked' : ''}/>
              <span class="appearance-preview dark-preview"><i></i><b></b><em></em></span>
              <span><b>Modern Dark</b><small>Crisp, deep and fast.</small></span>
            </label>
            <label class="appearance-option ${state.prefs.liquidGlass !== false ? 'selected' : ''}">
              <input type="radio" name="appearance-mode" value="glass" ${state.prefs.liquidGlass !== false ? 'checked' : ''}/>
              <span class="appearance-preview glass-preview"><i></i><b></b><em></em></span>
              <span><b>Liquid Glass</b><small>Blur, depth and flowing artwork.</small></span>
            </label>
          </div>
          <label class="toggle-row"><span><b>Reduced motion</b><small>Reduce ambient movement and animated transitions.</small></span><input id="motion-toggle" type="checkbox" ${state.prefs.reducedMotion ? 'checked' : ''}/><i></i></label>
        </section>

        <section class="settings-card glass">
          <div class="setting-head"><div><span>GENERAL</span><h2>Desktop</h2></div>${icon('settings', 22)}</div>
          <label class="toggle-row"><span><b>System tray</b><small>Keep Vitr available from the system tray.</small></span><input id="tray-toggle" type="checkbox" ${state.prefs.trayEnabled !== false ? 'checked' : ''}/><i></i></label>
          <label class="toggle-row"><span><b>Floating mini player</b><small>Show the mini player while music is playing. It never opens on app startup.</small></span><input id="floating-mini-toggle" type="checkbox" ${state.prefs.floatingMiniPlayer ? 'checked' : ''}/><i></i></label>
          <label class="field mini-layout-field"><span>Mini player shape</span><select id="mini-layout-select">
            <option value="bar" ${state.prefs.miniPlayerLayout !== 'square' ? 'selected' : ''}>Compact bar</option>
            <option value="square" ${state.prefs.miniPlayerLayout === 'square' ? 'selected' : ''}>Square (1:1)</option>
          </select></label>
          <label class="toggle-row"><span><b>Automatic updates</b><small>Check, download and install signed Vitr updates automatically.</small></span><input id="update-toggle" type="checkbox" ${state.prefs.autoUpdate !== false ? 'checked' : ''}/><i></i></label>
          <button class="secondary pill" data-action="check-app-update" ${state.updateLoading ? 'disabled' : ''}>${state.updateLoading ? 'Checking for updates…' : 'Check for updates'}</button>
        </section>

        <section class="settings-card glass">
          <div class="setting-head"><div><span>AUDIO</span><h2>Downloads</h2></div>${icon('download', 22)}</div>
          <label class="field"><span>Music folder</span><input id="download-dir" value="${escapeHtml(state.prefs.downloadDir)}" placeholder="C:\\Users\\you\\Music" /></label>
          <div class="field-row">
            <label class="field"><span>Format</span><select id="format-select">
              <option value="m4a" ${state.prefs.format === 'm4a' ? 'selected' : ''}>M4A</option>
              <option value="mp3" ${state.prefs.format === 'mp3' ? 'selected' : ''}>MP3</option>
              <option value="flac" ${state.prefs.format === 'flac' ? 'selected' : ''}>FLAC</option>
              <option value="wav" ${state.prefs.format === 'wav' ? 'selected' : ''}>WAV</option>
            </select></label>
            <label class="field"><span>Quality</span><select id="quality-select">
              <option value="best" ${state.prefs.quality === 'best' ? 'selected' : ''}>Best</option>
              <option value="high" ${state.prefs.quality === 'high' ? 'selected' : ''}>High</option>
              <option value="balanced" ${state.prefs.quality === 'balanced' ? 'selected' : ''}>Balanced</option>
            </select></label>
          </div>
        </section>

        <section class="settings-card glass runtime-card">
          <div class="setting-head"><div><span>ADVANCED</span><h2>Vitr runtime</h2></div><span class="backend-badge">NATIVE</span></div>
          <p>Vitr manages yt-dlp and detects Deno and FFmpeg from your system.</p>
          ${status ? `<div class="runtime-list"><span>yt-dlp <b>${escapeHtml(status.ytDlpVersion || 'unknown')}</b></span><span>Deno <b>${escapeHtml(status.denoVersion || 'unknown')}</b></span><span>FFmpeg <b>${escapeHtml(status.ffmpegVersion || 'unknown')}</b></span></div>` : ''}
          <button class="primary pill" data-action="update-runtime" ${state.runtimeLoading ? 'disabled' : ''}>${state.runtimeLoading ? 'Updating yt-dlp…' : 'Update yt-dlp'}</button>
        </section>

        <section class="settings-card glass about-card">
          <img class="brand-mark large" src="./vitr-icon.png" alt="" aria-hidden="true" draggable="false" />
          <div><span>ABOUT</span><h2>vitr 0.1.0</h2><p>Made with ♥ by blood.</p><div class="support-links"><a class="support-pill pill" href="https://github.com/bloodvitr" data-external="https://github.com/bloodvitr">Blood · GitHub · github.com/bloodvitr</a><a class="support-pill pill ko-fi" href="https://ko-fi.com/bloodvitr" data-external="https://ko-fi.com/bloodvitr">Blood · Ko-fi · ko-fi.com/bloodvitr</a><a class="support-pill pill" href="https://github.com/bloodvitr/vitr/releases" data-external="https://github.com/bloodvitr/vitr/releases">Releases</a></div></div>
        </section>

        <section class="settings-card glass reset-card">
          <div class="setting-head"><div><span>RESET</span><h2>Reset Vitr app</h2></div>${icon('trash', 22)}</div>
          <p>Clear favorites, history, playlists, preferences and saved playback. Downloaded music stays on disk.</p>
          <button class="secondary pill reset-button" data-action="reset-app">Reset Vitr app</button>
        </section>
      </div>
    </div>`;
  }

  function navItem(tab, iconName, label) {
    const selected = state.tab === tab && !state.playerOpen;
    return `<button class="nav-item ${selected ? 'selected' : ''}" data-tab="${tab}" aria-label="${label}" aria-current="${selected ? 'page' : 'false'}">${icon(iconName, 21)}<span>${label}</span></button>`;
  }

  function sidebar() {
    const recent = state.history.slice(0, 4);
    registerTracks(recent);
    return `<aside class="desktop-sidebar glass-lite">
      <div class="sidebar-brand"><img src="./vitr-icon.png" alt="" draggable="false"/><div><strong>vitr</strong><small>by blood</small></div></div>
      <nav class="sidebar-nav" aria-label="Primary navigation">
        ${navItem('home', 'home', 'Home')}
        ${navItem('search', 'search', 'Search')}
        ${navItem('library', 'library', 'Library')}
        ${navItem('save', 'save', 'Downloads')}
        ${navItem('settings', 'settings', 'Settings')}
      </nav>
      <div class="sidebar-section">
        <span>RECENTLY PLAYED</span>
        <div class="sidebar-recent">${recent.length ? recent.map((track) => `<button data-action="play-track" data-track="${escapeHtml(trackKey(track))}">${artwork(track, 'sidebar-art')}<span><b>${escapeHtml(track.title)}</b><small>${escapeHtml(track.artist || '')}</small></span></button>`).join('') : '<small class="sidebar-empty">Your recent tracks will appear here.</small>'}</div>
      </div>
      <div class="sidebar-footer"><span>vitr 0.1.0</span><span>by blood</span></div>
    </aside>`;
  }

  function miniPlayer() {
    if (!state.current || state.playerOpen) return '';
    const track = state.current;
    registerTracks([track]);
    return `<div class="mini-player glass">
      <button class="mini-main" data-action="open-player">${artwork(track, 'mini-art')}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist || 'Unknown artist')}</small></span></button>
      <div class="mini-actions">
        <button class="icon-button ${isFavorite(track) ? 'active' : ''}" data-action="favorite" data-track="${escapeHtml(trackKey(track))}">${icon('heart', 18)}</button>
        <button class="icon-button" data-action="playlist-picker" data-track="${escapeHtml(trackKey(track))}" aria-label="Add to playlist">${icon('plus', 18)}</button>
        ${track.kind === 'youtube' ? `<button class="icon-button" data-action="download" data-track="${escapeHtml(trackKey(track))}">${icon('download', 18)}</button>` : ''}
        <button class="play-button small" data-action="toggle-play" aria-label="${state.playing ? 'Pause' : 'Play'}">${icon(state.playing ? 'pause' : 'play', 20)}</button>
      </div>
      <div class="mini-progress"><i style="width:${audio.duration ? (audio.currentTime / audio.duration) * 100 : 0}%"></i></div>
    </div>`;
  }

  function renderPlayer() {
    const track = state.current;
    if (!track) {
      state.playerOpen = false;
      return renderHome();
    }

    registerTracks(state.queue);
    const lyricIndex = currentLyricIndex(state.lyrics, audio.currentTime || 0);

    return `<div class="player-screen screen">
      <button class="player-close glass-soft" data-action="close-player" aria-label="Back">${icon('x', 20)}</button>
      <div class="player-layout">
        <section class="player-main glass">
          <div class="player-art-wrap">${artwork(track, 'player-art')}<div class="player-halo"></div></div>
          <div class="player-copy"><span>${escapeHtml(track.album || track.source || 'Now Playing')}</span><h1>${escapeHtml(track.title)}</h1><p>${escapeHtml(track.artist || 'Unknown artist')}</p></div>
          <div class="seek-wrap">
            <input id="seek" class="seek" type="range" min="0" max="${Math.max(1, audio.duration || track.durationSeconds || 1)}" step="0.1" value="${Math.min(audio.currentTime || 0, audio.duration || track.durationSeconds || 1)}"/>
            <div><span id="position-label">${formatClock(audio.currentTime || 0)}</span><span id="duration-label">${formatClock(audio.duration || track.durationSeconds || 0)}</span></div>
          </div>
          <div class="transport">
            <button class="icon-button ${state.prefs.shuffle ? 'active' : ''}" data-action="shuffle" aria-label="Shuffle">${icon('shuffle', 20)}</button>
            <button class="transport-skip" data-action="previous">${icon('prev', 25)}</button>
            <button class="play-button" data-action="toggle-play">${state.resolving ? '<span class="spinner"></span>' : icon(state.playing ? 'pause' : 'play', 28)}</button>
            <button class="transport-skip" data-action="next">${icon('next', 25)}</button>
            <button class="icon-button ${state.prefs.repeat !== 'off' ? 'active' : ''}" data-action="repeat" aria-label="Repeat">${icon('repeat', 20)}${state.prefs.repeat === 'track' ? '<b class="repeat-one">1</b>' : ''}</button>
          </div>
          <div class="player-secondary">
            <button class="icon-button ${isFavorite(track) ? 'active' : ''}" data-action="favorite" data-track="${escapeHtml(trackKey(track))}">${icon('heart', 20)}</button>
            <button class="icon-button" data-action="playlist-picker" data-track="${escapeHtml(trackKey(track))}" aria-label="Add to playlist">${icon('plus', 20)}</button>
            ${track.kind === 'youtube' ? `<button class="icon-button" data-action="download" data-track="${escapeHtml(trackKey(track))}">${icon('download', 20)}</button>` : ''}
            <div class="volume">${icon('queue', 18)}<input id="volume" type="range" min="0" max="1" step="0.01" value="${state.prefs.muted ? 0 : state.prefs.volume}" aria-label="Volume"/></div>
          </div>
        </section>

        <aside class="player-side glass">
          <div class="side-tabs"><button class="active">${icon('lyrics', 17)} Lyrics</button><button>${icon('queue', 17)} Queue</button></div>
          <div class="lyrics-panel">
            ${state.lyricsLoading
              ? '<div class="lyrics-loading">Finding lyrics…</div>'
              : state.lyrics.length
                ? state.lyrics.map((line, index) => `<p class="lyric-line ${index === lyricIndex ? 'active' : ''}" data-lyric-time="${line.time}">${escapeHtml(line.text || '♪')}</p>`).join('')
                : state.plainLyrics
                  ? `<p class="plain-lyrics">${escapeHtml(state.plainLyrics)}</p>`
                  : '<p class="lyrics-empty">Lyrics will appear here when available.</p>'}
          </div>
          <div class="queue-panel"><h3>Up next</h3>${state.queue.map((item, index) => `<button class="queue-item ${index === state.queueIndex ? 'active' : ''}" data-action="queue-play" data-index="${index}">${artwork(item, 'queue-art')}<span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.artist || '')}</small></span></button>`).join('')}</div>
        </aside>
      </div>
    </div>`;
  }

  function renderPlaylistPicker() {
    if (!state.playlistPickerTrackKey) return '';
    const track = trackRegistry.get(state.playlistPickerTrackKey) || (trackKey(state.current) === state.playlistPickerTrackKey ? state.current : null);
    return `<div class="playlist-picker-overlay" role="dialog" aria-modal="true" aria-label="Add to playlist">
      <button class="playlist-picker-backdrop" data-action="close-playlist-picker" aria-label="Close playlist picker"></button>
      <section class="playlist-picker-panel glass">
        <div class="playlist-picker-head"><div><span class="eyebrow">ADD TO PLAYLIST</span><h2>${escapeHtml(track?.title || 'Track')}</h2></div><button class="icon-button" data-action="close-playlist-picker" aria-label="Close">${icon('x', 18)}</button></div>
        ${state.playlists.length ? `<div class="playlist-picker-list">${state.playlists.map((playlist) => {
          const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
          const alreadyAdded = track ? tracks.some((item) => trackKey(item) === trackKey(track)) : false;
          return `<button class="playlist-picker-item" data-action="add-to-playlist" data-playlist="${escapeHtml(playlist.id)}" ${alreadyAdded ? 'disabled' : ''}><span>${escapeHtml(playlist.name)}</span><small>${alreadyAdded ? 'Already added' : `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`}</small>${icon(alreadyAdded ? 'heart' : 'plus', 17)}</button>`;
        }).join('')}</div>` : `<div class="playlist-picker-empty">Create a playlist in Library first.</div>`}
      </section>
    </div>`;
  }

  function render() {
    trackRegistry.clear();
    const content = state.playerOpen
      ? renderPlayer()
      : state.tab === 'search'
        ? renderSearch()
        : state.tab === 'save'
          ? renderSave()
          : state.tab === 'library'
            ? renderLibrary()
            : state.tab === 'settings'
              ? renderSettings()
              : renderHome();

    app.innerHTML = `<div class="desktop-layout">${sidebar()}<section class="desktop-content"><div class="content-frame">${content}</div>${miniPlayer()}</section></div>${renderPlaylistPicker()}<nav class="bottom-nav glass" aria-label="Primary navigation">${navItem('home', 'home', 'Home')}${navItem('search', 'search', 'Search')}${navItem('library', 'library', 'Library')}${navItem('save', 'save', 'Downloads')}${navItem('settings', 'settings', 'Settings')}</nav>`;
    bindFormControls();
    actions.syncPlayerUi();
  }

  function bindFormControls() {
    document.querySelector('#search-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      actions.performSearch(document.querySelector('#search-input')?.value || '');
    });

    document.querySelector('#search-input')?.addEventListener('input', (event) => {
      state.searchQuery = event.target.value;
    });

    document.querySelector('#playlist-create-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      actions.createLocalPlaylist(document.querySelector('#playlist-name')?.value || '');
    });

    document.querySelector('#download-dir')?.addEventListener('change', (event) => {
      state.prefs.downloadDir = event.target.value.trim();
      savePrefs();
      actions.refreshOffline();
    });

    document.querySelector('#format-select')?.addEventListener('change', (event) => {
      state.prefs.format = event.target.value;
      savePrefs();
    });

    document.querySelector('#quality-select')?.addEventListener('change', (event) => {
      state.prefs.quality = event.target.value;
      savePrefs();
    });

    document.querySelector('#tray-toggle')?.addEventListener('change', async (event) => {
      state.prefs.trayEnabled = event.target.checked;
      savePrefs();
      try { await backend.setTrayEnabled(state.prefs.trayEnabled); } catch {}
    });

    document.querySelector('#floating-mini-toggle')?.addEventListener('change', async (event) => {
      state.prefs.floatingMiniPlayer = event.target.checked;
      savePrefs();
      try {
        await backend.setMiniPlayerEnabled(state.prefs.floatingMiniPlayer, state.prefs.miniPlayerLayout || 'bar');
        if (state.prefs.floatingMiniPlayer) actions.syncFloatingMiniPlayer(true);
      } catch {}
    });

    document.querySelector('#mini-layout-select')?.addEventListener('change', async (event) => {
      state.prefs.miniPlayerLayout = event.target.value === 'square' ? 'square' : 'bar';
      savePrefs();
      try {
        await backend.setMiniPlayerLayout(state.prefs.miniPlayerLayout);
        if (state.prefs.floatingMiniPlayer) actions.syncFloatingMiniPlayer(true);
      } catch {}
    });

    document.querySelectorAll('input[name="appearance-mode"]').forEach((input) => input.addEventListener('change', (event) => {
      if (!event.target.checked) return;
      state.prefs.liquidGlass = event.target.value === 'glass';
      savePrefs();
      document.documentElement.classList.toggle('no-liquid-glass', !state.prefs.liquidGlass);
      render();
      if (state.prefs.floatingMiniPlayer) actions.syncFloatingMiniPlayer(true);
    }));

    document.querySelector('#update-toggle')?.addEventListener('change', (event) => {
      state.prefs.autoUpdate = event.target.checked;
      savePrefs();
    });

    document.querySelector('#motion-toggle')?.addEventListener('change', (event) => {
      state.prefs.reducedMotion = event.target.checked;
      savePrefs();
      document.documentElement.classList.toggle('reduce-motion', state.prefs.reducedMotion);
    });

    document.querySelector('#seek')?.addEventListener('input', (event) => {
      actions.seekTo(Number(event.target.value));
    });

    document.querySelector('#volume')?.addEventListener('input', (event) => {
      actions.setVolume(Number(event.target.value));
    });
  }

  return { render, toast, updateAmbient, isFavorite };
}
