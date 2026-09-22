import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const index = await readFile(new URL('web/index.html', root), 'utf8');

test('0.5.4 desktop player exposes a working sleep timer surface', () => {
  assert.match(index, /id="sleepTimerToggle"/);
  assert.match(index, /id="sleepTimerPicker"/);
  assert.match(index, /function setSleepTimer/);
  assert.match(index, /function cancelSleepTimer/);
  assert.match(index, /audio\.pause\(\)/);
  assert.match(index, /End of track/);
  assert.match(index, /15 minutes/);
  assert.match(index, /30 minutes/);
  assert.match(index, /60 minutes/);
});

test('sleep timer UI is not a dead button', () => {
  const handler = index.slice(
    index.indexOf('sleepTimerToggle.addEventListener'),
    index.indexOf('playlistPickerClose.addEventListener')
  );
  assert.match(handler, /openSleepTimerPicker/);
});
