import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const retiredToken = ["ze", "xl"].join("");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`Vitr mobile media pipeline check failed: ${message}`);
  process.exitCode = 1;
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "target", "build", ".gradle", "dist"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else output.push(full);
  }
  return output;
}

const files = walk(root);
const ownPath = fileURLToPath(import.meta.url);
for (const full of files) {
  if (full === ownPath) continue;
  const rel = path.relative(root, full).replaceAll("\\", "/");
  if (rel.toLowerCase().includes(retiredToken)) {
    fail(`retired resolver remains in path: ${rel}`);
  }
  if (!/\.(?:kt|kts|swift|mjs|js|ts|tsx|json|md|xml|html|rs|toml|properties|yml|yaml|txt)$/i.test(rel)) continue;
  let source = "";
  try { source = fs.readFileSync(full, "utf8"); } catch { continue; }
  if (source.toLowerCase().includes(retiredToken)) {
    fail(`retired resolver remains in source: ${rel}`);
  }
}

const androidPolicy = read("mobile/android/app/src/main/java/com/frxe/music/source/CatalogLoadPolicy.kt");
const androidProviders = read("mobile/android/app/src/main/java/com/frxe/music/source/SearchProviders.kt");
const androidCatalog = read("mobile/android/app/src/main/java/com/frxe/music/source/YouTubeCatalogSource.kt");
const androidDownloads = read("mobile/android/app/src/main/java/com/frxe/music/save/DownloadPipeline.kt");
const androidBuild = read("mobile/android/app/build.gradle.kts");

if (!/providerOrder:\s*List<String>\s*=\s*listOf\(\s*"yt-dlp"\s*\)/s.test(androidPolicy)) {
  fail("Android search discovery must use yt-dlp only");
}
if (!/class\s+YtDlpSearchProvider/.test(androidProviders)) {
  fail("Android yt-dlp search provider is missing");
}
if (!/class\s+InnerTubeMetadataProvider/.test(androidProviders)) {
  fail("Android InnerTube metadata provider is missing");
}
if (!/YtDlpSearchProvider\(application\)/.test(androidCatalog) || !/InnerTubeMetadataProvider\(\)/.test(androidCatalog)) {
  fail("Android catalog is not wired as yt-dlp search + InnerTube metadata");
}
if (!/SealSaveEngine/.test(androidDownloads)) {
  fail("Android Seal download engine is missing");
}
if (/CobaltSaveEngine/.test(androidDownloads)) {
  fail("Android Cobalt download engine must not be wired");
}
const pipeDownloader = path.join(
  root,
  "mobile/android/app/src/main/java/com/frxe/music/save/NewPipeDownloadResolver.kt"
);
if (!fs.existsSync(pipeDownloader)) {
  fail("Android Pipe fallback downloader is missing");
}
if (!/SealSaveEngine/.test(androidDownloads) || !/NewPipeDownloadResolver/.test(androidDownloads)) {
  fail("Android downloads must use Seal first with Pipe fallback");
}
if (!/seal\.save\([\s\S]*?pipe\.resolve\(/.test(androidDownloads)) {
  fail("Android download order must be Seal first, Pipe second");
}
const cobaltPath = path.join(
  root,
  "mobile/android/app/src/main/java/com/frxe/music/save/CobaltSaveEngine.kt"
);
if (fs.existsSync(cobaltPath)) {
  fail("obsolete Android Cobalt download engine remains");
}
if (/COBALT_BASE_URL|COBALT_API_KEY/.test(androidBuild)) {
  fail("obsolete Android remote-download configuration remains");
}

const iosSearch = path.join(root, "mobile/ios/Vitr/VitrYtDlpSearchService.swift");
const iosMetadata = path.join(root, "mobile/ios/Vitr/VitrInnerTubeMetadataService.swift");
const iosDownloads = path.join(root, "mobile/ios/Vitr/VitrSealDownloadService.swift");
const iosContent = read("mobile/ios/Vitr/ContentView.swift");
const iosSearchSource = fs.existsSync(iosSearch) ? fs.readFileSync(iosSearch, "utf8") : "";
const iosProject = read("mobile/ios/Vitr.xcodeproj/project.pbxproj");
for (const [label, full] of [
  ["yt-dlp search", iosSearch],
  ["InnerTube metadata", iosMetadata],
  ["Seal download", iosDownloads],
]) {
  if (!fs.existsSync(full)) fail(`iOS ${label} service is missing`);
}
if (fs.existsSync(iosSearch) && !/VitrYtDlpSearchService/.test(iosSearchSource)) {
  fail("iOS yt-dlp search service contract is missing");
}
if (fs.existsSync(iosMetadata) && !/VitrInnerTubeMetadataService/.test(fs.readFileSync(iosMetadata, "utf8"))) {
  fail("iOS InnerTube metadata service contract is missing");
}
if (fs.existsSync(iosDownloads) && !/VitrSealDownloadService/.test(fs.readFileSync(iosDownloads, "utf8"))) {
  fail("iOS Seal download service contract is missing");
}
if (!/VitrRemoteSearchStore/.test(iosContent) || !/VitrRemoteSearchStore/.test(iosSearchSource)) {
  fail("iOS search UI is not wired to the yt-dlp search store");
}
if (!/VitrInnerTubeMetadataService/.test(iosSearchSource)) {
  fail("iOS yt-dlp discovery is not enriched by InnerTube metadata");
}
if (!/VitrSealDownloadService[\s\S]*?\.download\(track\)/.test(iosContent)) {
  fail("iOS remote tracks are not wired to Seal downloads");
}
for (const service of [
  "VitrYtDlpSearchService.swift",
  "VitrInnerTubeMetadataService.swift",
  "VitrSealDownloadService.swift",
]) {
  if (!iosProject.includes(service)) {
    fail(`iOS project does not compile ${service}`);
  }
}

if (!process.exitCode) {
  console.log("Vitr mobile media pipeline OK: Seal-first downloads with Pipe fallback on Android, yt-dlp search, InnerTube metadata, no retired resolver remnants.");
}
