import test from 'node:test';
import assert from 'node:assert/strict';
import { readReleaseMetadata } from '../tools/release-metadata.mjs';

test('package.json is canonical and mirrored versions match', async () => {
  const metadata = await readReleaseMetadata();
  assert.equal(metadata.version, '0.1.0');
  assert.equal(metadata.productName, 'vitr');
});

test('release artifact names derive from the canonical version', async () => {
  const { artifacts } = await readReleaseMetadata();
  assert.deepEqual(artifacts, {
    windowsSetup: 'vitr-0.1.0-setup.exe',
    windowsMsi: 'vitr-0.1.0-x64.msi',
    linuxDeb: 'vitr-0.1.0-amd64.deb',
    linuxAppImage: 'vitr-0.1.0-x86_64.AppImage',
    macArmDmg: 'vitr-0.1.0-macos-arm64.dmg',
    macX64Dmg: 'vitr-0.1.0-macos-x64.dmg',
  });
});
