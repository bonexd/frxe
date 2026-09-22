import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMediaPlaybackSnapshot, applyNativeMediaCommand } from '../web/media-controls.mjs';

const track = {
  id: 'abcdefghijk',
  kind: 'youtube',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  cover: 'https://img.test/cover.jpg',
};

test('buildMediaPlaybackSnapshot maps vitr state into the native contract', () => {
  assert.deepEqual(buildMediaPlaybackSnapshot({
    track,
    queue: [track, { ...track, id: 'next-track' }],
    queueIndex: 0,
    prefs: { volume: 0.7, muted: false, shuffle: true, repeat: 'queue' },
    playing: true,
    positionSeconds: 42,
    durationSeconds: 200,
  }), {
    trackId: 'abcdefghijk',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    artwork: 'https://img.test/cover.jpg',
    durationSeconds: 200,
    positionSeconds: 42,
    playing: true,
    volume: 0.7,
    shuffle: true,
    repeat: 'queue',
    canNext: true,
    canPrevious: false,
    canSeek: true,
  });
});

test('buildMediaPlaybackSnapshot clears metadata when no track is loaded', () => {
  const snapshot = buildMediaPlaybackSnapshot({
    track: null,
    queue: [],
    queueIndex: -1,
    prefs: { volume: 1, muted: false, shuffle: false, repeat: 'off' },
    playing: false,
    positionSeconds: 0,
    durationSeconds: 0,
  });
  assert.equal(snapshot.trackId, null);
  assert.equal(snapshot.title, null);
  assert.equal(snapshot.canSeek, false);
});

test('buildMediaPlaybackSnapshot omits unsupported artwork schemes and clamps media values', () => {
  const snapshot = buildMediaPlaybackSnapshot({
    track: { ...track, cover: 'data:image/png;base64,abc' },
    queue: [track],
    queueIndex: 0,
    prefs: { volume: 3, muted: true, shuffle: false, repeat: 'track' },
    playing: false,
    positionSeconds: 999,
    durationSeconds: 120,
  });
  assert.equal(snapshot.artwork, '');
  assert.equal(snapshot.volume, 0);
  assert.equal(snapshot.positionSeconds, 120);
  assert.equal(snapshot.repeat, 'track');
});

test('applyNativeMediaCommand dispatches supported OS commands', async () => {
  const calls = [];
  const context = {
    play: async () => calls.push(['play']),
    pause: async () => calls.push(['pause']),
    togglePlay: async () => calls.push(['toggle-play']),
    next: async () => calls.push(['next']),
    previous: async () => calls.push(['previous']),
    stop: async () => calls.push(['stop']),
    seekTo: async (value) => calls.push(['seek-to', value]),
    seekBy: async (value) => calls.push(['seek-by', value]),
    setVolume: async (value) => calls.push(['set-volume', value]),
    setShuffle: async (value) => calls.push(['set-shuffle', value]),
    setRepeat: async (value) => calls.push(['set-repeat', value]),
  };

  const cases = [
    [{ action: 'play' }, ['play']],
    [{ action: 'pause' }, ['pause']],
    [{ action: 'toggle-play' }, ['toggle-play']],
    [{ action: 'next' }, ['next']],
    [{ action: 'previous' }, ['previous']],
    [{ action: 'stop' }, ['stop']],
    [{ action: 'seek-to', positionSeconds: 25 }, ['seek-to', 25]],
    [{ action: 'seek-by', offsetSeconds: -10 }, ['seek-by', -10]],
    [{ action: 'set-volume', volume: 0.4 }, ['set-volume', 0.4]],
    [{ action: 'set-shuffle', enabled: true }, ['set-shuffle', true]],
    [{ action: 'set-repeat', mode: 'track' }, ['set-repeat', 'track']],
  ];

  for (const [payload, expected] of cases) {
    calls.length = 0;
    assert.equal(await applyNativeMediaCommand(context, payload), true);
    assert.deepEqual(calls, [expected]);
  }
});

test('applyNativeMediaCommand ignores invalid and unknown OS commands', async () => {
  const calls = [];
  const context = {
    play: async () => calls.push('play'),
    pause: async () => calls.push('pause'),
    togglePlay: async () => calls.push('toggle-play'),
    next: async () => calls.push('next'),
    previous: async () => calls.push('previous'),
    stop: async () => calls.push('stop'),
    seekTo: async () => calls.push('seek-to'),
    seekBy: async () => calls.push('seek-by'),
    setVolume: async () => calls.push('set-volume'),
    setShuffle: async () => calls.push('set-shuffle'),
    setRepeat: async () => calls.push('set-repeat'),
  };
  assert.equal(await applyNativeMediaCommand(context, { action: 'unknown' }), false);
  assert.equal(await applyNativeMediaCommand(context, { action: 'seek-to', positionSeconds: Number.NaN }), false);
  assert.equal(await applyNativeMediaCommand(context, { action: 'set-repeat', mode: 'invalid' }), false);
  assert.deepEqual(calls, []);
});
