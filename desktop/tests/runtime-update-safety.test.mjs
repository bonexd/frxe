import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('managed yt-dlp updates validate a staged binary before activation', async () => {
  const runtime = await readFile(new URL('../src-tauri/src/runtime.rs', import.meta.url), 'utf8');
  assert.match(runtime, /validate_ytdlp/);
  assert.match(runtime, /Downloaded yt-dlp failed validation/);
  assert.match(runtime, /download[^\n]*candidate|candidate[^\n]*download/i);
  assert.match(runtime, /backup/);
  assert.match(runtime, /rename\([^\n]*candidate[^\n]*target|rename\([^\n]*target[^\n]*backup/s);
  assert.match(runtime, /Could not activate yt-dlp update/);
});
