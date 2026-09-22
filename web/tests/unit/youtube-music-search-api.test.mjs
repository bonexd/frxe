import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/youtube-search.js';

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; },
    async text() { return JSON.stringify(data); },
  };
}

function versionResponse(version = '2.20260915.01.00') {
  return {
    ok: true,
    status: 200,
    async text() { return `\"INNERTUBE_CONTEXT_CLIENT_VERSION\":\"${version}\"`; },
  };
}

function videoPayload(id = 'fallback01', title = 'Fallback Song', artist = 'Artist - Topic') {
  return {
    contents: {
      videoRenderer: {
        videoId: id,
        title: { simpleText: title },
        ownerText: { simpleText: artist },
        thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }] },
      },
    },
  };
}

function musicSongPayload(id = 'music01', title = 'Signal', artist = 'Artist') {
  return {
    contents: {
      sectionListRenderer: {
        contents: [{
          musicShelfRenderer: {
            contents: [{
              musicResponsiveListItemRenderer: {
                playlistItemData: { videoId: id },
                thumbnail: {
                  musicThumbnailRenderer: {
                    thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }] },
                  },
                },
                flexColumns: [
                  {
                    musicResponsiveListItemFlexColumnRenderer: {
                      text: { runs: [{ text: title, navigationEndpoint: { watchEndpoint: { videoId: id } } }] },
                    },
                  },
                  {
                    musicResponsiveListItemFlexColumnRenderer: {
                      text: {
                        runs: [{
                          text: artist,
                          navigationEndpoint: {
                            browseEndpoint: {
                              browseId: 'UCartist',
                              browseEndpointContextSupportedConfigs: {
                                browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' },
                              },
                            },
                          },
                        }],
                      },
                    },
                  },
                ],
              },
            }],
          },
        }],
      },
    },
  };
}

test('search tries the YouTube Music WEB_REMIX client first and parses its song rows', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value === 'https://www.youtube.com/') return versionResponse();
    calls.push({ url: value, options, body: JSON.parse(options.body || '{}') });
    return jsonResponse(musicSongPayload());
  };

  try {
    const res = createResponse();
    await handler({ method: 'GET', query: { q: 'Artist Signal' } }, res);

    assert.equal(res.statusCode, 200);
    assert.ok(calls.length >= 1);
    assert.match(calls[0].url, /^https:\/\/music\.youtube\.com\/youtubei\/v1\/search/);
    assert.equal(calls[0].body?.context?.client?.clientName, 'WEB_REMIX');
    assert.equal(calls[0].options?.headers?.Origin, 'https://music.youtube.com');
    assert.equal(calls[0].options?.headers?.Referer, 'https://music.youtube.com/');
    assert.equal(calls[0].options?.headers?.['X-Youtube-Client-Name'], '67');
    assert.equal(res.body.items?.[0]?.id, 'music01');
    assert.equal(res.body.items?.[0]?.artist, 'Artist');
    assert.equal(res.body.source, 'youtube-music-innertube');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('search falls back to normal YouTube WEB when YouTube Music yields no usable tracks', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value === 'https://www.youtube.com/') return versionResponse();
    const body = JSON.parse(options.body || '{}');
    calls.push({ url: value, body });
    if (value.startsWith('https://music.youtube.com/')) return jsonResponse({ contents: {} });
    return jsonResponse(videoPayload());
  };

  try {
    const res = createResponse();
    await handler({ method: 'GET', query: { q: 'Fallback Song' } }, res);

    assert.equal(res.statusCode, 200);
    assert.ok(calls.length >= 2);
    assert.equal(calls[0].body?.context?.client?.clientName, 'WEB_REMIX');
    assert.equal(calls[1].body?.context?.client?.clientName, 'WEB');
    assert.equal(res.body.items?.[0]?.id, 'fallback01');
    assert.equal(res.body.source, 'youtube-web-fallback');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
