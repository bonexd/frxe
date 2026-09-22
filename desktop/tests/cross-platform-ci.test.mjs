import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');

test('normal CI validates every supported desktop runtime with locked dependencies', async () => {
  const ci = await read('.github/workflows/ci.yml');
  for (const runner of ['ubuntu-24.04', 'windows-2025', 'macos-15', 'macos-15-intel']) {
    assert.match(ci, new RegExp(runner.replaceAll('-', '\\-')));
  }
  assert.match(ci, /npm\s+ci/);
  assert.match(ci, /cargo\s+test\s+--locked/);
  assert.match(ci, /cargo\s+check\s+--locked/);
});

test('package workflows derive versioned artifact names from release metadata', async () => {
  const workflows = await Promise.all([
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/linux-packages.yml'),
    read('.github/workflows/macos-dmg.yml'),
  ]);
  for (const workflow of workflows) {
    assert.match(workflow, /release-metadata\.mjs\s+version/);
    assert.match(workflow, /steps\.release\.outputs\.version/);
    assert.doesNotMatch(workflow, /vitr-1\.2\.4/);
  }
});
