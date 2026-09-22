function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hasPath(paths, target) {
  const normalized = String(target).toLowerCase();
  return paths.some((path) => String(path).toLowerCase() === normalized);
}

function hasAnyPath(paths, ...targets) {
  return targets.some((target) => hasPath(paths, target));
}

function hasScript(pkg, matcher) {
  return Object.keys(pkg?.scripts || {}).some((name) => matcher.test(name));
}

export function inferSourceContract({ repo, pkg = {}, sourcePaths = [], appSource = '' }) {
  const key = String(repo || '').toLowerCase();
  const platforms = [];
  const capabilities = [];
  const description = String(pkg?.description || '');
  const isVitr = key.endsWith('/vitr') || key.endsWith('/frxe');

  const hasTauri = Boolean(pkg?.dependencies?.['@tauri-apps/api'] || pkg?.devDependencies?.['@tauri-apps/cli']);
  if (hasTauri || hasScript(pkg, /windows|tauri/) || /\bwindows\b/i.test(description)) platforms.push('Windows');
  if (hasScript(pkg, /android/) || hasPath(sourcePaths, 'src/AndroidApp.tsx') || /\bandroid\b/i.test(description) || isVitr) platforms.push('Android');
  if (hasScript(pkg, /ios/) || /\bios\b/i.test(description)) platforms.push('iOS');

  if (key.endsWith('/nont') || key.endsWith('/nonthub')) {
    if (/\binstaller\b/i.test(appSource)) capabilities.push('Installer');
    if (/\bdownloads?\b/i.test(appSource)) capabilities.push('Downloads');
    if (/\blibrary\b/i.test(appSource)) capabilities.push('Library');
    if (/\bupdates?\b/i.test(appSource)) capabilities.push('Updates');
    if (/\bsettings\b/i.test(appSource)) capabilities.push('Settings');
    if (/custom\s+repo|customRepo/i.test(appSource)) capabilities.push('Custom repositories');
    if (hasPath(sourcePaths, 'src/AndroidApp.tsx')) capabilities.push('Android app');
    if (hasPath(sourcePaths, 'src/icon-fixes.css')) capabilities.push('Icon fixes');
  }

  if (isVitr) {
    if (hasAnyPath(sourcePaths,
      'app/src/main/java/com/vitr/music/ui/components/Glass.kt',
      'app/src/main/java/com/frxe/music/ui/components/Glass.kt')) capabilities.push('Liquid Glass');
    if (hasAnyPath(sourcePaths,
      'app/src/main/java/com/vitr/music/ui/screens/HomeScreen.kt',
      'app/src/main/java/com/frxe/music/ui/screens/HomeScreen.kt')) capabilities.push('Home');
    if (hasAnyPath(sourcePaths,
      'app/src/main/java/com/vitr/music/ui/screens/SearchScreen.kt',
      'app/src/main/java/com/frxe/music/ui/screens/SearchScreen.kt')) capabilities.push('Search');
    if (hasAnyPath(sourcePaths,
      'app/src/main/java/com/vitr/music/ui/screens/SaveScreen.kt',
      'app/src/main/java/com/frxe/music/ui/screens/SaveScreen.kt')) capabilities.push('Save');
    if (hasAnyPath(sourcePaths,
      'app/src/main/java/com/vitr/music/ui/screens/LibraryScreen.kt',
      'app/src/main/java/com/frxe/music/ui/screens/LibraryScreen.kt')) capabilities.push('Library');
    if (hasAnyPath(sourcePaths,
      'app/src/main/java/com/vitr/music/ui/screens/NowPlayingScreen.kt',
      'app/src/main/java/com/frxe/music/ui/screens/NowPlayingScreen.kt')) capabilities.push('Now Playing');
    if (hasAnyPath(sourcePaths,
      'app/src/main/java/com/vitr/music/lyrics/LyricsRepository.kt',
      'app/src/main/java/com/frxe/music/lyrics/LyricsRepository.kt')) capabilities.push('Lyrics');
    if (hasAnyPath(sourcePaths,
      'app/src/main/java/com/vitr/music/social/ListenTogether.kt',
      'app/src/main/java/com/frxe/music/social/ListenTogether.kt')) capabilities.push('Listen Together');
    if (hasAnyPath(sourcePaths,
      'app/src/main/java/com/vitr/music/voice/VoskVoiceController.kt',
      'app/src/main/java/com/frxe/music/voice/VoskVoiceController.kt')) capabilities.push('Voice');
    if (hasAnyPath(sourcePaths,
      'app/src/main/java/com/vitr/music/cast/VitrCastOptionsProvider.kt',
      'app/src/main/java/com/frxe/music/cast/VitrCastOptionsProvider.kt')) capabilities.push('Cast');
    if (hasAnyPath(sourcePaths,
      'app/src/main/res/xml/automotive_app_desc.xml',
      'app/src/main/res/xml/automotive_app_desc.xml')) capabilities.push('Android Auto');
    if (/\bqueue/i.test(appSource)) capabilities.push('Queue');
    if (/\bshuffle\b/i.test(appSource)) capabilities.push('Shuffle');
    if (/\brepeat\b/i.test(appSource)) capabilities.push('Repeat');
  }

  return {
    version: String(pkg?.version || '').trim(),
    name: String(pkg?.name || '').trim(),
    description: description.trim(),
    platforms: unique(platforms),
    capabilities: unique(capabilities),
  };
}

export function contractSummary(contract) {
  const parts = [];
  if (contract?.description) parts.push(contract.description);
  if (contract?.platforms?.length) parts.push(`Platforms: ${contract.platforms.join(', ')}`);
  if (contract?.capabilities?.length) parts.push(`Source features: ${contract.capabilities.join(', ')}`);
  return parts.join(' · ');
}
