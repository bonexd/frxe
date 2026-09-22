export const PLATFORMS = ['windows', 'android', 'macos', 'linux', 'ios'];

function packageType(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.appimage')) return 'appimage';
  if (lower.endsWith('.tar.gz')) return 'tar.gz';
  if (lower.endsWith('.tar.xz')) return 'tar.xz';
  return lower.includes('.') ? lower.split('.').pop() : 'file';
}

function detectPlatform(name, type) {
  const lower = name.toLowerCase();
  if (['msi', 'exe', 'msix', 'appx'].includes(type)) return 'windows';
  if (['apk', 'aab'].includes(type)) return 'android';
  if (['dmg', 'pkg'].includes(type)) return 'macos';
  if (['appimage', 'deb', 'rpm', 'flatpak', 'snap'].includes(type)) return 'linux';
  if (type === 'ipa') return 'ios';
  if (['zip', 'tar.gz', 'tar.xz'].includes(type)) {
    if (/\b(macos|macosx|osx|darwin)\b/.test(lower)) return 'macos';
    if (/\b(linux|ubuntu|debian|fedora)\b/.test(lower)) return 'linux';
    if (/\b(windows|win32|win64)\b/.test(lower)) return 'windows';
  }
  return 'unknown';
}

function detectArch(name) {
  const raw = name.toLowerCase();
  const lower = raw.replace(/[._-]+/g, ' ');
  if (/\buniversal2?\b/.test(lower)) return 'universal';
  if (/\b(x86_64|amd64|x64|win64)\b/.test(raw) || /\b(x86 64|amd64|x64|win64)\b/.test(lower)) return 'x64';
  if (/\b(arm64|aarch64|armv8)\b/.test(lower)) return 'arm64';
  if (/\b(armv7|armeabi|arm32|arm)\b/.test(lower)) return 'arm';
  if (/\b(x86|i386|i686|ia32|win32)\b/.test(lower)) return 'x86';
  return 'unknown';
}

function baseScore(type, name) {
  const scores = { msi: 45, msix: 43, exe: 40, appx: 36, apk: 45, dmg: 45, pkg: 42, appimage: 45, deb: 40, rpm: 40, flatpak: 36, snap: 34, ipa: 35, zip: 20, 'tar.gz': 18, 'tar.xz': 18 };
  let score = scores[type] || 0;
  const lower = name.toLowerCase();
  if (/setup|installer|install/.test(lower)) score += 6;
  if (/portable/.test(lower)) score -= 3;
  if (/debug|symbols?|pdb|source|src|checksums?|sha256|sha512|\.sig$|\.asc$/.test(lower)) score -= 100;
  return score;
}

export function classifyReleaseAsset(asset = {}) {
  const name = String(asset.name || '');
  const type = packageType(name);
  const platform = detectPlatform(name, type);
  const arch = detectArch(name);
  const lower = name.toLowerCase();
  const sidecar = /debug|symbols?|pdb|source|src|checksums?|sha256|sha512|\.sig$|\.asc$/.test(lower);
  const installable = platform !== 'unknown' && type !== 'aab' && !sidecar;
  return {
    id: asset.id ?? name,
    name,
    url: asset.browser_download_url || asset.url || '',
    size: Number(asset.size || 0),
    platform,
    arch,
    packageType: type,
    installable,
    score: baseScore(type, name),
  };
}

export function classifyReleaseAssets(assets = []) {
  return assets.map(classifyReleaseAsset);
}

export function recommendAsset(assets = [], target = { os: 'unknown', arch: 'unknown' }) {
  if (!target || target.os === 'unknown') return null;
  return assets
    .filter((item) => item.installable && item.platform === target.os)
    .filter((item) => target.arch === 'unknown' || item.arch === target.arch || item.arch === 'universal' || item.arch === 'unknown')
    .map((item) => ({
      item,
      rank: item.score + (item.arch === target.arch && target.arch !== 'unknown' ? 100 : item.arch === 'universal' ? 50 : target.arch === 'unknown' && item.arch === 'unknown' ? 30 : item.arch === 'unknown' ? 10 : 0),
    }))
    .sort((a, b) => b.rank - a.rank || (b.item.size || 0) - (a.item.size || 0))[0]?.item || null;
}
