import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');

test('Tauri initializes playwire media controls and exposes state updates', async () => {
  const [cargo, lib, media] = await Promise.all([
    read('src-tauri/Cargo.toml'),
    read('src-tauri/src/lib.rs'),
    read('src-tauri/src/media_controls.rs'),
  ]);

  assert.match(cargo, /playwire\s*=\s*"1\.0\.0"/);
  assert.match(lib, /^mod\s+media_controls;/m);
  assert.doesNotMatch(lib, /#\[cfg\(test\)\]\s*\nmod\s+media_controls/);
  assert.match(lib, /media_controls::install\(app\)/);
  assert.match(lib, /media_controls::update_media_controls/);
  assert.match(media, /MediaControls::new/);
  assert.match(media, /PlayerConfig::new\("vitr"\)/);
  assert.match(media, /emit\("player-command"/);
  assert.match(media, /pub\s+fn\s+update_media_controls/);
});

test('native media setup degrades without making playback startup fail', async () => {
  const [lib, media] = await Promise.all([
    read('src-tauri/src/lib.rs'),
    read('src-tauri/src/media_controls.rs'),
  ]);

  assert.match(media, /Option<\s*MediaControls\s*>/);
  assert.match(lib, /if\s+let\s+Err\([^)]*\)\s*=\s*media_controls::install\(app\)/);
  assert.match(lib, /eprintln!|println!|log::warn!/);
});
