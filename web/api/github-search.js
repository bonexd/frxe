import { searchRepositories } from '../server/github.js';

const ALLOWED_PLATFORMS = new Set(['windows', 'android', 'macos', 'linux', 'ios', 'recommended']);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const q = String(req.query?.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Search query is required.' });
  if (q.length > 80) return res.status(400).json({ error: 'Search query must be 80 characters or fewer.' });
  const platform = String(req.query?.platform || '').toLowerCase();
  if (platform && !ALLOWED_PLATFORMS.has(platform)) return res.status(400).json({ error: 'Unsupported platform filter.' });
  const page = Number.parseInt(req.query?.page || '1', 10);
  if (!Number.isInteger(page) || page < 1 || page > 10) return res.status(400).json({ error: 'Page must be between 1 and 10.' });
  try {
    const data = await searchRepositories(q, { platform, page });
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'GitHub search is temporarily unavailable.', detail: error instanceof Error ? error.message : String(error) });
  }
}
