export function isVitrWebLocation(hostname = '', pathname = '') {
  const host = String(hostname).trim().toLowerCase();
  const path = String(pathname).trim().toLowerCase();
  return host === 'vitr.nont.me'
    || path === '/music'
    || path.startsWith('/music/');
}
