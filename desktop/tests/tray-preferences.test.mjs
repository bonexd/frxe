import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizePreferences } from '../web/core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('tray preference has an explicit default and preserves an explicit off choice', () => {
  assert.equal(normalizePreferences({}).trayEnabled, true);
  assert.equal(normalizePreferences({ trayEnabled: false }).trayEnabled, false);
});

test('startup synchronizes persisted tray visibility while close remains a native exit', async () => {
  const [app, closeControls] = await Promise.all([
    read('web/app.mjs'),
    read('web/window-controls.mjs'),
  ]);
  assert.match(app, /async function initialize\(\)[\s\S]*backend\.setTrayEnabled\(state\.prefs\.trayEnabled\)\.catch/);
  assert.match(closeControls, /exitApp|exit_app/);
});
