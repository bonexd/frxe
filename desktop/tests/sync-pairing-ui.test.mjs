import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');

test('Windows exposes and auto-starts the same six-digit pairing flow as mobile', async () => {
  const [html, syncRs] = await Promise.all([
    read('web/index.html'),
    read('src-tauri/src/sync.rs'),
  ]);

  assert.match(html, /This Windows device/);
  assert.match(html, /id="downloadSyncPairCode"[^>]*>------</);
  assert.match(html, /Other device's 6-digit code/);
  assert.match(html, /if\(!state\.sharing&&backend\.startDownloadSync\)/);
  assert.match(html, /state=await backend\.startDownloadSync\(dir\)/);
  assert.match(html, /downloadSyncPairCode\.textContent=state\.pairCode\|\|"------"/);

  assert.match(syncRs, /#\[serde\(rename_all = "camelCase"\)\][\s\S]*pub struct SyncStatus/);
  assert.match(syncRs, /pub pair_code: String/);
  assert.match(syncRs, /format!\("\{:06\}"/);
  assert.match(syncRs, /pair_code: runtime\.pair_code\.clone\(\)/);
});

test('Windows still requires the remote device code before pulling downloads', async () => {
  const html = await read('web/index.html');
  assert.match(html, /if\(code\.length!==6\)/);
  assert.match(html, /Enter the other device's 6-digit code\./);
  assert.match(html, /backend\.syncDownloadsFromPeer\(peerId,code,dir\)/);
});


test('desktop snapshots sync files before declaring transfer size', async () => {
  const syncRs = await read('src-tauri/src/sync.rs');
  assert.match(syncRs, /fs::copy\(&path, &staged\)/);
  assert.match(syncRs, /let size = staged[\s\S]*?\.metadata\(\)/);
  assert.match(syncRs, /File::open\(&staged\)/);
  assert.match(syncRs, /fs::remove_file\(&staged\)/);
});
