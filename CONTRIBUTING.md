# Contributing

Read `AGENTS.md` first, then the relevant design document.

For implementation changes:

1. state which documented use case/contract the change serves;
2. avoid adding compatibility machinery that violates the fallback policy;
3. add a real-browser regression test for interaction/form/a11y behavior;
4. update API/migration docs when public behavior changes;
5. keep unrelated cleanup out of behavior changes.

Source development needs no build: `src/` is pure ESM, and `bun run build` only
produces the generated classic distribution (`dist/combobox.js` from `src/define.js`)
for `file://`/classic-script consumers. The engine + Custom Element split and working
`@lekoala/combobox` identity are fixed. Never solve the export/distribution shape
opportunistically inside unrelated feature work — and never add a `window.*`/global
surface to `src/`; test-only globals are confined to the Playwright harness in
`test/browser/helpers.js`.
