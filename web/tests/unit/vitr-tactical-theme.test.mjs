import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('nont.me is the actual Vitr dark/glass site, not a mockup gallery', () => {
  const css = read('src/styles.css');
  const app = read('src/App.jsx');

  assert.match(css, /--bg:#050811/);
  assert.match(css, /--accent:#ff2b63/);
  assert.match(app, /Your music\./);
  assert.match(app, /THE EXPERIENCE/);
  assert.match(app, /Modern Dark/);
  assert.match(app, /Liquid Glass/);
  assert.match(app, /SAME VITR, EVERYWHERE/);
  assert.doesNotMatch(app, /DesktopShowcase|PhoneShowcase|showcase-desktop|showcase-phone|Neon Skies/);
});

test('nont.me keeps real functionality inside the reference-inspired design', () => {
  const css = read('src/styles.css');
  const app = read('src/App.jsx');

  assert.match(app, /heroAction/);
  assert.match(app, /VITR_RELEASES_URL/);
  assert.match(app, /https:\/\/vitr\.nont\.me/);
  assert.match(app, /Search GitHub apps/);
  assert.match(app, /mobile-dock/);
  assert.match(css, /\.hero-section\{/);
  assert.match(css, /\.glass-panel\{/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('Vitr Web uses the same navy, pink and glass design system', () => {
  const css = read('src/music/music.css');
  const webCss = read('src/music/vitr-web.css');

  assert.match(css, /--vitr-accent:#ff2b63/);
  assert.match(css, /--vitr-navy:#050811/);
  assert.match(css, /\.frxe-glass\{[\s\S]*?border-radius:18px/);
  assert.match(css, /@media\(min-width:901px\)[\s\S]*?\.frxe-nav\{[\s\S]*?width:218px/);
  assert.match(css, /\[data-vitr-finish="glass"\] \.frxe-glass/);
  assert.match(webCss, /Vitr dark \+ liquid glass refinements/);
  assert.doesNotMatch(css, /--vitr-blood:#b51218/);
});

test('Vitr Web exposes a real Modern Dark / Liquid Glass appearance toggle', () => {
  const app = read('src/music/VitrWebApp.tsx');

  assert.match(app, /data-vitr-finish=\{finish\}/);
  assert.match(app, /Appearance: \{finish === 'glass' \? 'Liquid Glass' : 'Modern Dark'\}/);
  assert.match(app, /finish: 'dark'/);
  assert.match(app, /setFinish/);
});

test('theme does not copy unrelated game branding or assets', () => {
  const app = read('src/App.jsx');
  const css = read('src/styles.css');
  const music = read('src/music/music.css');

  for (const source of [app, css, music]) {
    assert.doesNotMatch(source, /marathonthegame|Bungie|TAU CETI|MARATHON LOGO/i);
  }
});
