import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDeviceFromSignals } from '../../src/device.js';

test('normalizes Windows and Android signals', () => {
  assert.deepEqual(
    detectDeviceFromSignals({ platform: 'Windows', architecture: 'x86', bitness: '64', mobile: false, userAgent: '' }),
    { os: 'windows', arch: 'x64', mobile: false, confidence: 'high' },
  );
  assert.equal(detectDeviceFromSignals({ platform: 'Android', architecture: 'arm', bitness: '64', mobile: true, userAgent: 'Android' }).os, 'android');
});

test('does not invent architecture when unavailable', () => {
  assert.equal(detectDeviceFromSignals({ platform: 'Linux', userAgent: 'Linux' }).arch, 'unknown');
});
