import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReleaseAsset, recommendAsset } from '../../shared/release-classifier.js';

const asset = (name) => ({ id: name, name, browser_download_url: `https://github.com/example/app/releases/download/v1/${name}`, size: 100 });

test('classifies Windows, Android, macOS, Linux, and iOS packages', () => {
  assert.equal(classifyReleaseAsset(asset('App-x64.msi')).platform, 'windows');
  assert.equal(classifyReleaseAsset(asset('App-arm64.apk')).platform, 'android');
  assert.equal(classifyReleaseAsset(asset('App-universal.dmg')).platform, 'macos');
  assert.equal(classifyReleaseAsset(asset('App-x86_64.AppImage')).platform, 'linux');
  assert.equal(classifyReleaseAsset(asset('App.ipa')).platform, 'ios');
});

test('keeps AAB non-direct-install and never misclassifies x86_64 as x86', () => {
  const aab = classifyReleaseAsset(asset('App-arm64.aab'));
  assert.equal(aab.platform, 'android');
  assert.equal(aab.installable, false);
  assert.equal(classifyReleaseAsset(asset('App-x86_64.msi')).arch, 'x64');
});

test('recommends exact arch, then universal, and penalizes source/debug assets', () => {
  const assets = [
    asset('App-source.zip'),
    asset('App-debug-x64.exe'),
    asset('App-universal.msi'),
    asset('App-x64.msi'),
  ].map(classifyReleaseAsset);
  assert.equal(recommendAsset(assets, { os: 'windows', arch: 'x64' })?.name, 'App-x64.msi');
  assert.equal(recommendAsset(assets, { os: 'windows', arch: 'arm64' })?.name, 'App-universal.msi');
});
