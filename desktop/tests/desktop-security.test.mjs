import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('desktop webview has a real CSP and no filesystem-wide static asset scope', async () => {
  const config = JSON.parse(await read('src-tauri/tauri.conf.json'));
  const security = config.app.security;
  assert.equal(typeof security.csp, 'string');
  assert.ok(security.csp.length > 20);
  assert.match(security.csp, /default-src\s+'self'/);
  assert.match(security.csp, /object-src\s+'none'/);
  const scope = security.assetProtocol.scope;
  assert.ok(Array.isArray(scope));
  assert.equal(scope.includes('**'), false);
  assert.equal(scope.includes('**/*'), false);
});

test('selected music folders and restored local tracks are authorized dynamically', async () => {
  const [downloads, backend, lib] = await Promise.all([
    read('src-tauri/src/downloads.rs'),
    read('web/backend.mjs'),
    read('src-tauri/src/lib.rs'),
  ]);
  assert.match(downloads, /asset_protocol_scope\(\)/);
  assert.match(downloads, /allow_directory\([^,]+,\s*true\)/);
  assert.match(downloads, /pub async fn scan_downloads\([\s\S]*AppHandle/);
  assert.match(downloads, /download_track\([\s\S]*allow_media_directory/);
  assert.match(downloads, /pub fn authorize_media_path\([\s\S]*allow_media_directory/);
  assert.match(lib, /downloads::authorize_media_path/);

  const authorize = backend.indexOf("invoke('authorize_media_path'");
  const convert = backend.indexOf('convertFileSrc(track.path)');
  assert.ok(authorize >= 0 && convert >= 0 && authorize < convert, 'local track folder must be authorized before convertFileSrc');
});
