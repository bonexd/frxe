import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { console.error(`VALIDATION FAILED: ${message}`); process.exitCode = 1; };
const expect = (condition, message) => { if (!condition) fail(message); };

const pkg = JSON.parse(read('package.json'));
const versionFile = read('VERSION').trim();
const main = read('src/main.jsx');
const siteMode = read('src/site-mode.js');
const music = read('src/music/VitrWebApp.tsx');
const musicCss = read('src/music/music.css');
const webPlayerCss = read('src/music/vitr-web.css');
const youtubeLoader = read('src/music/youtubeIframeApi.js');
const resetHelper = read('src/music/resetWebPlayer.js');
const searchApi = read('api/youtube-search.js');
const sharedMusic = read('src/shared/musicSearch.js');
const playwright = read('playwright.config.js');
const e2e = read('tests/e2e/nont.spec.js');
const webOnlyUnit = read('tests/unit/web-player-only.test.mjs');
const ci = read('../.github/workflows/ci.yml');
const vercel = read('vercel.json');
const index = read('index.html');

expect(pkg.version === versionFile, `package.json (${pkg.version}) and VERSION (${versionFile}) must match`);
expect(index.includes('<title>Vitr</title>'), 'public HTML title must remain Vitr');
expect(index.includes('href="/vitr-icon.png"'), 'Vitr favicon must remain local');
expect(fs.existsSync('public/vitr-icon.png'), 'Vitr favicon must exist');

expect(main.includes("import('./music/VitrWebApp.tsx')"), 'Vitr routes must load the web player');
expect(main.includes("import('./App.jsx')"), 'nont.me root must load the standalone release page');
expect(main.includes('isVitrWebLocation'), 'bootstrap must keep root and web-player routing separate');
expect(!main.includes('backgroundAudioPlayer'), 'root must not use the retired server-relay audio adapter');
expect(siteMode.includes("host === 'vitr.nont.me'"), 'vitr.nont.me must remain the official Vitr host');
expect(!siteMode.includes('music.nont.me'), 'music.nont.me must stay retired in favor of vitr.nont.me');

expect(music.includes("type Tab = 'home' | 'search' | 'library' | 'settings'"), 'web player must expose exactly four product tabs');
expect(!music.includes("tab === 'save'"), 'extractor/download Save tab must stay removed');
expect(!music.includes('/api/media-extract'), 'web player must not call the retired extraction endpoint');
expect(!music.includes('/api/audio-stream'), 'web player must not call the retired audio relay');
expect(music.includes('loadYouTubeIframeApi'), 'web player must load browser-native YouTube playback');
expect(music.includes('Reset VITR Web'), 'Settings must expose the reset action');
expect(music.includes('resetVitrWebStorage(localStorage)'), 'reset must clear Vitr-owned local data');
expect(music.includes('window.location.reload()'), 'reset must reload the current Vitr web route');

expect(youtubeLoader.includes('https://www.youtube.com/iframe_api'), 'playback must use the credential-free YouTube IFrame API');
expect(!youtubeLoader.includes('token') && !youtubeLoader.includes('apiKey'), 'playback loader must not require credentials');
expect(resetHelper.includes("'vitr.web.'"), 'reset must clear Vitr web data');

expect(searchApi.includes('../src/shared/musicSearch.js'), 'music search API must use shared ranking logic');
expect(searchApi.includes('apiKeyRequired: false'), 'music search must remain API-key free');
expect(sharedMusic.includes('mergeAndRankMusicResults'), 'music search ranking must remain available');

expect(musicCss.includes('--vitr-accent:#ff2b63'), 'Vitr Web must use the shared pink accent system');
expect(musicCss.includes('--vitr-navy:#050811'), 'Vitr Web must use the shared dark navy base');
expect(music.includes('data-vitr-finish={finish}'), 'Vitr Web must expose its real appearance finish on the app root');
expect(music.includes("setFinish('normal')") && music.includes("setFinish('glass')") && music.includes("setFinish('blood')") && music.includes('Blood Crystallized'), 'Vitr Web must expose Normal, Liquid Glass and Blood Crystallized finishes');
expect(musicCss.includes('prefers-reduced-motion'), 'web player must retain reduced-motion support');
expect(webPlayerCss.includes('.frxe069-reset'), 'reset control must have explicit Vitr styling');
expect(musicCss.includes('[data-vitr-finish="glass"] .frxe-glass'), 'Liquid Glass must have real player styling');

for (const retired of [
  'api/audio-stream.js',
  'api/media-extract.js',
  'src/music/backgroundAudioPlayer.js',
  'src/shared/extractorContract.js',
  'render.yaml',
  'extractor-worker',
]) {
  expect(!fs.existsSync(retired), `${retired} must stay removed from the zero-config web player`);
}

function sourceFiles(root) {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isFile()) return [root];
  return fs.readdirSync(root).flatMap((name) => sourceFiles(path.join(root, name)));
}

for (const file of ['README.md', ...['src', 'api'].flatMap(sourceFiles)]) {
  if (!/\.(?:js|jsx|mjs|ts|tsx|md|json|css)$/i.test(file)) continue;
  const text = read(file);
  expect(!/EXTRACTOR_WORKER_(?:URL|TOKEN)/.test(text), `${file} must not require extractor worker configuration`);
}

expect(vercel.includes('https://www.youtube.com'), 'production CSP must allow the YouTube player');
expect(vercel.includes('frame-src https://www.youtube.com'), 'production CSP must allow YouTube playback frames');
expect(vercel.includes('Content-Security-Policy'), 'production CSP must remain configured');
expect(vercel.includes('X-Content-Type-Options'), 'content type hardening must remain configured');

expect(pkg.devDependencies?.['@playwright/test'], 'Playwright must remain installed');
expect(pkg.scripts?.['test:unit'], 'unit tests must remain runnable');
expect(pkg.scripts?.['test:e2e'], 'browser E2E tests must remain runnable');
expect(playwright.includes("testDir: './tests/e2e'"), 'Playwright must target the E2E suite');
expect(e2e.includes('nont.me is the real Vitr landing page, not a mockup gallery'), 'E2E must protect the real nont.me landing experience');
expect(e2e.includes('https://vitr.nont.me'), 'E2E must protect the official Vitr host link');
expect(e2e.includes('/music opens the four-tab Vitr web player'), 'E2E must cover the dedicated Vitr web route');
expect(e2e.includes('Vitr Web exposes Normal, Liquid Glass and Blood Crystallized finishes'), 'E2E must cover the three-finish player appearance system');
expect(e2e.includes('search result starts browser playback without a worker'), 'E2E must cover browser playback');
expect(e2e.includes('Reset VITR Web clears Vitr data and stays on the web player'), 'E2E must cover reset without leaving the player');
expect(webOnlyUnit.includes('playback uses the credential-free YouTube iframe API'), 'unit suite must lock credential-free playback');

expect(ci.includes('npm run test:unit'), 'CI must run JS unit tests');
expect(ci.includes('npm run test:e2e:ci'), 'CI must run browser E2E tests');
expect(!ci.includes('python') && !ci.includes('extractor-worker'), 'CI must not install or test a retired extractor worker');

if (process.exitCode) process.exit(process.exitCode);
console.log(`Validation passed for Vitr web player v${pkg.version}.`);
