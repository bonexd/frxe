import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');

test('maintained CI does not target temporary development branches', async () => {
  const ci = await read('.github/workflows/ci.yml');
  assert.doesNotMatch(ci, /cleanup\/|fix\/|feature\/|feat\//);
});


test('repository has no committed documentation or text clutter', async () => {
  const ignored = new Set(['node_modules', 'target', 'release-upload']);
  async function walk(dir = root) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (ignored.has(entry.name) || entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...await walk(full));
      else files.push(full.slice(root.length + 1).replaceAll('\\', '/'));
    }
    return files;
  }

  const clutter = (await walk()).filter((path) => /\.(?:md|txt)$/i.test(path));
  assert.deepEqual(clutter, []);
});
