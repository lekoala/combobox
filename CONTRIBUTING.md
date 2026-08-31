# Contributing

Read `AGENTS.md` first, then the relevant design document.

For implementation changes:

1. state which documented use case/contract the change serves;
2. avoid adding compatibility machinery that violates the fallback policy;
3. add a real-browser regression test for interaction/form/a11y behavior;
4. update API/migration docs when public behavior changes;
5. keep unrelated cleanup out of behavior changes.

Source development needs no build: `src/` is pure ESM, and `bun run build`
produces the generated artifacts (`dist/` bundle + CSS, `dist/types` from JSDoc,
`custom-elements.json`) for `file://`/classic-script consumers and the published
package. `bun run check` runs the full static chain (lint, typecheck, unit, build,
type consumer, package contract, generated drift) plus the Chromium browser and dist
smoke suites; `bun run check:all` extends to Firefox/WebKit. The engine + Custom
Element split and working `@lekoala/combobox` identity are fixed. Never solve the
export/distribution shape opportunistically inside unrelated feature work — and never
add a `window.*`/global surface to `src/`; test-only globals are confined to the
Playwright harness in `test/browser/helpers.js`. Generated artifacts are committed;
use `scripts/build.js`, `scripts/custom-elements.js` and `tsconfig.types.json` to
regenerate them and commit the result rather than hand-editing `dist/`.
