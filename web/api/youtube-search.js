import {
  buildProviderMusicQuery,
  mergeAndRankMusicResults,
  refineMusicMetadata,
} from '../src/shared/musicSearch.js';

let cachedClientVersion = null;
let cachedClientVersionAt = 0;

const FALLBACK_CLIENT_VERSIONS = [
  '2.20260114.08.00',
  '2.20240916.00.00',
];
const MUSIC_CLIENT_VERSION = '1.20260114.03.00';
const MUSIC_CLIENT_ID = '67';
const MUSIC_SEARCH_PARAMS = 'EgWKAQIIAQ%3D%3D';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 8000;

function textOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.simpleText === 'string') return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run?.text || '').join('');
  return '';
}

function runsOf(value) {
  return Array.isArray(value?.runs) ? value.runs : [];
}

function thumbnailOf(renderer, id) {
  const direct = renderer?.thumbnail?.thumbnails;
  const nested = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
  const thumbnails = Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : [];
  return thumbnails.at(-1)?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function durationOf(renderer) {
  return textOf(renderer?.lengthText) ||
    textOf(renderer?.thumbnailOverlays?.find?.((entry) => entry?.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text) ||
    null;
}

function rawArtistOf(renderer) {
  return textOf(renderer?.ownerText) || textOf(renderer?.shortBylineText) || textOf(renderer?.longBylineText) || 'YouTube';
}

function musicColumns(renderer) {
  return Array.isArray(renderer?.flexColumns)
    ? renderer.flexColumns.map((entry) => entry?.musicResponsiveListItemFlexColumnRenderer?.text).filter(Boolean)
    : [];
}

function musicVideoId(renderer) {
  const direct = renderer?.playlistItemData?.videoId;
  if (direct) return direct;
  for (const column of musicColumns(renderer)) {
    for (const run of runsOf(column)) {
      const id = run?.navigationEndpoint?.watchEndpoint?.videoId;
      if (id) return id;
    }
  }
  return '';
}

function musicArtistOf(renderer) {
  const columns = musicColumns(renderer).slice(1);
  for (const column of columns) {
    const artistRun = runsOf(column).find((run) => (
      run?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_ARTIST'
    ));
    if (artistRun?.text) return String(artistRun.text).trim();
  }

  const fallbackRuns = columns.flatMap((column) => runsOf(column));
  const candidate = fallbackRuns.find((run) => {
    const text = String(run?.text || '').trim();
    return text && text !== '•' && !/^(song|video|album|single|ep)$/i.test(text);
  });
  return String(candidate?.text || 'YouTube Music').trim();
}

function musicDurationOf(renderer) {
  const texts = [
    ...(renderer?.flexColumns || []).map((entry) => entry?.musicResponsiveListItemFlexColumnRenderer?.text),
    ...(renderer?.fixedColumns || []).map((entry) => entry?.musicResponsiveListItemFixedColumnRenderer?.text),
  ];
  for (const value of texts) {
    for (const run of runsOf(value)) {
      const text = String(run?.text || '').trim();
      if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return text;
    }
  }
  return null;
}

function officialInfo(renderer, rawArtist, title) {
  const badgeText = JSON.stringify([renderer?.ownerBadges, renderer?.badges]);
  const topic = /\s[-–—]\s*topic\s*$/i.test(rawArtist);
  const vevo = /vevo\s*$/i.test(rawArtist);
  const verifiedArtist = /OFFICIAL_ARTIST|VERIFIED_ARTIST|Official Artist Channel/i.test(badgeText);
  const channelOfficial = /official(?:\s+artist)?\s+channel/i.test(rawArtist);
  const titleOfficial = /\bofficial\b.*\b(video|audio|music)\b/i.test(title);
  return {
    official: verifiedArtist || topic || vevo || channelOfficial,
    topic,
    vevo,
    titleOfficial,
  };
}

function pushTrack(out, seen, renderer, { id, rawTitle, rawArtist, duration = null, publishedAt = null }) {
  if (!id || !rawTitle || seen.has(id)) return;
  seen.add(id);
  const official = officialInfo(renderer, rawArtist, rawTitle);
  const metadata = refineMusicMetadata({ title: rawTitle, artist: rawArtist });
  out.push({
    id,
    title: metadata.title,
    artist: metadata.artist,
    thumbnail: thumbnailOf(renderer, id),
    duration,
    publishedAt,
    official: official.official,
    topic: official.topic,
    vevo: official.vevo,
    titleOfficial: official.titleOfficial,
  });
}

function collectVideos(node, out, seen) {
  if (!node || out.length >= 60) return;
  if (Array.isArray(node)) {
    for (const child of node) collectVideos(child, out, seen);
    return;
  }
  if (typeof node !== 'object') return;

  for (const [key, child] of Object.entries(node)) {
    if (key === 'musicResponsiveListItemRenderer') {
      const columns = musicColumns(child);
      pushTrack(out, seen, child, {
        id: musicVideoId(child),
        rawTitle: textOf(columns[0]),
        rawArtist: musicArtistOf(child),
        duration: musicDurationOf(child),
      });
    } else if (key === 'videoRenderer' || key === 'compactVideoRenderer' || key === 'playlistVideoRenderer') {
      pushTrack(out, seen, child, {
        id: child?.videoId,
        rawTitle: textOf(child?.title),
        rawArtist: rawArtistOf(child),
        duration: durationOf(child),
        publishedAt: textOf(child?.publishedTimeText) || null,
      });
    }
    collectVideos(child, out, seen);
  }
}

async function resolveClientVersion() {
  const now = Date.now();
  if (cachedClientVersion && now - cachedClientVersionAt < 6 * 60 * 60 * 1000) return cachedClientVersion;

  try {
    const response = await fetch('https://www.youtube.com/', {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      const html = await response.text();
      const match = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/) || html.match(/"clientVersion":"([^"]+)"/);
      if (match?.[1]) {
        cachedClientVersion = match[1];
        cachedClientVersionAt = now;
        return cachedClientVersion;
      }
    }
  } catch { /* fall through */ }
  return FALLBACK_CLIENT_VERSIONS[0];
}

async function runInnerTubeSearch(query, {
  host,
  clientName,
  clientVersion,
  clientId,
  params,
}) {
  const origin = `https://${host}`;
  const response = await fetch(`${origin}/youtubei/v1/search?prettyPrint=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      Referer: `${origin}/`,
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Youtube-Client-Name': clientId,
      'X-Youtube-Client-Version': clientVersion,
    },
    body: JSON.stringify({
      context: { client: { clientName, clientVersion, hl: 'en', gl: 'US' } },
      query,
      ...(params ? { params } : {}),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${clientName} search returned ${response.status}`);
  return response.json();
}

function rankedResults(payload, query) {
  const items = [];
  collectVideos(payload, items, new Set());
  return mergeAndRankMusicResults(items, query, 30)
    .map(({ titleOfficial, ...item }) => item);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const q = String(req.query?.q || '').trim().slice(0, 120);
  if (!q) return res.status(400).json({ error: 'Enter a search term.' });

  let lastError = null;
  try {
    try {
      const musicPayload = await runInnerTubeSearch(q, {
        host: 'music.youtube.com',
        clientName: 'WEB_REMIX',
        clientVersion: MUSIC_CLIENT_VERSION,
        clientId: MUSIC_CLIENT_ID,
        params: MUSIC_SEARCH_PARAMS,
      });
      const musicResults = rankedResults(musicPayload, q);
      if (musicResults.length) {
        res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600');
        return res.status(200).json({
          items: musicResults,
          source: 'youtube-music-innertube',
          apiKeyRequired: false,
          providerQueryAdjusted: false,
        });
      }
    } catch (error) {
      lastError = error;
    }

    const discovered = await resolveClientVersion();
    const versions = [...new Set([discovered, ...FALLBACK_CLIENT_VERSIONS])];
    const providerQuery = buildProviderMusicQuery(q);
    let fallbackPayload = null;

    for (const version of versions) {
      try {
        fallbackPayload = await runInnerTubeSearch(providerQuery, {
          host: 'www.youtube.com',
          clientName: 'WEB',
          clientVersion: version,
          clientId: '1',
        });
        if (fallbackPayload) break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!fallbackPayload) throw lastError || new Error('YouTube search failed.');

    const results = rankedResults(fallbackPayload, q);
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600');
    return res.status(200).json({
      items: results,
      source: 'youtube-web-fallback',
      apiKeyRequired: false,
      providerQueryAdjusted: providerQuery !== q,
    });
  } catch (error) {
    return res.status(502).json({
      error: 'YouTube Music search is temporarily unavailable, and the YouTube fallback also failed.',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
