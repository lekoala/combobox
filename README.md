# @lekoala/combobox

A small native-first combobox/filterable-select library that replaces the overlapping responsibilities of `bootstrap5-tags` and `bootstrap5-autocomplete`.

The project deliberately starts from browser primitives and Open UI concepts, while using Tom Select and Select2 as functional regression checklists rather than architectural templates. Working identity is intentionally boring: npm package `@lekoala/combobox`, engine class `Combobox`, primary element `<combo-box>`.

> **Status:** ready for implementation work, not ready for publication. The current source is two readable classic files — `src/combobox.js` (engine) and `src/combo-box.js` (custom element wrapper). Public contracts and invariants are documented; several production details are still marked TODO.

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

There is intentionally **no legacy JavaScript positioning engine**.

## Declarative `<combo-box>` element

The engine is exposed two ways that share the exact same machinery:

```html
<!-- declarative: the wrapper owns nothing, the select stays the value owner -->
<combo-box create placeholder="Search or create a framework…">
  <select name="frameworks[]" multiple>
    <option value="react">React</option>
  </select>
</combo-box>
```

```js
// imperative: enhance an existing source directly
Combobox.getOrCreateInstance(document.querySelector("select"));
```

`<combo-box>` is an autonomous custom element with no Shadow DOM; it is **not** form-associated and never owns the submitted value. It is **not** auto-registered by the scripts — call `defineCombobox()` explicitly so the global `customElements` registry is only touched on purpose:

```js
defineCombobox();                 // registers "combo-box"
defineCombobox("app-combobox");   // same engine under an application namespace
```

Attributes map to options (`create`, `placeholder`, `search`, `min-chars`, `max-items`, `max-options`, `selection-order`, `separators`, `create-on-blur`, `close-on-select`, `autoselect-first`, `label-field`, `value-field`, `load-on-empty`, `allow-empty-option`, `debounce`). JavaScript-only behavior (remote `load`, `create`, renderers, async `guards`) is passed through `<element>.configure({ ... })`. See [Element API](docs/API.md#element-and-registration).

## Progressive fallback

If Popover + the required CSS Anchor features are unavailable, native controls stay visible and functional.

- `input + datalist` → native datalist.
- `select` → native select.
- `select multiple` → native multiple select.
- `select multiple[data-create]` → native select plus a small unnamed Add input/button. This is a cheap enhancement only; there is still no custom picker/placement fallback.

Use `?native=1` in the demo to force this mode.

## Try the POC

`demo/index.html` is intentionally file-friendly: unzip the project and open it directly. No server is required.

The demo covers:

1. free-text `input + datalist`;
2. filterable single select with an explicit sibling filter input;
3. multiple select + chips + chip keyboard navigation;
4. creatable multiple select with `createFilter`;
5. explicit selection order + `move()`;
6. async/remote result loading with transient results;
7. programmatic selection of an externally created entity;
8. declarative `<combo-box>` with attribute-driven options;
9. `defineCombobox("app-combobox")` + JS-only options via `configure()`;
10. RTL;
11. async `guards` (confirm add/remove/clear) + separators + `create-on-blur`;
12. `max-items` without mutilating server-rendered over-limit selections;
13. disabled options toggled at runtime;
14. `max-options` as a pure rendering cap;
15. rich renderers returning DOM `Node`s with hostile string data;
16. application-authored clear affordance calling `clear()`;
17. `label-field`/`value-field`/`search-fields` over data objects;
18. form reset restoring the native selection and chips.

## Important architecture contracts

1. **Native source remains authoritative.** Form data, required/disabled state, reset and native integration start from the original input/select.
2. **Catalogue, results and selection are separate concepts.** Remote search results do not become hundreds of `<option>` elements. A remote result becomes a native option when it is selected.
3. **Selection order is explicit when needed.** Source order, result order and selection order must not be conflated.
4. **Filtering is interceptable.** `beforefilter` is cancellable and exposes `event.query`, following the direction explored by Open UI.
5. **Async transport is application-owned.** The core provides `load(query, context)`, debounce/abort/lifecycle seams; it does not invent `serverParams`, `queryParam`, `serverDataKey`, etc.
6. **Rendering is safe by default.** Strings become text. Rich rendering returns DOM `Node`s; there is no global `allowHtml` switch.
7. **Bootstrap is a skin, not a dependency.** The JS should not depend on Bootstrap JS or positioning utilities.

See [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [Use cases](docs/USE_CASES.md), [Project setup](docs/PROJECT_SETUP.md), and [References](docs/REFERENCES.md).

## Explicit non-goals

For the initial library:

- no plugin framework;
- no virtualization;
- no built-in drag/drop of chips;
- no virtual caret between chips;
- no checkbox-picker mode;
- no Select2-style adapter/decorator architecture;
- no JavaScript dropdown geometry fallback.

Reordering **is** a core data concern; drag/drop is merely one possible UI for calling `move()` and therefore stays outside the core.

## Repository layout

```text
AGENTS.md                 implementation rules for coding agents/contributors
README.md                 project overview
demo/index.html           file://-friendly architecture demo
src/helpers.js            pure helpers (normalization, items, separators/tokenizer)
src/combobox.js           engine: Combobox class (+ window.Combobox)
src/combo-box.js          custom element wrapper: defineCombobox()
src/combobox.css          minimal demo/component skin
docs/ARCHITECTURE.md      invariants and internal model
docs/API.md               proposed public API/events
docs/USE_CASES.md         real application scenarios
docs/MIGRATION.md         old libraries -> new design
docs/TESTING.md           exhaustive test plan + reference suites
docs/ROADMAP.md           implementation phases
test/unit/helpers.test.js pure-helper unit tests
test/browser/*.spec.js    Playwright browser regression suites
```

## Development

The library itself has no runtime dependencies and no build step.

Suggested setup:

```bash
bun install
bunx playwright install chromium
bun run check
```

The browser suite is the important suite: Popover, focus, form validation, keyboard behavior and Anchor Positioning need a real browser. Pure matching/tokenization/order helpers are unit-tested in `test/unit` (`bun run test:unit`).

## Before publishing a v1

The contracts are intentionally ahead of the implementation. In particular, complete the P0 items in [ROADMAP.md](docs/ROADMAP.md), then run the full matrix in [TESTING.md](docs/TESTING.md) across current Chromium, Firefox and WebKit.
