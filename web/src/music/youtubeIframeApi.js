let loadingPromise = null;

export function loadYouTubeIframeApi(win = window, doc = document) {
  if (win.YT?.Player) return Promise.resolve(win.YT);
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const existingCallback = win.onYouTubeIframeAPIReady;
    const finish = () => {
      try { if (typeof existingCallback === 'function') existingCallback(); } catch {}
      if (win.YT?.Player) resolve(win.YT);
      else reject(new Error('YouTube player API loaded without a Player implementation.'));
    };

    win.onYouTubeIframeAPIReady = finish;

    let script = doc.querySelector('script[data-vitr-youtube-player-api]');
    if (!script) {
      script = doc.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.vitrYoutubePlayerApi = 'true';
      (doc.head || doc.documentElement).appendChild(script);
    }

    script.addEventListener('error', () => {
      loadingPromise = null;
      reject(new Error('VITR could not load the YouTube playback engine.'));
    }, { once: true });
  });

  return loadingPromise;
}
