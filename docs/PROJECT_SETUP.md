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

The POC keeps `window.Combobox`, `window.ComboBoxElement`, and `window.defineCombobox` so `demo/index.html` works directly under `file://`. It uses two classic source files: the engine and the Custom Element wrapper.

Before npm publication, convert the package entry to normal ESM and decide whether a separate global/browser build is worth shipping. Do not maintain two hand-written implementations.

Candidate export shape after that decision:

```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./types/combobox.d.ts",
      "import": "./src/index.js"
    },
    "./combobox.css": "./src/combobox.css"
  },
  "sideEffects": ["*.css"]
}
```

Types can be generated from checked JSDoc if that remains sufficient; TypeScript source/transpilation is not required merely to publish types.

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
- [ ] freeze Phase 0 API questions.
- [ ] convert the two POC globals to final ESM exports without changing the engine/wrapper split.
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
