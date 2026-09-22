import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

async function source(path) {
  return readFile(join(root, path), 'utf8');
}

test('Seal-style downloader is first priority with vitr fallback', async () => {
  const downloads = await source('src-tauri/src/downloads.rs');

  assert.match(downloads, /enum\s+DownloadStrategy\s*\{[\s\S]*SealFirst[\s\S]*VitrFallback[\s\S]*\}/);
  assert.match(downloads, /vec!\[\s*DownloadStrategy::SealFirst\s*,\s*DownloadStrategy::VitrFallback\s*\]/);
  assert.match(downloads, /"--embed-metadata"/);
  assert.match(downloads, /"--embed-thumbnail"/);
  assert.match(downloads, /resolve_aria2c/);
  assert.match(downloads, /cancelled[\s\S]*return\s+Err/);
});

test('runtime can discover aria2c without requiring it', async () => {
  const runtime = await source('src-tauri/src/runtime.rs');

  assert.match(runtime, /pub\s+fn\s+resolve_aria2c\s*\(/);
  assert.match(runtime, /aria2c\.exe/);
  assert.match(runtime, /executable_in_path\(name\)/);
});
