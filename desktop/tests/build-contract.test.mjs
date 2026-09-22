import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');
const exists = async (path) => access(join(root, path)).then(() => true, () => false);

test('desktop builds are self-contained and platform entry points are separated', async () => {
  for (const path of [
    'platforms/windows/build.bat',
    'platforms/windows/dev.bat',
    'platforms/linux/build.sh',
    'platforms/macos/build.sh',
  ]) {
    assert.equal(await exists(path), true, `${path} must exist`);
  }
  for (const path of ['build.bat', 'dev.bat', 'build-linux.sh', 'build-macos.sh']) {
    assert.equal(await exists(path), false, `${path} must move under platforms/`);
  }

  const [pkg, win, linux, mac, windowsWorkflow, linuxWorkflow, macWorkflow] = await Promise.all([
    read('package.json'),
    read('platforms/windows/build.bat'),
    read('platforms/linux/build.sh'),
    read('platforms/macos/build.sh'),
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/linux-packages.yml'),
    read('.github/workflows/macos-dmg.yml'),
  ]);
  const joined = [pkg, win, linux, mac].join('\n');
  assert.doesNotMatch(joined, /backend:prepare|prepare-backend|1367264568/);
  assert.match(pkg, /tauri:build:windows/);
  assert.match(pkg, /tauri:build:linux/);
  assert.match(pkg, /tauri:build:macos/);
  assert.match(pkg, /tauri icon web\/vitr-icon\.png/);
  assert.match(windowsWorkflow, /platforms[\\/]windows[\\/]build\.bat/i);
  assert.match(linuxWorkflow, /platforms\/linux\/build\.sh/);
  assert.match(macWorkflow, /platforms\/macos\/build\.sh/);
  assert.equal(await exists('web/app.mjs'), true);
  assert.equal(await exists('src-tauri/src/lib.rs'), true);
});

test('Tauri asset protocol config has the matching Rust feature', async () => {
  const [config, cargo] = await Promise.all([
    read('src-tauri/tauri.conf.json'),
    read('src-tauri/Cargo.toml'),
  ]);
  assert.match(config, /"assetProtocol"\s*:\s*\{/);
  assert.match(config, /"enable"\s*:\s*true/);
  assert.match(cargo, /features\s*=\s*\[[^\]]*"protocol-asset"[^\]]*\]/s);
});

test('Windows release never opens console windows', async () => {
  const [mainRs, runtimeRs, searchRs, downloadsRs] = await Promise.all([
    read('src-tauri/src/main.rs'),
    read('src-tauri/src/runtime.rs'),
    read('src-tauri/src/search.rs'),
    read('src-tauri/src/downloads.rs'),
  ]);

  assert.match(mainRs, /cfg_attr\(not\(debug_assertions\),\s*windows_subsystem\s*=\s*"windows"\)/);
  assert.match(runtimeRs, /creation_flags\(0x08000000\)/);
  assert.match(runtimeRs, /pub\s+fn\s+silent_command/);
  assert.doesNotMatch(searchRs, /Command::new/);
  assert.doesNotMatch(downloadsRs, /Command::new/);
});

test('Home and About use canonical vitr support links', async () => {
  const [ui, app] = await Promise.all([
    read('web/ui.mjs'),
    read('web/app.mjs'),
  ]);
  assert.match(ui, /home-links/);
  assert.match(ui, /https:\/\/ko-fi\.com\/bloodvitr/);
  assert.match(ui, /https:\/\/github\.com\/bloodvitr\/vitr/);
  assert.doesNotMatch(ui, /github\.com\/bloodvitr\/vitr-windows/i);
  assert.match(ui, /data-external=/);
  assert.match(app, /closest\('\[data-external\]'\)/);
  assert.doesNotMatch(app, /github\.com\/bloodvitr\/vitr-windows/i);
});

