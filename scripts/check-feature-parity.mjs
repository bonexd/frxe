import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`Parity source is missing: ${rel}`);
  }
  return fs.readFileSync(full, "utf8");
}

const source = {
  desktop: [
    "desktop/web/index.html",
    "desktop/src-tauri/src/lib.rs",
    "desktop/src-tauri/src/sync.rs",
  ].map(read).join("\n"),
  android: [
    "mobile/android/app/src/main/java/com/frxe/music/ui/screens/SettingsScreen.kt",
    "mobile/android/app/src/main/java/com/frxe/music/ui/FrxeApp.kt",
    "mobile/android/app/src/main/java/com/frxe/music/ui/components/PlayerFeatureSheets.kt",
    "mobile/android/app/src/main/java/com/frxe/music/ui/components/PlayerToolsSheet.kt",
    "mobile/android/app/src/main/java/com/frxe/music/ui/screens/DeviceSyncScreen.kt",
    "mobile/android/app/src/main/java/com/frxe/music/ui/screens/LibraryScreen.kt",
    "mobile/android/app/src/main/res/drawable/vitr_mark.xml",
  ].map(read).join("\n"),
  ios: [
    "mobile/ios/Vitr/ContentView.swift",
    "mobile/ios/Vitr/VitrDeviceSyncView.swift",
    "mobile/ios/Vitr/VitrLyricsStore.swift",
    "mobile/ios/Vitr/Assets.xcassets/AppIcon.appiconset/Contents.json",
  ].map(read).join("\n"),
};

const rules = [
  {
    name: "Sync Downloads",
    patterns: {
      desktop: [/Sync Downloads/i, /startDownloadSync|start_download_sync/],
      android: [/Vitr Sync/i, /DeviceSyncScreen/],
      ios: [/Vitr Sync/i, /VitrDeviceSyncView/],
    },
  },
  {
    name: "Reset Vitr",
    patterns: {
      desktop: [/Reset Vitr/i, /resetVitrState/],
      android: [/Reset Vitr/i, /VitrLocalReset\.reset/],
      ios: [/Reset Vitr/i, /resetVitr\(\)/],
    },
  },
  {
    name: "Mini player Standard + Lyrics",
    patterns: {
      desktop: [/value="standard"/, /value="lyrics"/],
      android: [/miniPlayerMode/, /"standard"/, /"lyrics"/],
      ios: [/vitr\.miniPlayerMode/, /"standard"/, /"lyrics"/],
    },
  },
  {
    name: "Lyrics action",
    patterns: {
      desktop: [/playerLyrics/, /fetchLyrics/],
      android: [/Lyrics/i, /viewModel\.lyrics/],
      ios: [/VitrLyricsStore/, /VitrLyricsSheet/],
    },
  },
  {
    name: "Repeat track",
    patterns: {
      desktop: [/Repeat track/],
      android: [/Repeat track/],
      ios: [/Repeat track/],
    },
  },
  {
    name: "Sleep Timer",
    patterns: {
      desktop: [/Sleep timer/i, /setSleepTimer/, /cancelSleepTimer/],
      android: [/Sleep Timer/i, /setSleepTimer/],
      ios: [/Sleep Timer/i, /setSleepTimer/],
    },
  },
  {
    name: "Arabic and Persian language support",
    patterns: {
      desktop: [/value="ar"/, /value="fa"/],
      android: [/"ar" to "العربية"/, /"fa" to "فارسی"/],
      ios: [/Text\("العربية"\)\.tag\("ar"\)/, /Text\("فارسی"\)\.tag\("fa"\)/],
    },
  },
  {
    name: "Playlist management",
    patterns: {
      desktop: [/playerPlaylistAdd|data-song-add/, /createDesktopPlaylist/, /deleteDesktopPlaylist/],
      android: [/PlaylistAdd|addTrackToPlaylist/, /createPlaylist/, /deletePlaylist/],
      ios: [/VitrPlaylistStore/, /Add to playlist/, /createPlaylist/, /deletePlaylist/],
    },
  },
  {
    name: "Now Playing track actions",
    patterns: {
      desktop: [/playerPlaylistAdd/, /downloadTrack/],
      android: [/PlayerActionsSheet/, /Add to playlist/i],
      ios: [/showTrackActions/, /Track actions/, /Add to playlist/, /Download/],
    },
  },
  {
    name: "Vitr droplet branding",
    patterns: {
      desktop: [/brand-mark/, /vitr-icon-down\.svg/],
      android: [/vitr_mark/, /E71349/i],
      ios: [/VitrDropShape/, /AppIcon\.png/],
    },
  },
];

const failures = [];

for (const rule of rules) {
  for (const platform of ["desktop", "android", "ios"]) {
    for (const pattern of rule.patterns[platform]) {
      if (!pattern.test(source[platform])) {
        failures.push(
          `${rule.name}: missing ${pattern} on ${platform}`,
        );
      }
    }
  }
}

if (failures.length) {
  console.error("Vitr feature parity check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Vitr feature parity OK: ${rules.length} shared feature groups present on desktop, Android, and iOS.`,
);

await import("./check-mobile-media-pipeline.mjs");

await import("./check-dead-ui-actions.mjs");
