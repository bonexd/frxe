const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const nativeArtwork = (value) => /^(https?:|file:)/i.test(String(value || '')) ? String(value) : '';
const repeatMode = (value) => ['off', 'queue', 'track'].includes(value) ? value : 'off';

export function buildMediaPlaybackSnapshot({
  track,
  queue = [],
  queueIndex = -1,
  prefs = {},
  playing = false,
  positionSeconds = 0,
  durationSeconds = 0,
}) {
  const durationValue = Number(durationSeconds);
  const duration = Number.isFinite(durationValue) && durationValue > 0 ? durationValue : null;
  const positionValue = Number(positionSeconds);
  const position = duration == null
    ? Math.max(0, Number.isFinite(positionValue) ? positionValue : 0)
    : clamp(positionValue, 0, duration);
  const hasTrack = Boolean(track);
  const index = Number.isInteger(queueIndex) ? queueIndex : -1;
  const items = Array.isArray(queue) ? queue : [];

  return {
    trackId: track?.id || track?.path || null,
    title: track?.title || null,
    artist: track?.artist || null,
    album: track?.album || null,
    artwork: nativeArtwork(track?.cover),
    durationSeconds: duration,
    positionSeconds: position,
    playing: Boolean(hasTrack && playing),
    volume: prefs.muted ? 0 : clamp(Number(prefs.volume ?? 1), 0, 1),
    shuffle: Boolean(prefs.shuffle),
    repeat: repeatMode(prefs.repeat),
    canNext: Boolean(hasTrack && index >= 0 && items.length > 1 && (index < items.length - 1 || prefs.repeat === 'queue' || prefs.shuffle)),
    canPrevious: Boolean(hasTrack && index > 0),
    canSeek: Boolean(hasTrack && duration != null),
  };
}

export async function applyNativeMediaCommand(context, payload) {
  if (!payload || typeof payload !== 'object') return false;

  const run = async (name, value, hasValue = false) => {
    const handler = context?.[name];
    if (typeof handler !== 'function') return false;
    if (hasValue) await handler(value);
    else await handler();
    return true;
  };

  switch (payload.action) {
    case 'play': return run('play');
    case 'pause': return run('pause');
    case 'toggle-play': return run('togglePlay');
    case 'next': return run('next');
    case 'previous': return run('previous');
    case 'stop': return run('stop');
    case 'seek-to': {
      const value = Number(payload.positionSeconds);
      return Number.isFinite(value) ? run('seekTo', value, true) : false;
    }
    case 'seek-by': {
      const value = Number(payload.offsetSeconds);
      return Number.isFinite(value) ? run('seekBy', value, true) : false;
    }
    case 'set-volume': {
      const value = Number(payload.volume);
      return Number.isFinite(value) ? run('setVolume', clamp(value, 0, 1), true) : false;
    }
    case 'set-shuffle':
      return typeof payload.enabled === 'boolean' ? run('setShuffle', payload.enabled, true) : false;
    case 'set-repeat':
      return ['off', 'queue', 'track'].includes(payload.mode) ? run('setRepeat', payload.mode, true) : false;
    default:
      return false;
  }
}
