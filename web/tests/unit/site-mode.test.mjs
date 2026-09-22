import test from 'node:test';
import assert from 'node:assert/strict';
import { isVitrWebLocation } from '../../src/site-mode.js';

test('vitr.nont.me is the official Vitr web-player host', () => {
  assert.equal(isVitrWebLocation('vitr.nont.me', '/'), true);
});

test('retired music subdomain is no longer a Vitr web-player host', () => {
  assert.equal(isVitrWebLocation('music.nont.me', '/'), false);
});

test('the /music compatibility route still opens the player', () => {
  assert.equal(isVitrWebLocation('nont.me', '/music'), true);
  assert.equal(isVitrWebLocation('nont.me', '/music/search'), true);
});

test('root host remains the standalone release page', () => {
  assert.equal(isVitrWebLocation('nont.me', '/'), false);
  assert.equal(isVitrWebLocation('www.nont.me', '/'), false);
});
