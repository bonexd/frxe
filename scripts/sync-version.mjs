import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid VERSION value: ${version}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, content) {
  fs.writeFileSync(path.join(root, rel), content);
}

function json(rel, mutate) {
  const data = JSON.parse(read(rel));
  mutate(data);
  write(rel, JSON.stringify(data, null, 2) + '\n');
}

json('package.json', (data) => { data.version = version; });
json('web/package.json', (data) => { data.version = version; });
write('web/VERSION', version + '\n');
let webPlayer = read('web/src/music/VitrWebApp.tsx');
webPlayer = webPlayer.replace(
  /export const VITR_WEB_VERSION = '[^']+';/,
  `export const VITR_WEB_VERSION = '${version}';`,
);
write('web/src/music/VitrWebApp.tsx', webPlayer);

let landingApp = read('web/src/App.jsx');
landingApp = landingApp.replace(
  /const VERSION = '[^']+';/,
  `const VERSION = '${version}';`,
);
write('web/src/App.jsx', landingApp);
json('desktop/package.json', (data) => { data.version = version; });
json('desktop/package-lock.json', (data) => {
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
});
json('desktop/src-tauri/tauri.conf.json', (data) => { data.version = version; });

let cargo = read('desktop/src-tauri/Cargo.toml');
cargo = cargo.replace(/(^\s*version\s*=\s*")[^"]+(")/m, `$1${version}$2`);
write('desktop/src-tauri/Cargo.toml', cargo);

const cargoLockPath = 'desktop/src-tauri/Cargo.lock';
if (fs.existsSync(path.join(root, cargoLockPath))) {
  let lock = read(cargoLockPath);
  lock = lock.replace(
    /(\[\[package\]\]\s*\nname = "vitr"\s*\nversion = ")[^"]+(")/m,
    `$1${version}$2`,
  );
  write(cargoLockPath, lock);
}

const htmlFiles = [
  'desktop/web/index.html',
  'mobile/android/app/src/standalone/assets/index.html',
  'mobile/ios/Vitr/index.html',
];
for (const rel of htmlFiles) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  let html = read(rel);
  html = html.replace(
    /(<h3>Version<\/h3><p>[^<]*<\/p><\/div><strong>)[^<]+(<\/strong>)/,
    `$1${version}$2`,
  );
  write(rel, html);
}

const iosInfo = 'mobile/ios/Vitr/Info.plist';
if (fs.existsSync(path.join(root, iosInfo))) {
  let plist = read(iosInfo);
  plist = plist.replace(
    /(<key>CFBundleGetInfoString<\/key>\s*<string>)Vitr [^<]+ by Blood(<\/string>)/,
    `$1Vitr ${version} by Blood$2`,
  );
  write(iosInfo, plist);
}

const iosProject = 'mobile/ios/Vitr.xcodeproj/project.pbxproj';
if (fs.existsSync(path.join(root, iosProject))) {
  let project = read(iosProject);
  project = project.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
  write(iosProject, project);
}

for (const rel of ['README.md', 'mobile/android/README.md']) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  let text = read(rel);
  text = text
    .replace(/repository version is \*\*[^*]+\*\*/i, `repository version is **${version}**`)
    .replace(/- Version: \*\*[^*]+\*\*/, `- Version: **${version}**`)
    .replace(/Vitr-\d+\.\d+\.\d+-sideload\.ipa/g, `Vitr-${version}-sideload.ipa`)
    .replace(/native Android Vitr \d+\.\d+\.\d+ APK/g, `native Android Vitr ${version} APK`);
  write(rel, text);
}

console.log(`Synced Vitr version ${version}`);
