import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackend } from '../web/backend.mjs';

const online = { id: 'abcdefghijk', kind: 'youtube', title: 'Song', artist: 'Artist' };
const local = { id: 'C:/Music/song.m4a', kind: 'local', path: 'C:/Music/song.m4a', title: 'Song', artist: 'Artist' };

test('search prioritizes YouTube Music before YouTube fallbacks and deduplicates results', async () => {
  const calls = [];
  const invoke = async (command, payload) => {
    calls.push([command, payload]);
    if (command === 'innertube_search' && payload.client === 'web') return [{ ...online, source: 'YouTube' }];
    if (command === 'innertube_search' && payload.client === 'music') return [{ ...online, source: 'YouTube Music' }, { ...online, id: 'zzzzzzzzzzz', title: 'Other', source: 'YouTube Music' }];
    if (command === 'ytdlp_search') return [{ ...online }];
    throw new Error(`unexpected ${command}`);
  };
  const backend = createBackend({ invoke, convertFileSrc: (path) => `asset:${path}` });
  const results = await backend.search('test');
  assert.equal(results.length, 2);
  assert.deepEqual(calls.map(([name, payload]) => [name, payload.client || null]), [
    ['innertube_search', 'music'],
    ['innertube_search', 'web'],
    ['ytdlp_search', null],
  ]);
  assert.equal(results[0].source, 'YouTube Music');
});

test('search keeps partial provider success but reports a total provider outage', async () => {
  const partial = createBackend({
    invoke: async (command, payload) => {
      if (command === 'innertube_search' && payload.client === 'music') throw new Error('music unavailable');
      if (command === 'innertube_search' && payload.client === 'web') return [];
      if (command === 'ytdlp_search') return [{ ...online, source: 'yt-dlp' }];
      throw new Error(`unexpected ${command}`);
    },
  });
  assert.deepEqual(await partial.search('test'), [{ ...online, source: 'yt-dlp' }]);

  const unavailable = createBackend({
    invoke: async () => { throw new Error('provider offline'); },
  });
  await assert.rejects(
    unavailable.search('test'),
    /search providers.*unavailable|search.*failed/i,
  );
});

test('resolveTrack authorizes local asset URLs and uses the vitr online resolver', async () => {
  const calls = [];
  const backend = createBackend({
    invoke: async (command, payload) => {
      calls.push([command, payload]);
      return command === 'resolve_stream_url' ? 'https://stream.test/audio' : null;
    },
    convertFileSrc: (path) => `asset://${path}`,
  });
  assert.equal(await backend.resolveTrack(local), 'asset://C:/Music/song.m4a');
  assert.equal(await backend.resolveTrack(online), 'https://stream.test/audio');
  assert.deepEqual(calls, [
    ['authorize_media_path', { path: local.path }],
    ['resolve_stream_url', { videoId: online.id }],
  ]);
});

test('startDownload maps vitr settings to the native download command', async () => {
  let call;
  const backend = createBackend({
    invoke: async (command, payload) => { call = [command, payload]; return null; },
    convertFileSrc: String,
  });
  await backend.startDownload({
    taskId: 'job-1', track: online, outputDir: 'C:/Music', format: 'm4a', quality: 'best', allowPlaylist: false,
  });
  assert.deepEqual(call, ['download_track', {
    taskId: 'job-1',
    url: `https://www.youtube.com/watch?v=${online.id}`,
    outputDir: 'C:/Music',
    format: 'm4a',
    quality: 'best',
    allowPlaylist: false,
  }]);
});

test('scanDownloads and lyrics use the native payload names', async () => {
  const calls = [];
  const backend = createBackend({
    invoke: async (command, payload) => { calls.push([command, payload]); return command === 'scan_downloads' ? [local] : { plainLyrics: 'hello' }; },
    convertFileSrc: String,
  });
  assert.deepEqual(await backend.scanDownloads('C:/Music'), [local]);
  await backend.lyrics({ ...online, album: 'Album', durationSeconds: 201 });
  assert.deepEqual(calls, [
    ['scan_downloads', { dir: 'C:/Music' }],
    ['fetch_metadata_lyrics', { title: 'Song', artist: 'Artist', album: 'Album', durationSeconds: 201 }],
  ]);
});

test('updateMediaControls maps the snapshot to the native command', async () => {
  let call;
  const backend = createBackend({
    invoke: async (command, payload) => { call = [command, payload]; },
  });
  const snapshot = { trackId: 'abc', playing: true };
  await backend.updateMediaControls(snapshot);
  assert.deepEqual(call, ['update_media_controls', { snapshot }]);
});


test('discover groups YouTube Music artists albums playlists genres and songs', async () => {
  const invoke = async (command, payload) => {
    if (command === 'innertube_catalog_search') {
      return {
        tracks: [{ ...online, source: 'YouTube Music' }],
        artists: [{ id: 'artist-1', kind: 'artist', title: 'Artist', subtitle: 'Artist', cover: null }],
        albums: [{ id: 'album-1', kind: 'album', title: 'Album', subtitle: 'Album · Artist', cover: null }],
        playlists: [{ id: 'playlist-1', kind: 'playlist', title: 'Mix', subtitle: 'Playlist', cover: null }],
        genres: [{ id: 'genre-1', kind: 'genre', title: 'Rock', subtitle: 'Genre & mood', cover: null }],
      };
    }
    if (command === 'innertube_search' && payload.client === 'web') return [{ ...online, source: 'YouTube' }];
    if (command === 'ytdlp_search') return [{ ...online }];
    throw new Error(`unexpected ${command}`);
  };

  const backend = createBackend({ invoke });
  const result = await backend.discover('rock');
  assert.equal(result.tracks.length, 1);
  assert.equal(result.artists[0].title, 'Artist');
  assert.equal(result.albums[0].title, 'Album');
  assert.equal(result.playlists[0].title, 'Mix');
  assert.ok(result.genres.some((item) => item.title === 'Rock'));
});


test('autoUpdate delegates to the signed native updater command', async () => {
  let command = '';
  const backend = createBackend({ invoke: async (name) => { command = name; return null; } });
  assert.equal(await backend.autoUpdate(), null);
  assert.equal(command, 'auto_update');
});
