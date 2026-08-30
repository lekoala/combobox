# New project setup

## Repository purpose

A small native-first combobox/filterable-select enhancer, replacing the overlapping use cases of the two Bootstrap-era libraries while remaining independent from Bootstrap JS.

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

- `src/index.js` — ESM barrel: `export { Combobox }` (`default` too), `ComboBoxElement`, `defineCombobox`, plus the pure helpers (`normalize`, `toItem`, `parseSeparators`, `splitTokens`, `rankByScore`, `reconcileSelected`, `moveValueInOrder`) from `src/helpers.js`. Importing it **never registers** anything.
- `src/define.js` — side-effect entry that calls `defineCombobox()`; importing `@lekoala/combobox/define` registers `<combo-box>`.
- `dist/combobox.js` (`bun run build`, from `src/define.js`) — a self-contained iife classic script that registers `<combo-box>` and nothing else, keeping `file://` and classic `<script>` consumers working without a server. No globals are leaked.
- `./combobox.css` ships as a subpath export.
- Types are generated from checked JSDoc; no TypeScript source/transpilation.

`package.json` shape:

```json
{
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./define": "./src/define.js",
    "./combobox.css": "./src/combobox.css"
  },
  "scripts": {
    "build": "bun build src/define.js --outfile=dist/combobox.js --format=iife"
  }
}
```

## Browser policy

Preferred/enhanced experience requires the chosen Popover + CSS Anchor feature gate.

Unsupported browser policy:

- native controls remain fully form-functional;
- cheap non-picker enhancements are allowed;
- no legacy positioning engine is bundled.

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
- [ ] create generated types/checkJs setup.
- [ ] implement full P0 browser-test matrix.
- [ ] test current Chromium + Firefox + WebKit and document support policy.
- [ ] write legacy migration examples once API is frozen.

## Recommended first commits

1. `chore: bootstrap native combobox project` — docs, POC, test harness only.
2. `test: codify native source and picker invariants` — tests before refactor.
3. `refactor: separate transient results from native source` — already prototyped here; harden with tests.
4. `feat: complete keyboard and lifecycle contract`.
5. `feat: remote loading and creation parity`.
6. `feat: tokenization and ordered selection`.

This order prevents an agent from “cleaning up” the POC into abstractions before the behavioral contracts are executable.
