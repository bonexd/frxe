import { trackKey } from './core.mjs';
export function createPrimitives({ state, ambient, toastHost, convertFileSrc, trackRegistry }) {
  let toastTimer = null;
  const historyKey = 'vitr.desktop.history.v1';
  const appRoot = document.querySelector('#app');

  if (appRoot && appRoot.dataset.historyActionsBound !== '1') {
    appRoot.dataset.historyActionsBound = '1';
    appRoot.addEventListener('click', (event) => {
      const node = event.target instanceof Element ? event.target : null;
      const button = node?.closest('[data-action]');
      const action = button?.dataset.action;
      if (action !== 'remove-history' && action !== 'clear-history') return;

      if (action === 'remove-history') {
        const key = button.dataset.track || '';
        state.history = state.history.filter((item) => trackKey(item) !== key);
      } else {
        state.history = [];
      }

      localStorage.setItem(historyKey, JSON.stringify(state.history.slice(0, 120)));
      queueMicrotask(() => {
        document.querySelector(`[data-tab="${state.tab}"]`)?.click();
      });
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function registerTracks(tracks) {
    for (const track of tracks || []) trackRegistry.set(trackKey(track), track);
  }

  function icon(name, size = 20) {
    const paths = {
      home: '<path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5z"/>',
      search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
      save: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/>',
      library: '<path d="M5 4v16M9 4v16M13 6v14M17 5l2 15"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
      play: '<path class="fill" d="m9 6 10 6-10 6z"/>',
      pause: '<path class="fill" d="M8 6h3v12H8zm5 0h3v12h-3z"/>',
      next: '<path class="fill" d="m6 6 8 6-8 6zM16 6h2v12h-2z"/>',
      prev: '<path class="fill" d="m18 6-8 6 8 6zM6 6h2v12H6z"/>',
      heart: '<path d="M20.5 8.8c0 5.2-8.5 10.2-8.5 10.2S3.5 14 3.5 8.8A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 8.5 1.3z"/>',
      download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 20h14"/>',
      more: '<circle class="fill" cx="5" cy="12" r="1.5"/><circle class="fill" cx="12" cy="12" r="1.5"/><circle class="fill" cx="19" cy="12" r="1.5"/>',
      shuffle: '<path d="M4 7h3c5 0 5 10 10 10h3"/><path d="m17 14 3 3-3 3M4 17h3c2 0 3-1.5 4-3M16 7h4m-3-3 3 3-3 3"/>',
      repeat: '<path d="M17 5l3 3-3 3"/><path d="M4 11V9a2 2 0 0 1 2-2h14M7 19l-3-3 3-3"/><path d="M20 13v2a2 2 0 0 1-2 2H4"/>',
      queue: '<path d="M4 6h12M4 12h10M4 18h8"/><path d="m17 15 4 3-4 3z"/>',
      lyrics: '<path d="M9 4v11.5a3 3 0 1 1-2-2.8V6l11-2v9.5a3 3 0 1 1-2-2.8V4.4z"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      x: '<path d="m6 6 12 12M18 6 6 18"/>',
      trash: '<path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6M14 11v6"/>',
    };
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.more}</svg>`;
  }

  function artwork(track, className = 'artwork') {
    if (!track) {
      return `<div class="${className} artwork-fallback vitr-fallback"><img src="./vitr-icon.svg" alt="" draggable="false" /></div>`;
    }
    const cover = track?.cover;
    if (cover) {
      const src = track.kind === 'local' && !/^https?:|^data:|^asset:/.test(cover) ? convertFileSrc(cover) : cover;
      return `<div class="${className}"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></div>`;
    }
    const text = (track?.title || 'vitr').split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
    return `<div class="${className} artwork-fallback"><span>${escapeHtml(text || 'V')}</span></div>`;
  }

  function isFavorite(track) {
    const key = trackKey(track);
    return state.favorites.some((item) => trackKey(item) === key);
  }

  function toast(message, tone = 'normal') {
    clearTimeout(toastTimer);
    toastHost.innerHTML = `<div class="toast glass ${tone === 'error' ? 'error' : ''}">${escapeHtml(message)}</div>`;
    requestAnimationFrame(() => toastHost.firstElementChild?.classList.add('show'));
    toastTimer = setTimeout(() => { toastHost.innerHTML = ''; }, 3400);
  }

  function updateAmbient(track) {
    if (!track?.cover) {
      ambient.style.backgroundImage = '';
      ambient.classList.remove('has-art');
      return;
    }
    const src = track.kind === 'local' && !/^https?:|^data:|^asset:/.test(track.cover) ? convertFileSrc(track.cover) : track.cover;
    ambient.style.backgroundImage = `url("${String(src).replaceAll('"', '%22')}")`;
    ambient.classList.add('has-art');
  }

  function trackRow(track, { index = null, showDownload = true } = {}) {
    const key = trackKey(track);
    trackRegistry.set(key, track);
    const current = trackKey(state.current) === key;
    return `<article class="track-row glass-soft ${current ? 'current' : ''}" data-track="${escapeHtml(key)}">
      <button class="row-main" data-action="play-track" data-track="${escapeHtml(key)}" aria-label="Play ${escapeHtml(track.title)}">
        ${artwork(track, 'track-art')}
        ${index !== null ? `<span class="track-index">${index + 1}</span>` : ''}
        <span class="track-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist || 'Unknown artist')}${track.album ? ` · ${escapeHtml(track.album)}` : ''}</small></span>
        <span class="track-duration">${escapeHtml(track.duration || '')}</span>
      </button>
      <div class="row-actions">
        <button class="icon-button ${isFavorite(track) ? 'active' : ''}" data-action="favorite" data-track="${escapeHtml(key)}" aria-label="Favorite">${icon('heart', 18)}</button>
        <button class="icon-button" data-action="playlist-picker" data-track="${escapeHtml(key)}" aria-label="Add to playlist">${icon('plus', 18)}</button>
        ${showDownload && track.kind === 'youtube' ? `<button class="icon-button" data-action="download" data-track="${escapeHtml(key)}" aria-label="Download">${icon('download', 18)}</button>` : ''}
      </div>
    </article>`;
  }

  function emptyState(title, body) {
    return `<div class="empty glass-soft"><div class="empty-orb"></div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>`;
  }

  function renderSection(title, tracks, options = {}) {
    registerTracks(tracks);
    return `<section class="content-section">
      <div class="section-title"><div><span>${escapeHtml(options.eyebrow || '')}</span><h2>${escapeHtml(title)}</h2></div>${options.action || ''}</div>
      ${tracks.length ? `<div class="track-list">${tracks.map((track, index) => trackRow(track, { index: options.numbered ? index : null })).join('')}</div>` : emptyState(options.emptyTitle || 'Nothing here yet', options.emptyBody || 'Play or save music and it will show up here.')}
    </section>`;
  }

  return { escapeHtml, registerTracks, icon, artwork, isFavorite, toast, updateAmbient, trackRow, emptyState, renderSection };
}