test('release version mirrors remain 0.1.0 while package names are derived dynamically', async () => {
  const [pkg, cargo, config, winScript, linuxScript, macScript, windowsWorkflow, linuxWorkflow, macWorkflow, ui, runtime, search] = await Promise.all([
    read('package.json'),
    read('src-tauri/Cargo.toml'),
    read('src-tauri/tauri.conf.json'),
    read('platforms/windows/build.bat'),
    read('platforms/linux/build.sh'),
    read('platforms/macos/build.sh'),
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/linux-packages.yml'),
    read('.github/workflows/macos-dmg.yml'),
    read('web/ui.mjs'),
    read('src-tauri/src/runtime.rs'),
    read('src-tauri/src/search.rs'),
  ]);
  assert.match(pkg, /"version"\s*:\s*"0\.1\.0"/);
  assert.match(cargo, /^version\s*=\s*"0\.1\.0"/m);
  assert.match(config, /"version"\s*:\s*"0\.1\.0"/);
  assert.match(ui, /vitr 0\.1\.0/);
  assert.match(runtime, /vitr\/0\.1\.0/);
  assert.match(search, /vitr\/0\.1\.0/);

  for (const script of [winScript, linuxScript, macScript]) {
    assert.match(script, /release-metadata\.mjs/);
    assert.doesNotMatch(script, /0\.1\.0/);
  }
  for (const workflow of [windowsWorkflow, linuxWorkflow, macWorkflow]) {
    assert.match(workflow, /steps\.release\.outputs\.version/);
    assert.doesNotMatch(workflow, /vitr-0\.1\.0/);
  }
});

test('current project links use the Blood Vitr repository', async () => {
  const [config, ui] = await Promise.all([
    read('src-tauri/tauri.conf.json'),
    read('web/ui.mjs'),
  ]);
  const joined = [config, ui].join('\n');
  assert.match(joined, /github\.com\/bloodvitr\/vitr/);
  assert.doesNotMatch(joined, /github\.com\/bloodvitr\/vitr-Windows/i);
});

test('vitr uses signed automatic updates', async () => {
  const [cargo, lib, capabilities, config, backend, app, ui, workflow, manifest] = await Promise.all([
    read('src-tauri/Cargo.toml'),
    read('src-tauri/src/lib.rs'),
    read('src-tauri/capabilities/default.json'),
    read('src-tauri/tauri.conf.json'),
    read('web/backend.mjs'),
    read('web/app.mjs'),
    read('web/ui.mjs'),
    read('.github/workflows/release.yml'),
    read('tools/generate-updater-manifest.mjs'),
  ]);
  assert.match(cargo, /tauri-plugin-updater/);
  assert.match(lib, /tauri_plugin_updater::UpdaterExt/);
  assert.match(lib, /download_and_install/);
  assert.match(lib, /auto_update/);
  assert.match(capabilities, /updater:default/);
  assert.match(config, /"publisher"\s*:\s*"Blood"/);
  assert.match(config, /"pubkey"\s*:/);
  assert.match(config, /releases\/latest\/download\/latest\.json/);
  assert.match(config, /"installMode"\s*:\s*"passive"/);
  assert.match(backend, /autoUpdate\(\)[\s\S]*invoke\('auto_update'\)/);
  assert.match(app, /prefs\.autoUpdate/);
  assert.match(ui, /Automatic updates/i);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(workflow, /generate-updater-manifest\.mjs/);
  assert.match(manifest, /windows-x86_64/);
  assert.match(manifest, /linux-x86_64/);
  assert.match(manifest, /darwin-aarch64/);
  assert.match(manifest, /darwin-x86_64/);
});

test('one-off legacy release publisher is removed after release', async () => {
  assert.equal(await exists('.github/workflows/release-installers.yml'), false);
});

test('platform CI artifact paths use the canonical version output', async () => {
  const [windowsWorkflow, linuxWorkflow, macWorkflow] = await Promise.all([
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/linux-packages.yml'),
    read('.github/workflows/macos-dmg.yml'),
  ]);
  assert.match(windowsWorkflow, /vitr-\$\{\{ steps\.release\.outputs\.version \}\}-Windows/);
  assert.match(windowsWorkflow, /vitr-\$\{\{ steps\.release\.outputs\.version \}\}-setup\.exe/);
  assert.match(windowsWorkflow, /vitr-\$\{\{ steps\.release\.outputs\.version \}\}-x64\.msi/);
  assert.match(linuxWorkflow, /vitr-\$\{\{ steps\.release\.outputs\.version \}\}-Linux/);
  assert.match(linuxWorkflow, /-amd64\.deb/);
  assert.match(linuxWorkflow, /-x86_64\.AppImage/);
  assert.match(macWorkflow, /steps\.release\.outputs\.version/);
  assert.match(macWorkflow, /matrix\.release_arch/);
});

