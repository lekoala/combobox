# AGENTS.md

## Mission

Build a small, native-first combobox/filterable-select enhancer. Prefer browser/platform primitives, native form semantics, and a compact declarative API over compatibility machinery or framework-specific abstractions.

## Invariants

- The original `<input>` or `<select>` is the form-value owner.
- Generated search/filter inputs are interaction controls and MUST NOT have a `name`.
- `input+datalist` means free-form text; `select` means constrained values.
- `<select multiple>` is the multiple-value model. Do not invent a hidden serialized state.
- For a `<select>`, option identity is the `HTMLOptionElement`; `option.value` is serialized payload only. Duplicate `value`s are distinct choices; selection order, chips and `remove`/`move` key on the exact option (a `WeakMap` for chips keeps `data-value` inspection-only). Resolving a bare value means the first selectable matching option; a bare-value `select` never materializes a new option.
- `<combo-box>` is a declarative lifecycle boundary only: the contained `<select>`/`<input list>` stays the value owner. `src/` is pure ESM with zero `window.*`/`globalThis.*`. Importing `src/index.js`/`combobox.js`/`combo-box.js` must never touch `customElements`; only `src/define.js` (and the classic build generated from it) registers the element. Test-only globals are confined to the Playwright harness (`test/browser/helpers.js`).
- Anything the engine mutates on an element it does **not** own (filter input, source input/select, `<label>`) must be snapshot/restored exactly by `dispose()`: attributes via one `captureAttributes(...).restore()` snapshot, invented `<label>` ids stripped again.
- The custom `tokenize` seam returns `{ tokens: string[], rest?: string }`: `tokens` are complete and consumed, `rest` is the trailing incomplete text that must keep living in the input (default `""`). An array-returning tokenizer is not a valid contract.
- Keep catalogue order, result order, and selection order separate.
- Remote results are transient. Do not append every remote result to the native select; materialize a native option when a remote item is selected.
- Enhanced picker = Popover top layer + CSS Anchor Positioning. Do not add `getBoundingClientRect()` placement, global scroll/resize positioning listeners, `dropdownParent`, or modal-specific positioning hacks.
- Use `popover="manual"`; outside-click/Escape behavior is owned by the component to avoid light-dismiss races with focus-driven opening.
- ARIA model: focus stays on the input; `role=combobox` + `aria-activedescendant`; picker is `listbox`; results are `option`.
- Strings rendered by the core are text, not HTML. Rich renderers return DOM Nodes.
- Value mutations dispatch native `input` then `change`, and do not fire them when the value did not change.
- All `combobox:before*` events are synchronous and cancellable. Do not pretend DOM cancellation can await a modal; async guard/confirmation semantics must be designed explicitly.
- `guards` distinguish `false` from a rejection. `false` is a voluntary refusal and mutates nothing. A rejected promise is an application error: surface it to the programmatic caller, and on user interaction at least a generic error path/documentation. A user cancelling a confirmation dialog must resolve `false`, not reject.
- Tokenized/separator creation is strictly sequential: per token, existing → select, else `canCreate` → guard → create → select, then the next token. Never `Promise.all` a batch. `maxItems` is re-evaluated between tokens. A trailing incomplete token stays in the input.
- `maxOptions` is a rendering cap only. `results.length` may be 500 with `maxOptions: 20`; at most 20 options render. `0` means no cap. `loadMore()` may enrich the result store but must never bypass `maxOptions`; a pagination UI is a separate concept.
- The JavaScript API and `<combo-box>` attributes are the **two** canonical configuration surfaces. `<combo-box>` attributes expose simple serializable behavior declaratively (booleans honor `="false"`); JavaScript options expose the same configuration plus functions and structured behavior. Native form semantics (name, multiple, required, disabled, optgroup, selected) remain on the enhanced `<input>`/`<select>`. `data-*` attributes on source items are application metadata exposed via `item.data`, never combobox configuration; there is no generic `data-*` → option mapping and no source-level `data-*` configuration API.
- `createOnBlur` means actually leaving the combobox. A blur caused by internal interaction (picker click, adornment action, chip removal, clear) must never create input. IME composition (`isComposing`) also blocks blur-creation.
- `maxItems` never corrects pre-existing native state at init/refresh. Six selected options with `max-items="5"` keep all six; the cap only blocks future additions. This matters for server-rendered content and form reset.
- `labelField`/`valueField` map data objects only; real `<option>` elements are already canonical `{ value, label }` and are not reinterpreted.
- No core option auto-injects a clear button. A clear affordance is authored by the application and calls `clear()`.

## Progressive enhancement

