# New project setup

## Repository purpose

A small native-first combobox/filterable-select enhancer built on native form controls, independent from Bootstrap JS.

## Suggested project metadata

- License: MIT.
- Language: modern browser JavaScript with JSDoc/type checking; no framework runtime.
- Runtime dependencies: none unless a concrete feature proves otherwise.
- Preferred implementation: no transpilation/build requirement for source development; minified release artifact can be generated separately.
- Styling: small structural CSS; Bootstrap 5-compatible skin can use Bootstrap variables/classes without coupling JS to Bootstrap.
- CI: syntax/lint + real-browser tests.

Working project identity is intentionally boring: repository `combobox`, npm package `@lekoala/combobox`, primary element `<combo-box>`, engine class `Combobox`. The tag registration remains explicit so applications can choose another custom-element name if the global registry already contains `combo-box`.

## POC vs publishable package

The POC reached its final shape: the whole source tree is **pure ESM with zero
`window.*`/`globalThis.*`** and the classic `file://` path is handled by one generated
artifact, never by hand-maintained duplicate files.

**Decision (implemented):** the package entry is ESM; `src/define.js` is the only
side-effect entry and the single source of the generated classic build.

Final export contract:

- `src/index.js` — ESM barrel: `export { Combobox }` (`default` too), `ComboBoxElement`, `defineCombobox`, plus the pure helpers (`normalize`, `toItem`, `parseSeparators`, `splitTokens`, `rankByScore`, `reconcileSelected`, `moveValueInOrder`) from `src/helpers.js`. Public types (`ComboboxOptions`, `ComboboxItem`, `ComboboxSource`, `LoadContext`) are re-exported as JSDoc typedefs. Importing it **never registers** anything.
- `src/define.js` — side-effect entry that calls `defineCombobox()`; importing `@lekoala/combobox/define` registers `<combo-box>`.
- `dist/combobox.js` / `dist/combobox.min.js` (`bun run build`, from `src/define.js`) — self-contained iife classic scripts that register `<combo-box>` and nothing else, keeping `file://` and classic `<script>` consumers working without a server. No globals are leaked.
- `dist/combobox.css` / `dist/combobox.min.css` ship as subpath exports; the demo loads `dist/combobox.css` so the distributed CSS is exercised.
- Types are generated from checked JSDoc (`tsconfig.types.json` → `dist/types`); no TypeScript source/transpilation. A `custom-elements.json` manifest is generated from the element source.
- All generated artifacts are committed; `check:generated` rejects drift.

`package.json` shape:

```json
{
  "type": "module",
  "exports": {
    ".": { "types": "./dist/types/index.d.ts", "import": "./src/index.js" },
    "./define": { "types": "./dist/types/define.d.ts", "import": "./src/define.js" },
    "./combobox.css": "./src/combobox.css",
    "./dist/combobox.js": "./dist/combobox.js",
    "./dist/combobox.min.js": "./dist/combobox.min.js",
    "./dist/combobox.css": "./dist/combobox.css",
    "./dist/combobox.min.css": "./dist/combobox.min.css"
  },
  "files": ["dist", "src", "custom-elements.json", "LICENSE", "README.md"],
  "scripts": {
    "typecheck": "tsc -p jsconfig.json",
    "types": "tsc -p tsconfig.types.json",
    "build:bundle": "bun scripts/build.js",
    "build:types": "bun run types",
    "build:manifest": "bun scripts/custom-elements.js",
    "build": "bun run build:bundle && bun run build:types && bun run build:manifest",
    "check:package": "bun scripts/check-package.js",
    "check:generated": "git diff --exit-code -- dist custom-elements.json"
  }
}
```

## Browser policy

Preferred/enhanced experience requires the chosen Popover + CSS Anchor feature gate.

Unsupported browser policy:

- native controls remain fully form-functional;
- cheap non-picker enhancements are allowed;
- no JavaScript positioning engine is bundled.

Before v1, document the actual tested browser floor based on the feature gate and current stable browser matrix rather than a guessed version list.

## Initial repository checklist

- [x] README and architecture docs.
- [x] AGENTS.md.
- [x] MIT license.
- [x] demo runnable without server.
- [x] package scripts scaffold.
- [x] Playwright smoke suite scaffold.
- [x] GitHub Actions starter workflow.
- [x] working repo/npm/tag naming: `combobox` / `@lekoala/combobox` / `<combo-box>`.
- [x] freeze Phase 0 API questions.
- [x] convert the POC source to pure ESM exports + generated classic build (`src/define.js` → `dist/combobox.js`) with zero globals.
- [x] browser suite targets the ESM source; `test/dist` smoke-tests the bundle.
- [x] generated types/checkJs setup (`strict` checkJs; `tsconfig.types.json` → `dist/types`; consumer locked by `test/types/consumer.ts`).
- [x] implement full P0 browser-test matrix (browser suite spans Chromium/Firefox/WebKit; `check` stays Chromium-only, `test:browser:all`/`check:all` cover Firefox+WebKit).
- [x] test current Chromium + Firefox + WebKit and document support policy (Playwright 1.62 bundles engines that all satisfy the Popover + CSS Anchor feature gate, so the enhanced picker exercises on all three).
- [ ] refresh `docs/MIGRATION.md` examples once the API freezes.

## Development commands

```bash
bun install
bunx playwright install chromium firefox webkit   # all three matrix engines
bun run build
bun run check                # static chain + Chromium browser + dist smoke
bun run check:all            # + Firefox + WebKit browser
bun run test:types           # TypeScript consumer contract (after build)
bun run check:package        # npm tarball contract
```

## Recommended first commits

1. `chore: bootstrap native combobox project` — docs, POC, test harness only.
2. `test: codify native source and picker invariants` — tests before refactor.
3. `refactor: separate transient results from native source` — already prototyped here; harden with tests.
4. `feat: complete keyboard and lifecycle contract`.
5. `feat: remote loading and creation parity`.
6. `feat: tokenization and ordered selection`.

This order prevents an agent from “cleaning up” the POC into abstractions before the behavioral contracts are executable.
