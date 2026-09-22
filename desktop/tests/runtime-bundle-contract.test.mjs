import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('clean checkout does not require staged runtime bundle files', async () => {
  const config = JSON.parse(await readFile(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const resources = config.bundle?.resources ?? [];

  assert.equal(
    resources.some((resource) => typeof resource === 'string' && resource.startsWith('resources/runtime/')),
    false,
    'runtime tools are installed into app data; clean builds must not require staged runtime files',
  );
});
