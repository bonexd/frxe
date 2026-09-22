function normalizeArch(architecture = '', bitness = '') {
  const arch = String(architecture || '').toLowerCase();
  const bits = String(bitness || '');
  if (arch === 'x86' && bits === '64') return 'x64';
  if (/x86_64|amd64|x64/.test(arch)) return 'x64';
  if (/arm64|aarch64|armv8/.test(arch) || (arch === 'arm' && bits === '64')) return 'arm64';
  if (/armv7|arm32/.test(arch) || arch === 'arm') return 'arm';
  if (/x86|i386|i686|ia32/.test(arch)) return 'x86';
  return 'unknown';
}

export function detectDeviceFromSignals(signals = {}) {
  const platform = String(signals.platform || '');
  const userAgent = String(signals.userAgent || '');
  const combined = `${platform} ${userAgent}`;
  const touchPoints = Number(signals.maxTouchPoints || 0);
  let os = 'unknown';
  if (/android/i.test(combined)) os = 'android';
  else if (/iphone|ipad|ipod/i.test(combined) || (/macintel/i.test(platform) && touchPoints > 1)) os = 'ios';
  else if (/windows|win32|win64/i.test(combined)) os = 'windows';
  else if (/cros/i.test(combined)) os = 'chromeos';
  else if (/mac|darwin/i.test(combined)) os = 'macos';
  else if (/linux/i.test(combined)) os = 'linux';

  const arch = normalizeArch(signals.architecture, signals.bitness);
  const mobile = Boolean(signals.mobile ?? /android|iphone|ipad|ipod|mobile/i.test(userAgent));
  const confidence = os === 'unknown' ? 'low' : signals.platform ? 'high' : 'medium';
  return { os, arch, mobile, confidence };
}

export async function detectCurrentDevice() {
  if (typeof navigator === 'undefined') return { os: 'unknown', arch: 'unknown', mobile: false, confidence: 'low' };
  const uaData = navigator.userAgentData;
  let entropy = {};
  if (uaData?.getHighEntropyValues) {
    try {
      entropy = await uaData.getHighEntropyValues(['architecture', 'bitness', 'platform']);
    } catch {
      entropy = {};
    }
  }
  return detectDeviceFromSignals({
    platform: entropy.platform || uaData?.platform || navigator.platform || '',
    architecture: entropy.architecture || '',
    bitness: entropy.bitness || '',
    mobile: uaData?.mobile,
    userAgent: navigator.userAgent || '',
    maxTouchPoints: navigator.maxTouchPoints || 0,
  });
}
