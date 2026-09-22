import youtubedl from 'youtube-dl-exec';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const q = String(req.query?.q || '').trim().slice(0, 120);
  if (!q) return res.status(400).json({ error: 'Enter a search term.' });

  try {
    const output = await youtubedl(`ytsearch30:${q}`, {
      flatPlaylist: true,
      skipDownload: true,
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
    }, {
      timeout: 15000,
    });

    const payload = typeof output === 'string' ? JSON.parse(output) : output;
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    const items = entries
      .map((entry) => String(entry?.id || '').trim())
      .filter((id) => VIDEO_ID.test(id))
      .filter((id, index, all) => all.indexOf(id) === index)
      .slice(0, 30)
      .map((id) => ({ id }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=180');
    return res.status(200).json({
      items,
      source: 'yt-dlp',
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({
      error: 'yt-dlp search is temporarily unavailable.',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
