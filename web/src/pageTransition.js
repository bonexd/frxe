export const PAGE_TRANSITION_PANEL_COUNT = 4;
export const PAGE_TRANSITION_DURATION_MS = 780;

export function transitionLabelFor(pathname = '/') {
  const path = String(pathname || '/').toLowerCase();
  if (path === '/music' || path.startsWith('/music/')) return 'VITR / WEB';
  if (path === '/' || path === '') return 'VITR / HOME';
  return 'VITR / NEXT';
}

export function shouldTransitionNavigation({
  href,
  currentOrigin,
  currentHref,
  target = '',
  download = false,
  button = 0,
  metaKey = false,
  ctrlKey = false,
  shiftKey = false,
  altKey = false,
} = {}) {
  if (!href || target === '_blank' || download || button !== 0 || metaKey || ctrlKey || shiftKey || altKey) return false;

  try {
    const next = new URL(href, currentHref || currentOrigin || 'http://localhost/');
    const current = new URL(currentHref || currentOrigin || 'http://localhost/');
    if (!['http:', 'https:'].includes(next.protocol)) return false;
    if (next.origin !== (currentOrigin || current.origin)) return false;

    const nextPage = `${next.pathname}${next.search}`;
    const currentPage = `${current.pathname}${current.search}`;
    if (nextPage === currentPage) return false;
    return true;
  } catch {
    return false;
  }
}

function markup(label) {
  const panels = Array.from({ length: PAGE_TRANSITION_PANEL_COUNT }, (_, index) =>
    `<span class="vitr-page-transition__panel" style="--panel-forward:${index * 55}ms;--panel-reverse:${(PAGE_TRANSITION_PANEL_COUNT - 1 - index) * 55}ms" aria-hidden="true"></span>`,
  ).join('');

  return `
    <div class="vitr-page-transition__panels">${panels}</div>
    <div class="vitr-page-transition__chrome" aria-hidden="true">
      <span class="vitr-page-transition__index">VTR / 0${PAGE_TRANSITION_PANEL_COUNT}</span>
      <strong class="vitr-page-transition__label">${label}</strong>
      <span class="vitr-page-transition__status">LOADING EXPERIENCE</span>
    </div>
    <div class="vitr-page-transition__word" aria-hidden="true">VITR</div>
  `;
}

export function createPageTransition({
  document,
  window,
  navigate = (href) => { window.location.href = href; },
} = globalThis) {
  let root = null;
  let navigateTimer = null;
  let cleanupTimer = null;
  let mounted = false;
  const reducedMotion = Boolean(window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

  function setLabel(pathname) {
    const label = root?.querySelector?.('.vitr-page-transition__label');
    if (label) label.textContent = transitionLabelFor(pathname);
  }

  function reveal() {
    if (!root) return;
    if (reducedMotion) {
      root.className = 'vitr-page-transition is-idle';
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        root?.classList.add('is-revealing');
        cleanupTimer = window.setTimeout(() => {
          if (root) root.className = 'vitr-page-transition is-idle';
        }, PAGE_TRANSITION_DURATION_MS + 260);
      });
    });
  }

  function cover(href) {
    if (!root || reducedMotion) {
      navigate(href);
      return;
    }

    const next = new URL(href, window.location.href);
    setLabel(next.pathname);
    root.className = 'vitr-page-transition is-preparing';
    void root.offsetHeight;

    window.requestAnimationFrame(() => {
      if (!root) return;
      root.className = 'vitr-page-transition is-covering';
      navigateTimer = window.setTimeout(() => navigate(next.href), PAGE_TRANSITION_DURATION_MS);
    });
  }

  function onClick(event) {
    if (event.defaultPrevented) return;
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) return;

    const href = anchor.href || anchor.getAttribute('href');
    const shouldTransition = shouldTransitionNavigation({
      href,
      currentOrigin: window.location.origin,
      currentHref: window.location.href,
      target: anchor.target,
      download: anchor.hasAttribute('download'),
      button: event.button,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    });
    if (!shouldTransition) return;

    event.preventDefault();
    cover(href);
  }

  function mount() {
    if (mounted || !document?.body) return;
    mounted = true;
    root = document.getElementById('vitr-page-transition') || document.createElement('div');
    root.id = 'vitr-page-transition';
    root.className = 'vitr-page-transition is-intro';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = markup(transitionLabelFor(window.location.pathname));
    if (!root.isConnected) document.body.appendChild(root);
    document.addEventListener('click', onClick, true);
    reveal();
  }

  function destroy() {
    if (navigateTimer) window.clearTimeout(navigateTimer);
    if (cleanupTimer) window.clearTimeout(cleanupTimer);
    document?.removeEventListener?.('click', onClick, true);
    root?.remove?.();
    root = null;
    mounted = false;
  }

  return { mount, destroy, cover, reveal };
}

export function installPageTransition(environment = globalThis) {
  const controller = createPageTransition(environment);
  controller.mount();
  return controller;
}
