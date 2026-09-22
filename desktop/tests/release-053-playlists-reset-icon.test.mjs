import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const index = await readFile(new URL('web/index.html', root), 'utf8');
const icon = await readFile(new URL('web/vitr-icon-down.svg', root), 'utf8');
const pkg = await readFile(new URL('package.json', root), 'utf8');

test('0.5.3 packaged player exposes add-to-playlist from tracks and Now Playing', () => {
  assert.match(index, /id="playerPlaylistAdd"/);
  assert.match(index, /data-song-add/);
  assert.match(index, /function openPlaylistPicker/);
  assert.match(index, /No playlists yet|Create a playlist/);
  assert.match(index, /window\.prompt\(["']Create a playlist/);
});

test('locally created playlists can be opened deleted and downloaded', () => {
  assert.match(index, /data-playlist-open/);
  assert.match(index, /data-playlist-delete/);
  assert.match(index, /data-playlist-download/);
  assert.match(index, /function deleteDesktopPlaylist/);
  assert.match(index, /async function downloadDesktopPlaylist/);
});

test('recommendations include Vitr-made playlists targeting at least two hours', () => {
  assert.match(index, /id="recommendedPlaylists"/);
  assert.match(index, /RECOMMENDED_PLAYLIST_TARGET_SECONDS\s*=\s*7200/);
  assert.match(index, /async function loadRecommendedPlaylists/);
  assert.match(index, /2h\+/);
});

test('Reset Vitr clears persistence-owned desktop state before reloading', () => {
  const reset = index.slice(index.indexOf('async function resetVitrState'), index.indexOf('function syncMiniUi'));
  assert.match(reset, /persistence\.resetAll\(\)/);
  assert.match(reset, /window\.location\.reload\(\)/);
});

test('packaged desktop icon uses the exact supplied downward Vitr mark', () => {
  assert.match(icon, /viewBox="0 0 512 512"/);
  assert.match(icon, /l100 129 100-129/);
  assert.match(index, /class="brand-mark"[^>]*src="\.\/vitr-icon-down\.svg"/);
  assert.match(pkg, /tauri icon web\/vitr-icon-down\.svg/);
});


test('library collections are clickable and Downloads is a real collection', () => {
  assert.match(index, /id="libraryCollections"/);
  assert.match(index, /data-library-collection="liked"/);
  assert.match(index, /data-library-collection="recent"/);
  assert.match(index, /data-library-collection="downloads"/);
  assert.match(index, /function openLibraryCollection/);
  assert.match(index, /backend\.scanDownloads/);
  assert.match(index, /<h2>Playlists<\/h2>/);
});


// Regression: concurrent release publishers must not race on the same version tag.
test('desktop release publishing is idempotent when another workflow creates the tag first', async () => {
  const workflow = await readFile(new URL('../.github/workflows/desktop-release.yml', root), 'utf8');
  assert.match(workflow, /gh release view "v\$\{VERSION\}"/);
  assert.match(workflow, /gh release upload "v\$\{VERSION\}" release-assets\/\*[\s\S]*?--clobber/);
  assert.match(workflow, /gh release create "v\$\{VERSION\}" release-assets\/\*/);
});
