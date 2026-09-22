import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(scriptPath), '..');

export async function readReleaseMetadata(root = defaultRoot) {
  const [pkgText, tauriText, cargoText] = await Promise.all([
    readFile(resolve(root, 'package.json'), 'utf8'),
    readFile(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'),
    readFile(resolve(root, 'src-tauri/Cargo.toml'), 'utf8'),
  ]);

  const pkg = JSON.parse(pkgText);
  const tauri = JSON.parse(tauriText);
  const cargoVersion = cargoText.match(/^version\s*=\s*"([^"]+)"/m)?.[1] || '';
  const version = String(pkg.version || '').trim();

  if (!version) throw new Error('package.json must define a release version');
  if (tauri.version !== version || cargoVersion !== version) {
    throw new Error(`Release version drift: package=${version} tauri=${tauri.version || ''} cargo=${cargoVersion}`);
  }

  return {
    version,
    productName: tauri.productName || 'vitr',
    artifacts: {
      windowsSetup: `vitr-${version}-setup.exe`,
      windowsMsi: `vitr-${version}-x64.msi`,
      linuxDeb: `vitr-${version}-amd64.deb`,
      linuxAppImage: `vitr-${version}-x86_64.AppImage`,
      macArmDmg: `vitr-${version}-macos-arm64.dmg`,
      macX64Dmg: `vitr-${version}-macos-x64.dmg`,
    },
  };
}

if (process.argv[1] === scriptPath) {
  const metadata = await readReleaseMetadata();
  switch (process.argv[2]) {
    case 'version':
      process.stdout.write(metadata.version);
      break;
    case 'check':
      process.stdout.write(`${metadata.productName} ${metadata.version}\n`);
      break;
    default:
      throw new Error('Usage: node tools/release-metadata.mjs <version|check>');
  }
}
