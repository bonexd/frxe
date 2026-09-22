import { expect, test } from '@playwright/test';

const TRACKS = [
  { id: 'alpha', title: 'Alpha', artist: 'Artist A', thumbnail: 'https://i.ytimg.com/vi/alpha/hqdefault.jpg', official: true },
  { id: 'beta', title: 'Beta', artist: 'Artist B', thumbnail: 'https://i.ytimg.com/vi/beta/hqdefault.jpg', official: true },
];

async function installFakeYouTubePlayer(page) {
  await page.addInitScript(() => {
    class FakePlayer {
      constructor(_id, options) {
        this.options = options;
        this.state = 2;
        this.volume = 76;
        this.currentTime = 0;
        this.duration = 180;
        window.setTimeout(() => options.events.onReady?.({ target: this }), 0);
      }
      setVolume(value) { this.volume = Number(value); }
      mute() { this.muted = true; }
      unMute() { this.muted = false; }
      loadVideoById(id) {
        this.videoId = id;
        this.state = 1;
        this.options.events.onStateChange?.({ data: 1 });
      }
      getCurrentTime() { return this.currentTime; }
      getDuration() { return this.duration; }
      getPlayerState() { return this.state; }
      playVideo() { this.state = 1; this.options.events.onStateChange?.({ data: 1 }); }
      pauseVideo() { this.state = 2; this.options.events.onStateChange?.({ data: 2 }); }
      seekTo(value) { this.currentTime = Number(value); }
      destroy() {}
    }
    window.YT = { Player: FakePlayer, PlayerState: { PLAYING: 1, PAUSED: 2, CUED: 5, ENDED: 0 } };
  });
}

test('VITR mini player exposes previous, next and volume controls', async ({ page }) => {
  await installFakeYouTubePlayer(page);
  await page.route('**/api/youtube-search?*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: TRACKS }) });
  });

  await page.goto('/music');
  await page.locator('.frxe-nav').getByRole('button', { name: 'Search' }).click();
  await page.getByRole('textbox', { name: 'Search VITR' }).fill('Alpha');
  await page.getByRole('button', { name: 'Search music' }).click();
  await page.getByRole('button', { name: 'Play Alpha', exact: true }).first().click();

  const mini = page.locator('.frxe-mini-player');
  await expect(mini.getByText('Alpha', { exact: true })).toBeVisible();
  await mini.getByRole('button', { name: 'Next track' }).click();
  await expect(mini.getByText('Beta', { exact: true })).toBeVisible();
  await mini.getByRole('button', { name: 'Previous track' }).click();
  await expect(mini.getByText('Alpha', { exact: true })).toBeVisible();

  const volume = mini.getByRole('slider', { name: 'Mini player volume' });
  await expect(volume).toHaveValue('76');
  await volume.fill('20');
  await expect(volume).toHaveValue('20');

  const mute = mini.getByRole('button', { name: 'Mute' });
  await mute.click();
  await expect(mini.getByRole('button', { name: 'Unmute' })).toBeVisible();
});
