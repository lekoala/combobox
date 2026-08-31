/**
 * Build the distributable artifacts into dist/.
 *
 * - dist/combobox.js      classic iife bundle, unminified (file:// friendly)
 * - dist/combobox.min.js  classic iife bundle, minified
 * - dist/combobox.css     component stylesheet, unminified
 * - dist/combobox.min.css component stylesheet, minified
 *
 * The classic build is produced from the single side-effect entry
 * src/define.js, so dist never touches customElements beyond registration.
 */
import { copyFileSync, mkdirSync } from "node:fs";

const BANNER = "/*** @lekoala/combobox v0.1.0 - https://github.com/lekoala/combobox ***/";

mkdirSync("dist", { recursive: true });

async function bundle(entry, outfile, minify) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: "dist",
    naming: outfile,
    target: "browser",
    format: "iife",
    minify,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  const file = Bun.file(`dist/${outfile}`);
  if (await file.exists()) {
    await Bun.write(`dist/${outfile}`, `${BANNER}\n${await file.text()}`);
  }
}

await bundle("src/define.js", "combobox.js", false);
await bundle("src/define.js", "combobox.min.js", true);

copyFileSync("src/combobox.css", "dist/combobox.css");

const cssResult = await Bun.build({
  entrypoints: ["src/combobox.css"],
  outdir: "dist",
  naming: "combobox.min.css",
  minify: true,
});
if (!cssResult.success) {
  for (const log of cssResult.logs) console.error(log);
  process.exit(1);
}

console.log("built dist/combobox.js, dist/combobox.min.js, dist/combobox.css, dist/combobox.min.css");
