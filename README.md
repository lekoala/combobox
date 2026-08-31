# @lekoala/combobox

A small native-first combobox and filterable-select library built around native form controls, Popover, CSS Anchor Positioning, and progressive enhancement.

The project deliberately starts from browser primitives and Open UI concepts. Working identity is intentionally boring: npm package `@lekoala/combobox`, engine class `Combobox`, primary element `<combo-box>`.

> **Status:** v0.1.0. The source is pure ESM in `src/` with **zero globals**; a generated classic build (`dist/combobox.js`, from `src/define.js`) covers `file://` and classic `<script>` consumers, with committed minified CSS/JS, generated `dist/types` declarations and a Custom Elements Manifest. CSS Anchor Positioning + the Popover API are the only modern-feature floor; older engines degrade to native controls.

Migrating from `bootstrap5-tags` or `bootstrap5-autocomplete`? See [Migrating to Combobox](docs/MIGRATION.md).

## Core idea

One `Combobox` enhances two native value models:

```text
<input list="...">       free-form value
        │
        └── the input owns the submitted value

<select>                  constrained single value
<select multiple>         constrained multiple values
        │
        └── the select owns submitted values
```

For select-backed controls, the searchable input is an **unnamed interaction control**. It never replaces the select as the form-value owner.

Modern mode uses:

- Popover API (`popover="manual"`) for the top layer;
- CSS Anchor Positioning for placement and flipping;
- combobox/listbox/option ARIA semantics;
- native `input` + `change` events for integration;
- `AbortSignal` + promises for async work.

There is intentionally **no JavaScript positioning engine** and **no global `window.*` API**.

## Usage surfaces

The same machinery is reached three ways, each free of global pollution:

**Declarative `<combo-box>`** — the recommended API. Loading the element registers
`<combo-box>` in the standard `customElements` registry and that is the only global
action ever taken:

```html
<script type="module">
  import "@lekoala/combobox/define";
</script>
<combo-box create placeholder="Search or create a framework…">
  <select name="frameworks[]" multiple>
    <option value="react">React</option>
  </select>
</combo-box>
```

Configure JavaScript-only behavior (remote `load`, `create`, renderers, async `guards`)
directly on the element, before or after upgrade:

```js
const patients = document.getElementById("patients");
patients.options = { minChars: 2, async load() { /* … */ } };
```

**Imperative ESM** — enhance an existing source without the element:

```js
import Combobox from "@lekoala/combobox";

const combo = new Combobox(document.querySelector("select"), { /* options */ });
```

**Classic / file://** — the generated single-file build self-registers `<combo-box>`
only (still no `window.Combobox`; the element is the whole surface):

```html
<script src="dist/combobox.js"></script>
<combo-box><select>…</select></combo-box>
```

`defineCombobox()` is exported and stays idempotent — the second call returns
the same constructor:

```js
import { defineCombobox } from "@lekoala/combobox";
defineCombobox();                 // registers <combo-box>
```

The official name is fixed. An application-specific tag is native subclassing
on the exported `ComboBoxElement`:

```js
import { ComboBoxElement } from "@lekoala/combobox";
customElements.define("app-combobox", class extends ComboBoxElement {});
```

`<combo-box>` is an autonomous custom element with no Shadow DOM; it is **not**
form-associated and never owns the submitted value. Registering `combo-box` never
happens implicitly — `import "@lekoala/combobox"` does not register anything, you
must opt in via `@lekoala/combobox/define`, an explicit `defineCombobox()`, or the
classic build.

