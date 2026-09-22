import fs from 'node:fs';
import path from 'node:path';
import { inferSourceContract } from '../shared/source-contract.js';

const RELEASE_VERSION = fs
  .readFileSync(new URL('../VERSION', import.meta.url), 'utf8')
  .trim();

const SOURCE = {
  repo: 'bloodvitr/vitr',
  kind: 'vitr',
  appSourcePaths: [
    'app/src/main/java/com/vitr/music/ui/VitrApp.kt',
    'app/src/main/java/com/vitr/music/ui/screens/NowPlayingScreen.kt',
    'app/src/main/java/com/vitr/music/ui/screens/SearchScreen.kt',
  ],
};

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'vitr-source-adapter',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function text(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function json(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function raw(repo, branch, sourcePath) {
  return text(`https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${sourcePath}`, {
    headers: { 'User-Agent': headers['User-Agent'] },
  });
}

async function inspectVitr() {
  const meta = await json(`https://api.github.com/repos/${SOURCE.repo}`);
  const branch = meta.default_branch || 'main';
  const tree = await json(`https://api.github.com/repos/${SOURCE.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const sourcePaths = Array.isArray(tree?.tree) ? tree.tree.map((entry) => entry.path).filter(Boolean) : [];
  const appSources = await Promise.all(
    SOURCE.appSourcePaths.map((sourcePath) => raw(SOURCE.repo, branch, sourcePath).catch(() => '')),
  );
  const pkg = {
    version: RELEASE_VERSION,
    name: 'vitr',
    description: 'VITR liquid-glass music player',
    scripts: { android: 'gradle' },
  };
  return {
    repo: SOURCE.repo,
    defaultBranch: branch,
    treeSha: tree?.sha || '',
    pushedAt: meta.pushed_at || '',
    ...inferSourceContract({ repo: SOURCE.repo, pkg, sourcePaths, appSource: appSources.join('\n') }),
  };
}

const manifestPath = path.join('src', 'generated', 'source-manifest.json');
let previousManifest = {};
try { previousManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { previousManifest = {}; }

function previousVitr() {
  const entry = Object.entries(previousManifest).find(([key]) => key.toLowerCase() === SOURCE.repo.toLowerCase());
  return entry?.[1] || null;
}

let inspected;
try {
  inspected = await inspectVitr();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`${SOURCE.repo}: source unavailable (${message}); preserving last known VITR metadata.`);
  const previous = previousVitr();
  inspected = previous
    ? { ...previous, repo: SOURCE.repo, syncError: message }
    : { repo: SOURCE.repo, defaultBranch: 'main', treeSha: '', pushedAt: '', version: '', name: 'vitr', description: '', platforms: [], capabilities: [], syncError: message };
}

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify({ [SOURCE.repo]: inspected }, null, 2)}\n`);

console.log(`${SOURCE.repo}: v${inspected.version || 'unknown'} | ${inspected.platforms?.join(', ') || 'platform unknown'}${inspected.syncError ? ` | preserved: ${inspected.syncError}` : ''}`);