test('release-ready PRs verify platform packages without replacing manual dispatch', async () => {
  const workflows = await Promise.all([
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/linux-packages.yml'),
    read('.github/workflows/macos-dmg.yml'),
  ]);

  for (const workflow of workflows) {
    assert.match(workflow, /workflow_dispatch\s*:/);
    assert.match(workflow, /pull_request\s*:/);
    assert.match(workflow, /types:\s*\[[^\]]*ready_for_review[^\]]*\]/);
    assert.match(workflow, /github\.event_name\s*==\s*['"]workflow_dispatch['"]/);
    assert.match(workflow, /github\.event\.pull_request\.draft\s*==\s*false/);
  }
});

test('platform build scripts use locked installs, canonical version metadata and package smoke checks', async () => {
  for (const path of [
    'platforms/windows/smoke-test.ps1',
    'platforms/linux/smoke-test.sh',
    'platforms/macos/smoke-test.sh',
  ]) {
    assert.equal(await exists(path), true, `${path} must exist`);
  }

  const [win, dev, linux, mac] = await Promise.all([
    read('platforms/windows/build.bat'),
    read('platforms/windows/dev.bat'),
    read('platforms/linux/build.sh'),
    read('platforms/macos/build.sh'),
  ]);

  for (const script of [win, dev, linux, mac]) {
    assert.match(script, /npm\s+ci/i);
    assert.doesNotMatch(script, /npm\s+install\b/i);
  }
  for (const script of [win, linux, mac]) {
    assert.match(script, /release-metadata\.mjs/);
    assert.doesNotMatch(script, /0\.1\.0/);
  }
  assert.match(win, /smoke-test\.ps1/i);
  assert.match(linux, /smoke-test\.sh/);
  assert.match(mac, /smoke-test\.sh/);
});


test('release signing is secret-driven and unsigned desktop packages stay validation-only', async () => {
  for (const path of [
    'platforms/windows/import-signing-certificate.ps1',
    'platforms/macos/import-signing-certificate.sh',
  ]) {
    assert.equal(await exists(path), true, `${path} must exist`);
  }

  const [windowsWorkflow, macWorkflow, releaseWorkflow, windowsImport, macImport, config] = await Promise.all([
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/macos-dmg.yml'),
    read('.github/workflows/release.yml'),
    read('platforms/windows/import-signing-certificate.ps1'),
    read('platforms/macos/import-signing-certificate.sh'),
    read('src-tauri/tauri.conf.json'),
  ]);

  assert.match(windowsWorkflow, /secrets\.WINDOWS_CERTIFICATE/);
  assert.match(windowsWorkflow, /secrets\.WINDOWS_CERTIFICATE_PASSWORD/);
  assert.match(windowsWorkflow, /WINDOWS_TIMESTAMP_URL/);
  assert.match(windowsImport, /Import-PfxCertificate/);
  assert.match(windowsImport, /Thumbprint/);

  for (const name of ['APPLE_CERTIFICATE','APPLE_CERTIFICATE_PASSWORD','KEYCHAIN_PASSWORD','APPLE_ID','APPLE_PASSWORD','APPLE_TEAM_ID']) {
    assert.match(macWorkflow, new RegExp(`secrets\\.${name}`));
  }
  assert.match(macImport, /security create-keychain/);
  assert.match(macImport, /security import/);
  assert.match(releaseWorkflow, /validation-only|signing credentials|code-signing/i);
  assert.match(config, /"publisher"\s*:\s*"Blood"/);
});


test('main publishes a versioned GitHub release with all six desktop packages', async () => {
  assert.equal(await exists('.github/workflows/release.yml'), true, 'release workflow must exist');
  const workflow = await read('.github/workflows/release.yml');
  assert.match(workflow, /push:\s*[\s\S]{0,120}branches:\s*\[?main\]?/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /platforms[\\/]windows[\\/]build\.bat/i);
  assert.match(workflow, /platforms\/linux\/build\.sh/);
  assert.match(workflow, /platforms\/macos\/build\.sh/);
  assert.match(workflow, /vitr-\$\{\{[^}]*version[^}]*\}\}-setup\.exe/);
  assert.match(workflow, /vitr-\$\{\{[^}]*version[^}]*\}\}-x64\.msi/);
  assert.match(workflow, /vitr-\$\{\{[^}]*version[^}]*\}\}-amd64\.deb/);
  assert.match(workflow, /vitr-\$\{\{[^}]*version[^}]*\}\}-x86_64\.AppImage/);
  assert.match(workflow, /macos-arm64\.dmg/);
  assert.match(workflow, /macos-x64\.dmg/);
  assert.match(workflow, /gh release create/);
});


