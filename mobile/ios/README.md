# Vitr iOS

Native iOS shell for Vitr, version **0.5.3**, published as **Blood**.

- Bundle ID: `com.bloodvitr.vitr`
- Publisher metadata: **Blood**
- Minimum iOS: 16.0
- UI: SwiftUI
- Player: `WKWebView` loading `https://vitr.nont.me/music`
- Update source: `bloodvitr/vitr/releases`
- Support: `https://github.com/bloodvitr/vitr`
- Donation: `https://ko-fi.com/bloodvitr`

## Sideload IPA

GitHub Actions builds `Vitr-0.5.3-sideload.ipa` using the standard iOS `Payload/Vitr.app` layout with no embedded Apple provisioning profile or stale code signature. It is intended for sideload tools that re-sign the app for the target device, such as AltStore/SideStore/Sideloadly-style workflows.

A directly installable App Store/TestFlight IPA still requires a real Apple-issued signing certificate and provisioning profile; the build does not fake an Apple signing identity.
