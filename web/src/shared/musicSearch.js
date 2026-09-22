export function normalizeCatalogText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*(official|video|audio|lyrics?|visualizer|hd|4k)[^)]*\)/g, ' ')
    .replace(/\[[^\]]*(official|video|audio|lyrics?|visualizer|hd|4k)[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function cleanDisplayTitle(value = '') {
  const original = String(value).trim();
  const clean = original
    .replace(/\s*[\[(](?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|lyric\s+video|visualizer|hd|4k|hq|mv)[^\])]?[\])]/gi, ' ')
    .replace(/\s*[|·•-]\s*(?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visualizer|hd|4k|hq)\s*$/gi, ' ')
    .replace(/\s+official\s+(?:music\s+)?(?:video|audio)\s*$/gi, ' ')
    .replace(/\s+(?:lyrics?|lyric\s+video|visualizer)\s*$/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean || original;
}

export function cleanArtistName(value = '') {
  const original = String(value).trim();
  const clean = original
    .replace(/\s*[-–—]\s*topic\s*$/i, '')
    .replace(/vevo\s*$/i, '')
    .replace(/\s*[-–—]?\s*official\s+(?:artist\s+)?channel\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean || original;
}

export function buildProviderMusicQuery(value = '') {
  const clean = String(value).trim();
  if (!clean) return clean;
  const alreadyMusicFocused = /\b(song|songs|music|audio|lyrics?|official|album|artist|playlist|remix|instrumental|soundtrack|ep|single|radio|mix)\b/i.test(clean);
  return alreadyMusicFocused ? clean : `${clean} song`;
}

export function refineMusicMetadata(input = {}) {
  const originalTitle = String(input.title || '').trim();
  const originalArtist = String(input.artist || '').trim();
  let title = cleanDisplayTitle(originalTitle);
  let artist = cleanArtistName(originalArtist);
  const genericArtist = !artist || /^(youtube|youtube music|unknown artist)$/i.test(artist);
  const split = title.match(/^(.{2,80}?)\s+[-–—]\s+(.{2,160})$/);

  if (split && genericArtist) {
    artist = cleanArtistName(split[1]);
    title = cleanDisplayTitle(split[2]);
  } else if (split && artist && normalizeCatalogText(split[1]) === normalizeCatalogText(artist)) {
    title = cleanDisplayTitle(split[2]);
  }

  return {
    ...input,
    title: title || originalTitle,
    artist: artist || originalArtist || 'YouTube',
  };
}

export function scoreMusicResult(item, query = '') {
  const text = `${item?.title || ''} ${item?.artist || ''}`.toLowerCase();
  const q = normalizeCatalogText(query);
  let score = 0;

  if (item?.official) score += 40;
  if (item?.topic || item?.vevo) score += 20;
  if (item?.titleOfficial) score += 8;
  if (/\b(audio|lyrics?|music|song|remix|album|single)\b/i.test(text)) score += 5;
  if (q && normalizeCatalogText(`${item?.artist || ''} ${item?.title || ''}`).includes(q)) score += 10;
  if (/\b(reaction|review|interview|podcast|trailer|gameplay|tutorial|cover by|karaoke)\b/i.test(text)) score -= 25;
  if (/\b(shorts?|tiktok|edit|fanmade|fan made)\b/i.test(text)) score -= 12;

  return score;
}

export function musicIdentityKey(item = {}) {
  const refined = refineMusicMetadata(item);
  return `${normalizeCatalogText(refined.artist)}|${normalizeCatalogText(refined.title)}`;
}

export function mergeAndRankMusicResults(items = [], query = '', limit = 30) {
  const deduped = new Map();

  for (const rawItem of Array.isArray(items) ? items : []) {
    const item = refineMusicMetadata(rawItem);
    const key = musicIdentityKey(item);
    if (!key || key === '|') continue;
    const scored = { ...item, __score: scoreMusicResult(item, query) };
    const previous = deduped.get(key);
    if (!previous || scored.__score > previous.__score) deduped.set(key, scored);
  }

  return [...deduped.values()]
    .sort((a, b) => b.__score - a.__score)
    .slice(0, Math.max(1, limit))
    .map(({ __score, ...item }) => item);
}
