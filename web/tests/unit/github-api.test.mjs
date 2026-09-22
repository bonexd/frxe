import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPublishedRelease, loadRepositoryRelease, searchRepositories, loadRepositoryApp, loadVitrApp } from '../../server/github.js';

test('stable release wins over prerelease and drafts are ignored', () => {
  const selected = selectPublishedRelease([
    { draft: true, prerelease: false, tag_name: 'v3' },
    { draft: false, prerelease: true, tag_name: 'v2-beta' },
    { draft: false, prerelease: false, tag_name: 'v1' },
  ]);
  assert.equal(selected.tag_name, 'v1');
});

test('release loader classifies assets and returns platform groups', async () => {
  const fakeFetch = async () => new Response(JSON.stringify([
    { draft: false, prerelease: false, tag_name: 'v1.2.3', html_url: 'https://github.com/o/r/releases/tag/v1.2.3', published_at: '2026-09-14T00:00:00Z', assets: [
      { id: 1, name: 'App-x64.msi', size: 10, browser_download_url: 'https://github.com/o/r/releases/download/v1.2.3/App-x64.msi' },
      { id: 2, name: 'App-arm64.apk', size: 11, browser_download_url: 'https://github.com/o/r/releases/download/v1.2.3/App-arm64.apk' },
    ] },
  ]), { status: 200, headers: { 'content-type': 'application/json' } });
  const result = await loadRepositoryRelease('o/r', fakeFetch);
  assert.equal(result.version, '1.2.3');
  assert.equal(result.platforms.windows.length, 1);
  assert.equal(result.platforms.android.length, 1);
});

test('search trims/caps query, limits to 8 and ranks installable repos first', async () => {
  const seen = [];
  const fakeFetch = async (url) => {
    seen.push(String(url));
    if (String(url).includes('/search/repositories')) return Response.json({ items: [
      { full_name: 'a/source', name: 'source', owner: { login: 'a' }, description: 'source only', html_url: 'https://github.com/a/source', stargazers_count: 100 },
      { full_name: 'b/app', name: 'app', owner: { login: 'b' }, description: 'installer', html_url: 'https://github.com/b/app', stargazers_count: 1 },
    ], total_count: 2 });
    if (String(url).includes('/repos/a/source/releases')) return Response.json([]);
    if (String(url).includes('/repos/b/app/releases')) return Response.json([{ draft: false, prerelease: false, tag_name: 'v1', html_url: 'https://github.com/b/app/releases/tag/v1', assets: [{ id: 1, name: 'App-x64.msi', size: 1, browser_download_url: 'https://github.com/b/app/releases/download/v1/App-x64.msi' }] }]);
    throw new Error(`unexpected ${url}`);
  };
  const result = await searchRepositories('  ' + 'x'.repeat(100), {}, fakeFetch);
  assert.equal(result.items[0].repo, 'b/app');
  const searchUrl = new URL(seen.find((value) => value.includes('/search/repositories')));
  assert.equal(searchUrl.searchParams.get('per_page'), '8');
  assert.equal(searchUrl.searchParams.get('q').length, 80);
});

test('repository detail includes metadata and release data', async () => {
  const fakeFetch = async (url) => {
    if (String(url).endsWith('/repos/o/r')) return Response.json({ full_name: 'o/r', name: 'r', owner: { login: 'o' }, description: 'desc', html_url: 'https://github.com/o/r' });
    if (String(url).includes('/repos/o/r/releases')) return Response.json([]);
    throw new Error(`unexpected ${url}`);
  };
  const app = await loadRepositoryApp('o/r', fakeFetch);
  assert.equal(app.description, 'desc');
  assert.deepEqual(app.availablePlatforms, []);
});

test('Vitr detail reads the canonical repository', async () => {
  const seen = [];
  const fakeFetch = async (url) => {
    const value = String(url); seen.push(value);
    if (value.endsWith('/repos/voidnont/vitr')) return Response.json({ full_name: 'voidnont/vitr', name: 'vitr', owner: { login: 'bloodvitr' }, description: 'Vitr', html_url: 'https://github.com/voidnont/vitr' });
    if (value.includes('/repos/voidnont/vitr/releases')) return Response.json([{ draft: false, prerelease: false, tag_name: 'v0.7.0', assets: [{ id: 1, name: 'Vitr-0.7.0-arm64.apk', size: 1, browser_download_url: 'https://github.com/voidnont/vitr/releases/download/v0.7.0/Vitr.apk' }] }]);
    throw new Error(`unexpected ${url}`);
  };
  const app = await loadVitrApp(fakeFetch);
  assert.deepEqual(app.availablePlatforms, ['android']);
  assert.equal(app.url, 'https://github.com/voidnont/vitr');
  assert.ok(seen.some((value) => value.includes('/voidnont/vitr/releases')));
});
test('rate limit errors are explicit', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ message: 'rate limited' }), { status: 403, headers: { 'x-ratelimit-remaining': '0', 'content-type': 'application/json' } });
  await assert.rejects(() => loadRepositoryRelease('o/r', fakeFetch), /rate limit/i);
});
