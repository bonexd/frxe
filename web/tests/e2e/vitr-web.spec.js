import { expect, test } from '@playwright/test';

const TRACKS = [
  { id: 'dQw4w9WgXcQ', title: 'Signal', artist: 'Daft Punk', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', official: true },
  { id: 'M7lc1UVf-VE', title: 'Genesis', artist: 'Justice', thumbnail: 'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg', official: true },
  { id: 'aqz-KE-bpKQ', title: 'Midnight', artist: 'Daft Punk', thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg', official: false },
];


async function installFakePlayer(page) {
  await page.addInitScript(() => {
    class FakePlayer {
      constructor(_target, options = {}) {
        this.options = options;
        this.state = -1;
        this.current = 0;
        this.duration = 240;
        queueMicrotask(() => options.events?.onReady?.({ target: this }));
      }
      loadVideoById(id) { this.videoId = id; this.state = 1; this.options.events?.onStateChange?.({ target: this, data: 1 }); }
      playVideo() { this.state = 1; this.options.events?.onStateChange?.({ target: this, data: 1 }); }
      pauseVideo() { this.state = 2; this.options.events?.onStateChange?.({ target: this, data: 2 }); }
      stopVideo() { this.state = 0; }
      destroy() {}
      setVolume(value) { this.volume = value; }
      mute() { this.muted = true; }
      unMute() { this.muted = false; }
      seekTo(value) { this.current = value; }
      getCurrentTime() { return this.current; }
      getDuration() { return this.duration; }
      getPlayerState() { return this.state; }
    }
    window.YT = { Player: FakePlayer, PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  });
}

test.beforeEach(async ({ page }) => {
  await installFakePlayer(page);
});

async function mockMusicSearch(page, seen = []) {
  await page.route('**/api/youtube-search?*', async (route) => {
    const url = new URL(route.request().url());
    seen.push(url.searchParams.get('q') || '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: TRACKS }),
    });
  });
}

test('VITR 0.1.0 separates songs, artists, genres and related mixes', async ({ page }) => {
  const seen = [];
  await mockMusicSearch(page, seen);
  await page.goto('/music');

  await page.locator('.frxe-nav').getByRole('button', { name: 'Search' }).click();
  await page.getByRole('textbox', { name: 'Search VITR' }).fill('electronic');
  await page.getByRole('button', { name: 'Search music' }).click();

  for (const heading of ['Top Result', 'Songs', 'Artists', 'Genres', 'Related Mixes']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }

  await page.locator('.frxe069-genre-grid').getByRole('button', { name: 'Electronic', exact: true }).click();
  await expect.poll(() => seen.some((query) => query === 'Electronic music')).toBe(true);

  await page.locator('.frxe069-artist-grid').getByRole('button', { name: /Daft Punk/ }).click();
  await expect.poll(() => seen.some((query) => query === 'Daft Punk songs')).toBe(true);
});

test('VITR 0.1.0 creates a manual playlist, adds a searched song and plays it', async ({ page }) => {
  await mockMusicSearch(page);
  await page.goto('/music');

  const nav = page.locator('.frxe-nav');
  await nav.getByRole('button', { name: 'Library' }).click();
  await page.getByRole('textbox', { name: 'New playlist name' }).fill('Road Trip');
  await page.getByRole('button', { name: 'Create playlist' }).click();
  await expect(page.getByText('Road Trip', { exact: true })).toBeVisible();

  await nav.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('textbox', { name: 'Search VITR' }).fill('Signal');
  await page.getByRole('button', { name: 'Search music' }).click();

  const signalRow = page.locator('.frxe-result', { hasText: 'Signal' }).first();
  await signalRow.getByRole('button', { name: 'Add to playlist' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Road Trip/ }).click();

  await nav.getByRole('button', { name: 'Library' }).click();
  await page.getByRole('button', { name: /Road Trip/ }).first().click();
  await expect(page.locator('.frxe069-editor').getByText('Signal', { exact: true })).toBeVisible();
  await page.locator('.frxe069-editor').getByRole('button', { name: 'Play All' }).click();
  await expect(page.locator('.frxe-mini-player').getByText('Signal', { exact: true })).toBeVisible();
});
