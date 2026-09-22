import test from 'node:test';
import assert from 'node:assert/strict';
import { VITR_APP, mergeVitrSources } from '../../shared/vitr-app.js';

test('Vitr uses the canonical Blood repository', () => {
  assert.deepEqual(VITR_APP.sources.map((item) => item.repo), ['voidnont/vitr']);
});

test('Vitr recommends a compatible release asset', () => {
  const merged = mergeVitrSources([
    { repo: 'voidnont/vitr', version: '0.7.0', assets: [{ name: 'Vitr-0.7.0-arm64.apk', platform: 'android', arch: 'arm64', installable: true, score: 10, size: 1, url: 'https://github.com/voidnont/vitr/releases/download/v0.7.0/Vitr.apk' }] },
  ], { os: 'android', arch: 'arm64' });
  assert.equal(merged.recommended.repo, 'voidnont/vitr');
  assert.deepEqual(merged.availablePlatforms, ['android']);
});
