const PART = /^[A-Za-z0-9_.-]+$/;
const validPart = (value) => PART.test(value) && value !== '.' && value !== '..';

export function normalizeGithubRepo(value = '') {
  const input = String(value).trim();
  const direct = input.match(/^([^/]+)\/([^/]+)$/);
  if (direct) {
    const owner = direct[1];
    const repo = direct[2].replace(/\.git$/i, '');
    return validPart(owner) && validPart(repo) ? `${owner}/${repo}` : null;
  }
  try {
    const url = new URL(input);
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    return validPart(owner) && validPart(repo) ? `${owner}/${repo}` : null;
  } catch {
    return null;
  }
}
