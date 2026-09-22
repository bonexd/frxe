import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { requestWindowAction } from '../web/window-controls.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');

test('minimize delegates to the native window', async () => {
  let calls = 0;
  const result = await requestWindowAction('minimize', {
    minimize: async () => { calls += 1; },
  });
  assert.equal(result, 'minimize');
  assert.equal(calls, 1);
});

test('maximize toggles the native window', async () => {
  let calls = 0;
  const result = await requestWindowAction('maximize', {
    toggleMaximize: async () => { calls += 1; },
  });
  assert.equal(result, 'maximize');
  assert.equal(calls, 1);
});

test('optional native integrations do not abort desktop startup', async () => {
  const lib = await read('src-tauri/src/lib.rs');
  assert.match(lib, /if\s+let\s+Err\(error\)\s*=\s*tray::install\(app\)/);
  assert.match(lib, /vitr system tray unavailable/);
  assert.match(lib, /if\s+let\s+Err\(error\)\s*=\s*media_controls::install\(app\)/);
});

test('main window fits common laptop displays and avoids fragile transparency', async () => {
  const config = JSON.parse(await read('src-tauri/tauri.conf.json'));
  const window = config.app.windows[0];
  assert.ok(window.width <= 1180);
  assert.ok(window.height <= 720);
  assert.ok(window.minWidth <= 760);
  assert.ok(window.minHeight <= 520);
  assert.equal(window.resizable, true);
  assert.equal(window.transparent, false);
});


test('vanilla frontend has the Tauri native bridge enabled', async () => {
  const config = JSON.parse(await read('src-tauri/tauri.conf.json'));
  assert.equal(config.app.withGlobalTauri, true);
});