Attributes map to options (`create`, `placeholder`, `search`, `min-chars`, `max-items`, `max-options`, `selection-order`, `separators`, `create-on-blur`, `close-on-select`, `autoselect-first`, `tab-select`, `search-fields`, `label-field`, `value-field`, `load-on-empty`, `allow-empty-option`, `debounce`; numeric attributes take integers, invalid values fall back to defaults). JavaScript-only behavior (remote `load`, `create`, renderers, async `guards`) is passed through `<element>.configure({ ... })`. See [Element API](docs/API.md#element-and-registration). `data-*` on source items is application metadata only — there is no `data-*` configuration surface.

## Progressive fallback

If Popover + the required CSS Anchor features are unavailable, native controls stay visible and functional.

- `input + datalist` → native datalist.
- `select` → native select.
- `select multiple` → native multiple select.
- `select multiple` with `create` enabled → native select plus a small unnamed Add input/button. This is a cheap enhancement only; there is still no custom picker/placement fallback.

Use `?native=1` in the demo to force this mode.

## Try the POC

`demo/index.html` always loads the generated classic `dist/combobox.js`, so after a single
`bun run sync` it works identically over `http(s)` and directly from `file://`, validating
the distributed product. Run `bun run dev` to build and serve it at `http://127.0.0.1:4173/`.

The demo covers:

1. free-text `input + datalist`;
2. filterable single select with an explicit sibling filter input;
3. multiple select + chips + chip keyboard navigation;
4. creatable multiple select with `createFilter`;
5. explicit selection order + `move()`;
6. async/remote result loading with transient results;
7. programmatic selection of an externally created entity;
8. declarative `<combo-box>` with attribute-driven options;
9. JS-only options via `configure()` on the element;
10. RTL;
11. async `guards` (confirm add/remove/clear) + separators + `create-on-blur`;
12. `max-items` without mutilating server-rendered over-limit selections;
13. disabled options toggled at runtime;
14. `max-options` as a pure rendering cap;
15. rich renderers returning DOM `Node`s with hostile string data;
16. application-authored clear affordance calling `clear()`;
17. `label-field`/`value-field`/`search-fields` over data objects;
18. form reset restoring the native selection and chips;
19. declarative fuzzy search (`search="fuzzy"` + `search-fields` over `<option data-*>` metadata + `tab-select`, no JS).

## Important architecture contracts

1. **Native source remains authoritative.** Form data, required/disabled state, reset and native integration start from the original input/select.
2. **Option identity is the `<option>` element, not the `value` string.** Three `<option value="2">` are three distinct choices; selection, chips, removal, reorder and FormData all address the exact option. A bare `select("2")` picks the next *selectable* occurrence and never invents a fourth.
3. **Catalogue, results and selection are separate concepts.** Remote search results do not become hundreds of `<option>` elements. A remote result becomes a native option when it is selected.
4. **Selection order is explicit when needed.** Source order, result order and selection order must not be conflated.
5. **Filtering is interceptable.** `beforefilter` is cancellable and exposes `event.query`, following the direction explored by Open UI.
6. **Async transport is application-owned.** The core provides `load(query, context)`, debounce/abort/lifecycle seams; it does not invent `serverParams`, `queryParam`, `serverDataKey`, etc.
7. **Rendering is safe by default.** Strings become text. Rich rendering returns DOM `Node`s; there is no global `allowHtml` switch.
8. **Bootstrap is a skin, not a dependency.** The JS should not depend on Bootstrap JS or positioning utilities.

See [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [Use cases](docs/USE_CASES.md), [Project setup](docs/PROJECT_SETUP.md), and [References](docs/REFERENCES.md).

## Explicit non-goals

For the initial library:

- no plugin framework;
- no virtualization;
- no built-in drag/drop of chips;
- no virtual caret between chips;
- no checkbox-picker mode;
- no adapter/decorator architecture;
- no JavaScript dropdown geometry fallback.

Reordering **is** a core data concern; drag/drop is merely one possible UI for calling `move()` and therefore stays outside the core.

## Repository layout

```text
AGENTS.md                 implementation rules for coding agents/contributors
README.md                 project overview
demo/index.html           architecture demo (always loads the generated dist bundle/css)
src/index.js              pure ESM exports: engine + element + helpers + public types
src/define.js             single side-effect entry: registers <combo-box>
src/helpers.js            pure helpers (normalization, items, separators/tokenizer)
src/combobox.js           engine: Combobox class (ESM, no globals)
src/combo-box.js          custom element wrapper: ComboBoxElement + defineCombobox()
src/combobox.css          minimal demo/component skin
dist/combobox.js          generated classic build (iife, unminified)
dist/combobox.min.js      generated classic build (minified)
dist/combobox.css         component stylesheet
dist/combobox.min.css     minified component stylesheet
dist/types/*.d.ts         generated TypeScript declarations (from JSDoc)
custom-elements.json      generated Custom Elements Manifest
jsconfig.json             strict JSDoc typecheck surface (tsc checkJs)
tsconfig.types.json       declaration emission project (dist/types)
scripts/build.js          bundle + CSS artifact build
scripts/custom-elements.js custom-elements.json generator
scripts/check-package.js  npm tarball contract gate
docs/ARCHITECTURE.md      invariants and internal model
docs/API.md               proposed public API/events
docs/USE_CASES.md         real application scenarios
docs/MIGRATION.md         migrating from bootstrap5-tags/autocomplete
docs/TESTING.md           exhaustive test plan + reference suites
docs/ROADMAP.md           implementation phases
test/unit/helpers.test.js pure-helper unit tests (bun, ESM source)
test/browser/*.spec.js    Playwright behavioral suite (ESM source)
test/dist/*.spec.js       Playwright smoke tests for the dist bundle
test/types/consumer.ts    TypeScript consumer contract test against the published types
```

## Development

The library has **no runtime dependencies and no globals**. The only build is the
generated distribution artifacts: `bun run sync` produces the `dist/` bundle (iife
unminified + minified), the component CSS, the TypeScript declarations (`dist/types`)
and the Custom Elements Manifest (`custom-elements.json`). All generated artifacts are
committed and CI-enforced against drift.

```bash
bun install
bunx playwright install chromium firefox webkit
bun run check
bun run test:browser
bun run sync
bun run verify
```

`check` = syntax + lint + typecheck + unit — source quality only, it never builds and
never looks at `dist/`. `sync` regenerates the committed artifacts once the source change
is complete. `verify` is the final pre-commit/release gate: it re-runs `check`, regenerates
with `sync`, then rejects any drift between committed artifacts and a fresh sync plus the
published type/package contract. The browser suite runs against the **ESM source**
(`src/…`); only `test/dist` exercises the generated bundle.
`bun run check:all` / `bun run test:browser:all` extend the same suites to **Firefox +
WebKit** (current Playwright engines all satisfy the Popover + Anchor feature gate, so the
enhanced picker runs on all three). Popover, focus, form validation, keyboard behavior
and Anchor Positioning need a real browser. Pure matching/tokenization/order helpers
are unit-tested in `test/unit` (`bun run test`).

## Before publishing a v1

The v0.1.0 publishing shape is in place and CI-enforced: Chromium, Firefox and WebKit run
the browser matrix, `verify` gates check/sync/types/package contract/generated drift, and
`npm pack --dry-run` validates the tarball. Generated type declarations ship in
`dist/types` and the consumer contract is locked by `test/types/consumer.ts`. Run
`bun run check:all` before cutting a release.
