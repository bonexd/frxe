import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Windows media controls pass HWND to playwire as u64', async () => {
  const source = await readFile(join(root, 'src-tauri/src/media_controls.rs'), 'utf8');
  assert.match(source, /config\.hwnd\(hwnd\.0\s+as\s+usize\s+as\s+u64\)/);
  assert.doesNotMatch(source, /config\.hwnd\(hwnd\.0\s+as\s+isize\)/);
});
