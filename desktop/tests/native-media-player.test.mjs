import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');

test('player publishes vitr playback state through the native media bridge', async () => {
  const app = await read('web/app.mjs');

  assert.match(app, /from ['"]\.\/media-controls\.mjs['"]/);
  assert.match(app, /buildMediaPlaybackSnapshot/);
  assert.match(app, /backend\.updateMediaControls\s*\(/);
  assert.match(app, /track:\s*state\.current/);
  assert.match(app, /queue:\s*state\.queue/);
  assert.match(app, /queueIndex:\s*state\.queueIndex/);
  assert.match(app, /playing:\s*state\.playing/);
  assert.match(app, /positionSeconds:\s*audio\.currentTime/);
  assert.match(app, /durationSeconds:\s*audio\.duration/);
  assert.match(app, /audio\.addEventListener\(['"]timeupdate['"][^\n]*syncNativeMediaControls/s);
});

test('native OS media commands reuse vitr player actions', async () => {
  const app = await read('web/app.mjs');

  assert.match(app, /applyNativeMediaCommand/);
  assert.match(app, /listen\(['"]player-command['"]/);
  for (const handler of [
    'play',
    'pause',
    'togglePlay',
    'next',
    'previous',
    'stop',
    'seekTo',
    'seekBy',
    'setVolume',
    'setShuffle',
    'setRepeat',
  ]) {
    assert.match(app, new RegExp(`\\b${handler}\\s*(?::|[,}])`));
  }
  assert.match(app, /applyNativeMediaCommand\([^,]+,\s*payload\)/);
});

test('native media state is refreshed for playback and preference changes', async () => {
  const app = await read('web/app.mjs');

  assert.match(app, /audio\.addEventListener\(['"]play['"][\s\S]*?syncNativeMediaControls/s);
  assert.match(app, /audio\.addEventListener\(['"]pause['"][\s\S]*?syncNativeMediaControls/s);
  assert.match(app, /audio\.addEventListener\(['"]durationchange['"][^\n]*syncNativeMediaControls/s);
  assert.match(app, /case ['"]shuffle['"][\s\S]*?syncNativeMediaControls/);
  assert.match(app, /case ['"]repeat['"][\s\S]*?syncNativeMediaControls/);
});

test('full player seek and volume reuse native-synchronized player actions', async () => {
  const [app, ui] = await Promise.all([
    read('web/app.mjs'),
    read('web/ui.mjs'),
  ]);

  assert.match(app, /actions:\s*\{[\s\S]*?seekTo[\s\S]*?setVolume[\s\S]*?\}/);
  assert.match(ui, /document\.querySelector\('#seek'\)\?\.addEventListener\('input',[\s\S]*?actions\.seekTo\(Number\(event\.target\.value\)\)/);
  assert.match(ui, /document\.querySelector\('#volume'\)\?\.addEventListener\('input',[\s\S]*?actions\.setVolume\(Number\(event\.target\.value\)\)/);
});