import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readWeb = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const readRoot = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('landing page version stays synchronized with canonical Vitr version', () => {
  const version = readWeb('VERSION').trim();
  const app = readWeb('src/App.jsx');
  const sync = readRoot('scripts/sync-version.mjs');

  assert.match(app, new RegExp(`const VERSION = '${escapeRegExp(version)}';`));
  assert.match(sync, /web\/src\/App\.jsx/);
  assert.match(sync, /const VERSION/);
});

test('Vitr Web has an explicit Windows-aligned responsive shell layer', () => {
  const css = readWeb('src/music/vitr-web.css');

  assert.match(css, /Windows application parity shell/);
  assert.match(css, /--vitr-window-sidebar:218px/);
  assert.match(css, /--vitr-window-radius:18px/);
  assert.match(css, /\.frxe069-app \.frxe-nav\{[\s\S]*?backdrop-filter:blur\(24px\)/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*?padding-bottom:calc\(118px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /@media\(max-width:640px\)[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test('nont.me reuses the same adaptive Vitr shell language', () => {
  const css = readWeb('src/styles.css');

  assert.match(css, /Windows-aligned Vitr landing shell/);
  assert.match(css, /--vitr-shell-rail:218px/);
  assert.match(css, /\.landing-shell \.hero-window\{[\s\S]*?backdrop-filter:blur\(24px\)/);
  assert.match(css, /\.landing-shell\.is-mobile-device \.hero-section/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.landing-shell \.site-header/);
  assert.match(css, /@media\(max-width:640px\)[\s\S]*?padding-bottom:calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
});
