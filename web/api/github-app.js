import { normalizeGithubRepo } from '../shared/github-repo.js';
import { loadVitrApp, loadRepositoryApp } from '../server/github.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const app = String(req.query?.app || '').trim().toLowerCase();
  const repoInput = String(req.query?.repo || '').trim();
  if ((app && repoInput) || (!app && !repoInput)) return res.status(400).json({ error: 'Provide exactly one of app or repo.' });
  if (app && app !== 'vitr') return res.status(400).json({ error: 'Unsupported logical app.' });
  const repo = repoInput ? normalizeGithubRepo(repoInput) : null;
  if (repoInput && !repo) return res.status(400).json({ error: 'A valid GitHub repository is required.' });
  try {
    const data = app === 'vitr' ? await loadVitrApp() : await loadRepositoryApp(repo);
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'GitHub app lookup is temporarily unavailable.', detail: error instanceof Error ? error.message : String(error) });
  }
}
