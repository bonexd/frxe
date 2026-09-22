import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("all-platform release runs finish instead of cancelling each other", () => {
  const workflow = read(".github/workflows/release-all.yml");
  assert.match(workflow, /group:\s*vitr-release-\$\{\{ github\.ref \}\}/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test("desktop installer release runs finish instead of cancelling each other", () => {
  const workflow = read(".github/workflows/desktop-release.yml");
  assert.match(workflow, /group:\s*vitr-desktop-release-\$\{\{ github\.ref \}\}/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});
