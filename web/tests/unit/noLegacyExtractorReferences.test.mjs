import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const blocked = ['co', 'balt'].join('');
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'playwright-report', 'test-results']);
const textExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.py', '.md', '.yml', '.yaml', '.json', '.txt', '.html', '.css']);

function collect(dir = '.') {
  const hits = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      hits.push(...collect(filePath));
      continue;
    }
    const relative = filePath.replace(/^\.\//, '');
    if (relative.toLowerCase().includes(blocked)) hits.push(`${relative} (filename)`);
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const text = fs.readFileSync(filePath, 'utf8').toLowerCase();
    if (text.includes(blocked)) hits.push(`${relative} (content)`);
  }
  return hits;
}

test('retired third-party fallback has no repository references', () => {
  const hits = collect();
  assert.deepEqual(hits, [], `Remove every retired fallback reference:\n${hits.join('\n')}`);
});
