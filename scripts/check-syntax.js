/**
 * Syntax gate for the shipped ESM sources. Parses every `src/*.js` with Bun's
 * transpiler without executing it, so `check` needs no separate Node binary
 * (a Bun `node` shim would run the module instead of only parsing it).
 */
import { readdir, readFile } from "node:fs/promises";

const transpiler = new Bun.Transpiler({ loader: "js" });
const files = (await readdir("src")).filter((file) => file.endsWith(".js")).sort();
let failed = false;

for (const file of files) {
  try {
    transpiler.scan(await readFile(`src/${file}`, "utf8"));
  } catch (error) {
    failed = true;
    console.error(`src/${file}: ${error instanceof Error ? error.message : error}`);
  }
}

if (failed) process.exit(1);
console.log(`syntax ok (${files.length} files)`);
