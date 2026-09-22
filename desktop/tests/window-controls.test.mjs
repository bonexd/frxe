import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAppExit, requestWindowAction, requestWindowDrag } from '../web/window-controls.mjs';

test('close requests native app exit instead of normal window close', async () => {
  const calls = [];
  let closed = false;
  const result = await requestAppExit({
    invoke: async (command) => { calls.push(command); },
    currentWindow: { close: async () => { closed = true; } },
  });
  assert.equal(result, 'native-exit');
  assert.deepEqual(calls, ['exit_app']);
  assert.equal(closed, false);
});

test('close falls back to destroying the window if native exit fails', async () => {
  let destroyed = false;
  const result = await requestAppExit({
    invoke: async () => { throw new Error('native unavailable'); },
    currentWindow: { destroy: async () => { destroyed = true; } },
  });
  assert.equal(result, 'destroy');
  assert.equal(destroyed, true);
});


test('minimize prefers the native vitr window command', async () => {
  const calls = [];
  let jsMinimized = false;
  const result = await requestWindowAction(
    'minimize',
    { minimize: async () => { jsMinimized = true; } },
    async (command) => { calls.push(command); },
  );
  assert.equal(result, 'native-minimize');
  assert.deepEqual(calls, ['minimize_window']);
  assert.equal(jsMinimized, false);
});

test('minimize falls back to the Tauri window API if the native command fails', async () => {
  let jsMinimized = false;
  const result = await requestWindowAction(
    'minimize',
    { minimize: async () => { jsMinimized = true; } },
    async () => { throw new Error('native unavailable'); },
  );
  assert.equal(result, 'minimize');
  assert.equal(jsMinimized, true);
});


test('window dragging prefers the direct Tauri window gesture', async () => {
  const calls = [];
  let dragged = false;
  const result = await requestWindowDrag(
    { startDragging: async () => { dragged = true; } },
    async (command) => { calls.push(command); },
  );
  assert.equal(result, 'drag');
  assert.equal(dragged, true);
  assert.deepEqual(calls, []);
});

test('window dragging falls back to the native vitr drag command', async () => {
  const calls = [];
  const result = await requestWindowDrag(
    { startDragging: async () => { throw new Error('window api unavailable'); } },
    async (command) => { calls.push(command); },
  );
  assert.equal(result, 'native-drag');
  assert.deepEqual(calls, ['start_drag_window']);
});

test('window controls bind dragging to mousedown so Windows keeps the user gesture', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../web/window-controls.mjs', import.meta.url), 'utf8'));
  assert.match(source, /addEventListener\('mousedown'/);
  assert.doesNotMatch(source, /addEventListener\('pointerdown'/);
});


test('maximize prefers the native vitr window command', async () => {
  const calls = [];
  let jsMaximized = false;
  const result = await requestWindowAction(
    'maximize',
    { toggleMaximize: async () => { jsMaximized = true; } },
    async (command) => { calls.push(command); },
  );
  assert.equal(result, 'native-maximize');
  assert.deepEqual(calls, ['toggle_maximize_window']);
  assert.equal(jsMaximized, false);
});

test('maximize falls back to the Tauri window API if the native command fails', async () => {
  let jsMaximized = false;
  const result = await requestWindowAction(
    'maximize',
    { toggleMaximize: async () => { jsMaximized = true; } },
    async () => { throw new Error('native unavailable'); },
  );
  assert.equal(result, 'maximize');
  assert.equal(jsMaximized, true);
});
