# Vitr

Vitr is a cross-platform music project by **Blood**. The repository version is **0.5.6**.

## Repository layout

- `web/` — complete Vitr Web source, serverless API implementation, tests, Vite/Playwright config, public assets and web deployment config.
- `desktop/` — complete Tauri desktop source, including native Rust code, desktop UI, and platform tooling for Windows, Linux and macOS.
- `mobile/android/` — native Android Vitr app with playback, downloads, Android Auto, persistence, resolver logic and tests.
- `mobile/ios/` — native SwiftUI/WebKit iOS app and Xcode project.
- `.github/workflows/` — repository CI and release orchestration.
- `api/` — tiny Vercel entry-point shims only; the real API implementation lives in `web/api/`.
- `vercel.json` — root deployment bridge that builds `web/`.
- `VERSION` — canonical repository version.

## Commands

- `npm run web:dev` — start Vitr Web.
- `npm run web:check` — validate and unit-test Vitr Web.
- `npm run web:e2e` — run Vitr Web browser tests.
- `npm run desktop:dev` — start the Tauri desktop app.
- `npm run desktop:check` — validate desktop frontend/native contracts.
- `npm run desktop:build:windows` — build Windows installers.
- `npm run desktop:build:linux` — build Linux packages.
- `npm run desktop:build:macos` — build macOS packages.
- `npm run android:build` — build the native Android Vitr 0.5.6 APK.
- `npm run ios:build` — build the iOS simulator app on macOS.
- GitHub Actions produces `Vitr-0.5.6-sideload.ipa` for sideload tools to re-sign for an iPhone.
- `npm run check` — validate web and desktop.

The official web player is `https://vitr.nont.me`. For Vitr across the web, desktop, Android, and iOS, releases and update information use `bloodvitr/vitr/releases`, support uses `bloodvitr/vitr`, and donations use `ko-fi.com/bloodvitr`.

## License

Vitr is source-available, not open source. See [LICENSE](./LICENSE).