test('Windows installers use branded Vitr NSIS and WiX artwork', async () => {
  const [config, build, artwork] = await Promise.all([
    read('src-tauri/tauri.conf.json'),
    read('platforms/windows/build.bat'),
    read('platforms/windows/generate-installer-art.ps1'),
  ]);
  assert.match(config, /"nsis"\s*:\s*\{/);
  assert.match(config, /vitr-nsis-header\.bmp/);
  assert.match(config, /vitr-nsis-sidebar\.bmp/);
  assert.match(config, /"wix"\s*:\s*\{/);
  assert.match(config, /vitr-wix-banner\.bmp/);
  assert.match(config, /vitr-wix-dialog\.bmp/);
  assert.match(build, /--bundles msi,nsis/i);
  assert.match(build, /vitr-%VITR_VERSION%-setup\.exe/i);
  assert.match(artwork, /MUSIC IN MOTION/);
  assert.match(artwork, /Format24bppRgb/);
});


test('custom titlebar and floating mini player are native desktop features', async () => {
  const [index, controls, capabilities, lib, app, miniHtml, miniScript, miniStyles] = await Promise.all([
    read('web/index.html'),
    read('web/window-controls.mjs'),
    read('src-tauri/capabilities/default.json'),
    read('src-tauri/src/lib.rs'),
    read('web/app.mjs'),
    read('web/mini.html'),
    read('web/mini-player.mjs'),
    read('web/mini-player.css'),
  ]);
  assert.match(index, /data-vitr-drag-region/);
  assert.match(index, /data-tauri-drag-region/);
  assert.match(controls, /start_drag_window/);
  assert.match(controls, /resolveTauri/);
  assert.match(capabilities, /core:window:allow-start-dragging/);
  assert.match(capabilities, /"mini"/);
  assert.match(lib, /WebviewWindowBuilder/);
  assert.match(lib, /async fn set_mini_player_enabled/);
  assert.match(lib, /always_on_top\(true\)/);
  assert.match(lib, /skip_taskbar\(true\)/);
  assert.match(lib, /visible\(false\)/);
  assert.match(lib, /background_color\(Color\(9, 10, 15, 255\)\)/);
  assert.match(lib, /mini_player_dimensions/);
  assert.match(lib, /210\.0, 210\.0/);
  assert.match(lib, /340\.0, 88\.0/);
  assert.match(lib, /set_mini_player_layout/);
  assert.match(lib, /set_position\(LogicalPosition/);
  assert.match(app, /setMiniPlayerEnabled\(false, state\.prefs\.miniPlayerLayout/);
  assert.match(app, /showFloatingMiniPlayerForPlayback/);
  assert.doesNotMatch(app, /document\.querySelectorAll\('\[data-window\]'\)/);
  assert.match(miniHtml, /vitr mini player/i);
  assert.match(miniHtml, /data-tauri-drag-region/);
  assert.match(miniScript, /mini-player-state/);
  assert.match(miniScript, /mini_player_action/);
  assert.match(miniScript, /mini-square/);
  assert.match(miniStyles, /background:\s*#090a0f/);
  assert.match(miniStyles, /html\.mini-square/);
});


test('Liquid Glass covers the full shell with reflective sidebar treatment', async () => {
  const styles = await read('web/styles-4.css');
  assert.match(styles, /html:not\(\.no-liquid-glass\) \.desktop-sidebar/);
  assert.match(styles, /desktop-sidebar::before/);
  assert.match(styles, /mix-blend-mode:\s*screen/);
  assert.match(styles, /backdrop-filter:\s*blur\(40px\)/);
  assert.match(styles, /rgba\(255,255,255,\.40\)/);
});
