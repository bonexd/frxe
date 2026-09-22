import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const targets = {
  ios: fs.readFileSync(path.join(root, "mobile/ios/Vitr/ContentView.swift"), "utf8"),
  android: [
    "mobile/android/app/src/main/java/com/frxe/music/ui/FrxeApp.kt",
    "mobile/android/app/src/main/java/com/frxe/music/ui/screens/NowPlayingScreen.kt",
    "mobile/android/app/src/main/java/com/frxe/music/ui/screens/LibraryScreen.kt",
    "mobile/android/app/src/main/java/com/frxe/music/ui/screens/SearchScreen.kt",
    "mobile/android/app/src/main/java/com/frxe/music/ui/screens/SettingsScreen.kt",
  ].map((rel) => fs.readFileSync(path.join(root, rel), "utf8")).join("\n"),
  desktop: fs.readFileSync(path.join(root, "desktop/web/index.html"), "utf8"),
};

const failures = [];
if (/Button\(action:\s*\{\s*\}\)/.test(targets.ios)) {
  failures.push("iOS contains a Button(action: {}) dead control");
}
if (/onClick\s*=\s*\{\s*\}/.test(targets.android)) {
  failures.push("Android contains an empty onClick handler");
}
if (/<button[^>]+onclick=["']\s*["']/.test(targets.desktop)) {
  failures.push("Desktop contains an empty inline button handler");
}

if (failures.length) {
  console.error("Vitr dead-control check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Vitr dead-control check OK.");
