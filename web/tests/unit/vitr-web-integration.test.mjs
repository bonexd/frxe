import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../../src/main.jsx', import.meta.url), 'utf8');
const version = (await readFile(new URL('../../VERSION', import.meta.url), 'utf8')).trim();
let app = '';
try { app = await readFile(new URL('../../src/music/VitrWebApp.tsx', import.meta.url), 'utf8'); } catch {}

test('VITR boots the dedicated canonical composition app', () => {
  assert.match(main, /VitrWebApp\.tsx/);
  assert.match(app, new RegExp(`VITR_WEB_VERSION\\s*=\\s*['\"]${version.replaceAll('.', '\\.') }['\"]`));
});

test('canonical composition wires discovery taxonomy and playlists', () => {
  assert.match(app, /from ['"]\.\/recommendations\.js['"]/);
  assert.match(app, /from ['"]\.\/searchTaxonomy\.js['"]/);
  assert.match(app, /from ['"]\.\/playlists\.js['"]/);
  assert.match(app, /Top Result/);
  assert.match(app, />Songs</);
  assert.match(app, />Artists</);
  assert.match(app, />Genres</);
  assert.match(app, /Related Mixes/);
  assert.match(app, /Your Playlists/);
  assert.match(app, /VITR Mixes/);
  assert.match(app, /Add to playlist/);
});

test('canonical composition uses credential-free browser playback without the retired relay', () => {
  assert.match(app, /loadYouTubeIframeApi/);
  assert.doesNotMatch(app, /\/api\/audio-stream|EXTRACTOR_WORKER|backgroundAudioPlayer/);
  assert.match(app, /This track does not allow embedded web playback/);
});
