import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readReleaseMetadata } from './release-metadata.mjs';

const root = process.argv[2] ? resolve(process.argv[2]) : resolve('release-assets');
const repo = String(process.env.GITHUB_REPOSITORY || 'voidnont/Frxe-Desktop').trim();
const { version } = await readReleaseMetadata();

async function signature(name) {
  return (await readFile(resolve(root, `${name}.sig`), 'utf8')).trim();
}

function url(name) {
  return `https://github.com/${repo}/releases/download/v${version}/${name}`;
}

const windows = `vitr-${version}-setup.exe`;
const linux = `vitr-${version}-x86_64.AppImage`;
const macArm = `vitr-${version}-macos-arm64.app.tar.gz`;
const macX64 = `vitr-${version}-macos-x64.app.tar.gz`;

const manifest = {
  version,
  notes: `Vitr ${version} signed automatic update.`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': { url: url(windows), signature: await signature(windows) },
    'linux-x86_64': { url: url(linux), signature: await signature(linux) },
    'darwin-aarch64': { url: url(macArm), signature: await signature(macArm) },
    'darwin-x86_64': { url: url(macX64), signature: await signature(macX64) },
  },
};

await writeFile(resolve(root, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`Generated signed updater manifest for Vitr ${version}\n`);