Modern browsers are the preferred target. Unsupported browsers must not break the form.

Fallback may add only low-cost behavior that does not recreate the picker engine. Current example: a creatable native multiple select can get an unnamed Add input. Do not grow fallback into a second implementation.

## Non-goals

Do not add without a concrete use case and design review:

- plugin architecture;
- virtualization;
- drag/drop chip sorting;
- caret positions between chips;
- checkbox dropdowns;
- Bootstrap JS dependency;
- a custom AJAX configuration language.

Ordering itself is a core concern. Expose model operations (`move`) and keyboard-accessible behavior; let applications add drag/drop externally if they truly need it.

## Public seams to preserve

Filtering/search: `match` (includes | startswith | fuzzy | pattern | function), `searchFields`, `filter`, `score`, `sort`, `beforefilter`, `applyFilter`.

Async data: `shouldLoad`, `load(query, { signal, cursor, source, input, combobox })`, `beforeload/load/loaderror`, transient `setResults`, future cursor pagination.

Creation: `createFilter`, sync/async `create`, `beforecreate/create/createerror`.

Value/API: `select`, `remove`, `clear`, `addOption`, `setOptions`, `sync`, `getSelectedValues`, `getSelectedItems`, `move`.

Element/registration: `defineCombobox()`, `upgrade`, `configure`, `whenReady`, `dispose`. The official name is fixed to `combo-box`; an application-specific tag is a native subclass of the exported `ComboBoxElement`. Registration is always explicit: the engine modules never call `customElements.define` on load — `src/define.js` is the designated side-effect entry and the sole input to the generated classic build.

Lifecycle: `init`, `getInstance`, `getOrCreateInstance`, `show`, `hide`, `dispose`.

## Working style

- Keep the implementation readable before making it clever.
- Prefer a small helper with an explicit contract over a new generic abstraction.
- Do not add aliases or compatibility options without a concrete current use case.
- When behavior changes, update the relevant docs and add/adjust a browser test in the same change.
- Test the native source state, not only generated DOM.
- Any bug involving focus, keyboard, popover state, forms, validation, browser layout, IME, or ARIA needs a real-browser regression test.
- Unit-test pure matching/tokenization/order helpers after extraction; do not use a DOM shim as a substitute for browser interaction tests.
- Work inside the project directory. Use the gitignored `.temp/` folder for throwaway artifacts (screenshots, ad-hoc scripts); never write outside the workspace.
- During implementation, run `bun run check`. Regenerate committed artifacts with `bun run sync` once the source change is complete. `bun run verify` is the final pre-commit/release gate; a drift between committed artifacts and a fresh `sync` is a `verify`/CI failure, not a day-to-day `check` failure.

## Commands

```bash
bun install
bun run lint
bun run typecheck
bun run test          # unit tests
bun run check         # source quality only: syntax + lint + typecheck + unit (never touches dist/)
bun run sync          # regenerate committed artifacts: bundle + CSS + dist/types + custom-elements.json
bun run verify        # final gate: check + sync + type consumer + generated drift + package contract
bun run test:types    # TypeScript consumer contract (needs sync first)
bun run test:browser  # Chromium behavior suite (source ESM)
bun run test:dist     # dist bundle smoke (needs sync first)
bun run check:package # npm tarball contract
bun run check:generated # drift gate for committed dist/ + custom-elements.json (part of verify)
bun run check:all     # verify + firefox/webkit browser matrix + dist smoke
```

`check` = syntax + lint + typecheck + unit. It never builds and never runs the drift
gate: a source edit mid-task legitimately produces temporary drift. `verify` is the
final pre-commit/release gate — it regenerates (`sync`) and then rejects any deviation
between committed artifacts and a fresh sync. The behavioral browser suite targets the
ESM source; only `test/dist` exercises the generated bundle.

The demo (`demo/index.html`) always loads the generated classic `dist/combobox.js` and
`dist/combobox.css` (self-registers `<combo-box>` with zero globals), so it works over
both http(s) and `file://` after a single `bun run sync`. The demo validates the
distributable; the source ESM is exercised directly by the unit/browser test suites.
Generated artifacts are committed; never hand-edit `dist/` or `custom-elements.json` —
the `verify`/CI drift gate rejects out-of-sync generated files.

## Definition of done for a feature

A feature is not done until:

1. the native/fallback behavior is known;
2. the enhanced keyboard path is specified;
3. source/form state stays correct;
4. lifecycle/events are documented;
5. cancellation/error/disabled cases are considered;
6. browser tests cover the normal path plus at least one edge case;
7. `dispose()` restores/cleans up anything the feature changed.
