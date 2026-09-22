import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const cargoTomlUrl = new URL('../src-tauri/Cargo.toml', import.meta.url);

test('Rust manifest declares dependencies used by downloads and search', async () => {
  const cargo = await readFile(fileURLToPath(cargoTomlUrl), 'utf8');

  assert.match(cargo, /^sysinfo\s*=\s*"0\.37"$/m);
  assert.match(cargo, /^urlencoding\s*=\s*"2"$/m);
  assert.match(cargo, /^walkdir\s*=\s*"2"$/m);
  assert.match(cargo, /^\[dev-dependencies\]$/m);
  assert.match(cargo, /^tempfile\s*=\s*"3"$/m);
});
