import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('runtime settings distinguish managed yt-dlp from detected system tools', async () => {
  const [ui, app, backend, lib, runtime] = await Promise.all([
    read('web/ui.mjs'),
    read('web/app.mjs'),
    read('web/backend.mjs'),
    read('src-tauri/src/lib.rs'),
    read('src-tauri/src/runtime.rs'),
  ]);

  assert.match(ui, /vitr manages yt-dlp/i);
  assert.match(ui, /Deno[^.]*FFmpeg[^.]*detect|detect[^.]*Deno[^.]*FFmpeg/is);
  assert.match(ui, /Update yt-dlp/i);
  assert.match(ui, /Reset Vitr app/i);
  assert.match(ui, /Modern Dark/i);
  assert.match(ui, /Liquid Glass/i);
  assert.match(ui, /Floating mini player/i);
  assert.match(ui, /floating-mini-toggle/);
  assert.match(ui, /Mini player shape/i);
  assert.match(ui, /mini-layout-select/);
  assert.match(ui, /Square \(1:1\)/);
  assert.match(ui, /appearance-mode/);
  assert.match(ui, /Automatic updates/i);
  assert.match(ui, /update-toggle/);
  assert.match(ui, /Check for updates/i);
  assert.match(ui, /Downloaded music.*stay.*disk/i);
  assert.doesNotMatch(ui, /yt-dlp, Deno, FFmpeg[^.]*managed by vitr/i);

  assert.match(backend, /currentRuntimeStatus\(\)[\s\S]*invoke\('current_runtime_status'\)/);
  assert.match(lib, /runtime::current_runtime_status/);
  assert.match(app, /backend\.currentRuntimeStatus\(\)[\s\S]*\.then/);
  assert.match(app, /async function initialize\(\)[\s\S]{0,220}render\(\)/);
  assert.match(app, /setMiniPlayerEnabled\(false, state\.prefs\.miniPlayerLayout/);
  assert.match(app, /yt-dlp updated/);
  assert.match(app, /case 'reset-app'/);
  assert.match(app, /persistence\.resetAll\(\)/);
  assert.match(app, /resetInProgress/);
  assert.match(app, /no-liquid-glass/);
  assert.match(app, /checkForAppUpdate/);
  assert.match(app, /prefs\.autoUpdate/);
  assert.match(backend, /invoke\('auto_update'\)/);
  assert.match(backend, /invoke\('set_mini_player_enabled'/);
  assert.match(backend, /invoke\('set_mini_player_layout'/);
  assert.match(backend, /invoke\('update_mini_player'/);
  assert.match(lib, /download_and_install/);
  assert.match(lib, /start_drag_window/);
  assert.match(lib, /set_mini_player_enabled/);
  assert.match(lib, /set_mini_player_layout/);
  assert.match(lib, /210\.0, 210\.0/);
  assert.match(lib, /340\.0, 88\.0/);
  assert.match(lib, /mini_player_action/);
  assert.match(app, /mini-player-command/);
  assert.match(app, /mini-player-disabled/);
  assert.match(app, /syncFloatingMiniPlayer/);
  assert.match(app, /backend\.discover\(clean\)/);
  assert.match(ui, /Artists/);
  assert.match(ui, /Albums & singles/);
  assert.match(ui, /Playlists/);
  assert.match(ui, /Genres & moods/);
  assert.match(runtime, /#\[tauri::command\][\s\S]*pub async fn current_runtime_status/);
  assert.doesNotMatch(runtime, /Update runtime dependencies first/);
});
