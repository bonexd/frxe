import { normalizeGithubRepo } from '../shared/github-repo.js';
import { PLATFORMS, classifyReleaseAssets } from '../shared/release-classifier.js';
import { VITR_APP, mergeVitrSources } from '../shared/vitr-app.js';

const REQUEST_TIMEOUT_MS = 8000;
const API_ROOT = 'https://api.github.com';

function cleanVersion(value = '') {
  return String(value || '').trim().replace(/^v/i, '');
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'vitr-github-app-hub',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

export async function githubRequest(path, { fetchImpl = fetch } = {}) {
  const url = /^https?:\/\//i.test(path) ? path : `${API_ROOT}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { headers: githubHeaders(), signal: controller.signal });
    if (!response.ok) {
      const remaining = response.headers?.get?.('x-ratelimit-remaining');
      if (remaining === '0') throw new Error(`GitHub rate limit reached (${response.status}).`);
      throw new Error(`GitHub returned ${response.status}.`);
    }
    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('GitHub request timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function selectPublishedRelease(releases = []) {
  const published = (Array.isArray(releases) ? releases : []).filter((release) => !release.draft);
  return published.find((release) => !release.prerelease) || published[0] || null;
}

function groupAssets(assets) {
  return Object.fromEntries(PLATFORMS.map((platform) => [platform, assets.filter((asset) => asset.platform === platform)]));
}

function bestPlatformAsset(assets, platform) {
  return assets
    .filter((asset) => asset.installable && asset.platform === platform)
    .sort((a, b) => b.score - a.score || b.size - a.size)[0] || null;
}

export async function loadRepositoryRelease(repo, fetchImpl = fetch) {
  const canonical = normalizeGithubRepo(repo);
  if (!canonical) throw new Error('Invalid GitHub repository.');
  const releases = await githubRequest(`/repos/${canonical}/releases?per_page=10`, { fetchImpl });
  const selected = selectPublishedRelease(releases);
  if (!selected) {
    return {
      repo: canonical,
      version: '',
      prerelease: false,
      publishedAt: '',
      releaseUrl: `https://github.com/${canonical}/releases`,
      assets: [],
      platforms: groupAssets([]),
      availablePlatforms: [],
      recommendations: {},
    };
  }
  const assets = classifyReleaseAssets(selected.assets || []);
  const platforms = groupAssets(assets);
  const recommendations = Object.fromEntries(PLATFORMS.map((platform) => [platform, bestPlatformAsset(assets, platform)]));
  return {
    repo: canonical,
    version: cleanVersion(selected.tag_name || selected.name || ''),
    prerelease: Boolean(selected.prerelease),
    publishedAt: selected.published_at || selected.created_at || '',
    releaseUrl: selected.html_url || `https://github.com/${canonical}/releases`,
    assets,
    platforms,
    availablePlatforms: PLATFORMS.filter((platform) => platforms[platform].some((asset) => asset.installable)),
    recommendations,
  };
}

export async function searchRepositories(query, { platform = '', page = 1 } = {}, fetchImpl = fetch) {
  const q = String(query || '').trim().slice(0, 80);
  const safePage = Math.min(10, Math.max(1, Number.parseInt(page, 10) || 1));
  if (!q) return { items: [], page: safePage, hasMore: false };
  const params = new URLSearchParams({ q, sort: 'stars', order: 'desc', per_page: '8', page: String(safePage) });
  const data = await githubRequest(`/search/repositories?${params.toString()}`, { fetchImpl });
  const repos = Array.isArray(data?.items) ? data.items.slice(0, 8) : [];
  const releases = await Promise.allSettled(repos.map((item) => loadRepositoryRelease(item.full_name, fetchImpl)));
  let items = repos.map((item, index) => {
    const release = releases[index].status === 'fulfilled' ? releases[index].value : {
      assets: [], availablePlatforms: [], version: '', releaseUrl: `https://github.com/${item.full_name}/releases`,
    };
    const installableAssets = (release.assets || []).filter((asset) => asset.installable);
    const requested = platform && platform !== 'recommended' ? platform : '';
    const primaryAsset = requested
      ? bestPlatformAsset(installableAssets, requested)
      : [...installableAssets].sort((a, b) => b.score - a.score || b.size - a.size)[0] || null;
    return {
      repo: item.full_name,
      name: item.name,
      owner: item.owner?.login || '',
      description: item.description || '',
      url: item.html_url || `https://github.com/${item.full_name}`,
      stars: Number(item.stargazers_count || 0),
      latestVersion: release.version || '',
      releaseUrl: release.releaseUrl,
      assets: release.assets || [],
      availablePlatforms: release.availablePlatforms || [],
      primaryAsset,
      sourceOnly: installableAssets.length === 0,
    };
  });
  if (platform && platform !== 'recommended') items = items.filter((item) => item.availablePlatforms.includes(platform));
  items.sort((a, b) => Number(a.sourceOnly) - Number(b.sourceOnly) || b.stars - a.stars);
  return { items, page: safePage, hasMore: Number(data?.total_count || 0) > safePage * 8 };
}

export async function loadRepositoryApp(repo, fetchImpl = fetch) {
  const canonical = normalizeGithubRepo(repo);
  if (!canonical) throw new Error('Invalid GitHub repository.');
  const [meta, release] = await Promise.all([
    githubRequest(`/repos/${canonical}`, { fetchImpl }),
    loadRepositoryRelease(canonical, fetchImpl),
  ]);
  return {
    id: canonical.toLowerCase(),
    repo: canonical,
    name: meta.name || canonical.split('/')[1],
    owner: meta.owner?.login || canonical.split('/')[0],
    description: meta.description || '',
    url: meta.html_url || `https://github.com/${canonical}`,
    stars: Number(meta.stargazers_count || 0),
    ...release,
  };
}

export async function loadVitrApp(fetchImpl = fetch) {
  const settled = await Promise.allSettled(VITR_APP.sources.map((source) => loadRepositoryApp(source.repo, fetchImpl)));
  const sources = settled.map((result, index) => {
    const source = VITR_APP.sources[index];
    if (result.status === 'fulfilled') return result.value;
    return {
      repo: source.repo,
      name: source.repo.split('/')[1],
      description: '',
      url: `https://github.com/${source.repo}`,
      version: '',
      assets: [],
      platforms: groupAssets([]),
      availablePlatforms: [],
      error: result.reason instanceof Error ? result.reason.message : String(result.reason || ''),
    };
  });
  const merged = mergeVitrSources(sources);
  return {
    ...merged,
    description: sources.find((source) => source.description)?.description || 'Vitr music player by Blood.',
    url: 'https://github.com/voidnont/vitr',
  };
}
