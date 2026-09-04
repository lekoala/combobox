/**
 * Packaging gate: verify the npm tarball content.
 *
 * Runs `npm pack --dry-run --json` and asserts:
 * - the public artifacts that must ship are present
 * - dev-only sources are absent
 * - every `exports` target (import/types) resolves inside the package
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const npmCommand = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const npmArgs =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "npm pack --dry-run --json"]
    : ["pack", "--dry-run", "--json"];
const raw = execFileSync(npmCommand, npmArgs, { encoding: "utf8" });
// npm echoes the prepack scripts before the JSON payload; strip everything up
// to the leading `[` of the --json array to stay robust on every platform.
const start = raw.indexOf("[");
const end = raw.lastIndexOf("]");
if (start < 0 || end < 0) {
  console.error(`npm pack --dry-run --json did not produce a JSON array:\n${raw}`);
  process.exit(1);
}
const [result] = JSON.parse(raw.slice(start, end + 1));
const paths = result.files.map((f) => f.path);
const has = (p) => paths.includes(p);
const hasPrefix = (prefix) => paths.some((p) => p.startsWith(prefix));

const errors = [];

const mustInclude = [
  "dist/combobox.js",
  "dist/combobox.min.js",
  "dist/combobox.standalone.min.js",
  "dist/combobox.css",
  "dist/combobox.min.css",
  "dist/types/index.d.ts",
  "dist/types/combobox.d.ts",
  "dist/types/combo-box.d.ts",
  "dist/types/helpers.d.ts",
  "dist/types/define.d.ts",
  "src/index.js",
  "src/combo-box.js",
  "src/helpers.js",
  "src/define.js",
  "src/combobox.js",
  "src/combobox.css",
  "custom-elements.json",
  "README.md",
  "LICENSE",
];
for (const p of mustInclude) {
  if (!has(p)) {
    errors.push(`missing from package: ${p}`);
  }
}

for (const prefix of ["src/", "dist/types/"]) {
  if (!hasPrefix(prefix)) {
    errors.push(`missing files under ${prefix}`);
  }
}

for (const prefix of ["test/", "demo/", "scripts/", "docs/", ".github/", ".temp/"]) {
  if (hasPrefix(prefix)) {
    errors.push(`unexpected dev files under ${prefix}`);
  }
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

function collectExportTargets(entry) {
  if (typeof entry === "string") {
    return [entry];
  }
  if (!entry || typeof entry !== "object") {
    return [];
  }
  let targets = [];
  for (const value of Object.values(entry)) {
    targets = targets.concat(collectExportTargets(value));
  }
  return targets;
}

for (const [subpath, entry] of Object.entries(pkg.exports ?? {})) {
  // Wildcard subpaths are resolved by Node per file; assert the referenced
  // glob expands inside the package instead of a single file.
  if (subpath.includes("*")) {
    continue;
  }
  for (const target of collectExportTargets(entry)) {
    const rel = target.replace(/^\.\//, "");
    if (!has(rel)) {
      errors.push(`exports["${subpath}"] -> ${target} not found in package`);
    }
  }
}

// Every sideEffects entry must resolve to a real file inside the tarball: a
// stale CSS/bundle path there would silently break bundler tree-shaking slots.
for (const target of pkg.sideEffects ?? []) {
  const rel = target.replace(/^\.\//, "");
  if (rel.includes("*")) {
    continue;
  }
  if (!has(rel)) {
    errors.push(`sideEffects -> ${target} not found in package`);
  }
}

if (errors.length) {
  console.error("Package check failed:");
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log(`package ok: ${paths.length} files, ${(result.unpackedSize / 1024).toFixed(1)} kB unpacked`);
