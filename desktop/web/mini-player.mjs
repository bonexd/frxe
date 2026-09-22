const tauri = window.__TAURI__ || null;
const invoke = tauri?.core?.invoke;
const listen = tauri?.event?.listen;
const fallbackCover = './vitr-icon.svg';

const title = document.querySelector('#mini-title');
const artist = document.querySelector('#mini-artist');
const cover = document.querySelector('#mini-cover');
const progress = document.querySelector('#mini-progress-bar');
const playIcon = document.querySelector('#mini-play-icon');
const playButton = document.querySelector('[data-action="toggle-play"]');

function render(snapshot = {}) {
  document.documentElement.classList.toggle('mini-dark', snapshot.liquidGlass === false);
  document.documentElement.classList.toggle('mini-square', snapshot.miniPlayerLayout === 'square');
  title.textContent = snapshot.title || 'Nothing playing';
  artist.textContent = snapshot.artist || 'vitr';
  cover.src = snapshot.cover || fallbackCover;
  const duration = Number(snapshot.durationSeconds || 0);
  const position = Number(snapshot.positionSeconds || 0);
  const value = duration > 0 ? Math.max(0, Math.min(100, position / duration * 100)) : 0;
  progress.style.width = `${value}%`;
  playIcon.textContent = snapshot.playing ? '❚❚' : '▶';
  playButton?.setAttribute('aria-label', snapshot.playing ? 'Pause' : 'Play');
}

cover.addEventListener('error', () => {
  if (!cover.src.endsWith('/vitr-icon.svg')) cover.src = fallbackCover;
});

document.addEventListener('pointerdown', async (event) => {
  if (event.button !== 0 || event.target.closest('button')) return;
  if (!event.target.closest('[data-vitr-drag-region]')) return;
  try { await invoke?.('start_drag_window'); } catch {}
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || !invoke) return;
  const action = button.dataset.action;
  try { await invoke('mini_player_action', { action }); } catch {}
});

if (listen) {
  try {
    await listen('mini-player-state', ({ payload }) => render(payload || {}));
  } catch {}
}

try {
  render(await invoke?.('mini_player_state') || {});
} catch {
  render();
}
