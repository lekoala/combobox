/**
 * Generate custom-elements.json (Custom Elements Manifest 2.1.0) from source.
 *
 * The sources are read as text: the script never imports the browser-only
 * modules under Bun. The JS source stays the single source of truth:
 * - attributes come from the `OPTION_ATTRIBUTES` keys in src/combo-box.js
 * - members come from methods/getters explicitly marked with `@public`
 * - events come from the literal `"combobox:*"` names wired through `emit()`
 * - CSS custom properties come from the `--cb-*` token block in combobox.css
 */

import { readFile, writeFile } from "node:fs/promises";

const OUT = "custom-elements.json";
const SCHEMA_VERSION = "2.1.0";
const TAG = "combo-box";

/**
 * @param {string} file
 * @returns {Promise<string>}
 */
const read = (file) => readFile(file, "utf8");

/**
 * Extract the kebab-case attribute names from the `OPTION_ATTRIBUTES = { ... }`
 * literal in src/combo-box.js.
 * @param {string} source
 * @returns {string[]}
 */
function extractAttributes(source) {
  const block = source.match(/const OPTION_ATTRIBUTES\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block) return [];
  const names = [];
  for (const m of block[1].matchAll(/^\s*"?([a-z][\w-]*)"?\s*:/gm)) {
    names.push(m[1]);
  }
  return names;
}

/**
 * Extract methods/getters/fields whose preceding JSDoc block contains `@public`.
 * @param {string} source
 * @returns {Array<{ kind: string, name: string, description: string, static?: boolean }>}
 */
function extractPublicMembers(source) {
  const lines = source.split("\n");
  const members = [];
  /** @type {string[]|null} */
  let doc = null;
  /** @type {string|null} */
  let pendingDoc = null;
  for (const line of lines) {
    if (doc) {
      if (line.includes("*/")) {
        doc.push(line);
        const text = doc.join("\n");
        doc = null;
        pendingDoc = /@public/.test(text) ? text : null;
      } else {
        doc.push(line);
      }
      continue;
    }
    if (pendingDoc) {
      const def = line.trim().match(/^(?:static\s+)?(?:get\s+)?([A-Za-z_$][\w$]*)\s*(\(|=|\{)/);
      if (def) {
        const trimmed = line.trim();
        const delimiter = def[2];
        let kind = "method";
        if (trimmed.startsWith("get ")) {
          kind = "getter";
        } else if (delimiter === "=") {
          kind = "field";
        }
        members.push({
          kind,
          name: def[1],
          static: trimmed.startsWith("static"),
          description: extractDescription(pendingDoc),
        });
      }
      pendingDoc = null;
    }
    if (/^\s*\/\*\*/.test(line)) {
      doc = [line];
      if (line.includes("*/")) {
        const text = doc.join("\n");
        doc = null;
        pendingDoc = /@public/.test(text) ? text : null;
      }
    }
  }
  return members;
}

/**
 * @param {string} text
 * @returns {string}
 */
function extractDescription(text) {
  const description = text
    .replace(/\/\*+|\*+\//g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter((l) => l && !l.startsWith("@"))
    .join(" ");
  return description || undefined;
}

/**
 * Extract literal combobox event names emitted through `emit(...)` /
 * `new CustomEvent(...)`.
 * @param {string} source
 * @returns {string[]}
 */
function extractEvents(source) {
  const names = [];
  for (const m of source.matchAll(/(?:emit\(|new CustomEvent\()\s*[^,;]+\s*,\s*"([^"]+)"/g)) {
    names.push(m[1]);
  }
  return Array.from(new Set(names)).sort();
}

/**
 * Extract the public `--cb-*` custom properties defined in the top token block.
 * @param {string} css
 * @returns {string[]}
 */
function extractCssProperties(css) {
  const block = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!block) return [];
  const names = [];
  for (const m of block[1].matchAll(/(--cb-[a-z][\w-]*)/g)) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

async function main() {
  const elementSource = await read("src/combo-box.js");
  const comboboxSource = await read("src/combobox.js");
  const cssSource = await read("src/combobox.css");

  const attributes = extractAttributes(elementSource);
  const members = extractPublicMembers(elementSource);
  const events = extractEvents(comboboxSource);
  const cssProperties = extractCssProperties(cssSource);

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    readme: "README.md",
    modules: [
      {
        kind: "javascript-module",
        path: "src/combo-box.js",
        declarations: [
          {
            kind: "class",
            name: "ComboBoxElement",
            description:
              "Autonomous custom element (no Shadow DOM) wrapping the Combobox enhancement engine for a child <select> or <input list>.",
            tagName: TAG,
            attributes: attributes.map((name) => ({ name })),
            members: members.map(({ kind, name, static: isStatic, description }) => ({
              kind,
              name,
              ...(isStatic ? { static: true } : {}),
              ...(description ? { description } : {}),
            })),
            events: events.map((name) => ({ name })),
            cssProperties: cssProperties.map((name) => ({ name })),
          },
        ],
        exports: [
          {
            kind: "js",
            name: "ComboBoxElement",
            declaration: { name: "ComboBoxElement", module: "src/combo-box.js" },
          },
          {
            kind: "js",
            name: "defineCombobox",
            declaration: { name: "defineCombobox", module: "src/combo-box.js" },
          },
        ],
      },
    ],
  };

  await writeFile(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `wrote ${OUT} (${attributes.length} attributes, ${members.length} members, ${events.length} events, ${cssProperties.length} css properties)`,
  );
}

await main();
