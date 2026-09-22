import { normalizeGithubRepo } from '../shared/github-repo.js';
import { loadRepositoryRelease } from '../server/github.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const repo = normalizeGithubRepo(req.query?.repo || '');
  if (!repo) return res.status(400).json({ error: 'A valid GitHub repository is required.' });
  try {
    const data = await loadRepositoryRelease(repo);
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'GitHub release lookup is temporarily unavailable.', detail: error instanceof Error ? error.message : String(error) });
  }
}
