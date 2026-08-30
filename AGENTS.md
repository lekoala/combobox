# AGENTS.md

## Mission

Build a small, native-first combobox/filterable-select enhancer. Prefer browser/platform primitives over compatibility machinery. Preserve the useful real-world capabilities of `bootstrap5-tags` and `bootstrap5-autocomplete` without recreating Tom Select or Select2.

## Invariants

- The original `<input>` or `<select>` is the form-value owner.
- Generated search/filter inputs are interaction controls and MUST NOT have a `name`.
- `input+datalist` means free-form text; `select` means constrained values.
- `<select multiple>` is the multiple-value model. Do not invent a hidden serialized state.
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
- Canonical options are `<combo-box>` attributes (e.g. `separators`, `max-options`, `create-on-blur`, `label-field`, `value-field`, `close-on-select`, `autoselect-first`). Do not add new `data-*` attributes as official API; `data-separator` may live on the source only as legacy migration compatibility.
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

Filtering/search: `match`, `searchFields`, `filter`, `score`, `sort`, `beforefilter`, `applyFilter`.

Async data: `shouldLoad`, `load(query, { signal, cursor, source, input, combobox })`, `beforeload/load/loaderror`, transient `setResults`, future cursor pagination.

Creation: `createFilter`, sync/async `create`, `beforecreate/create/createerror`.

Value/API: `select`, `remove`, `clear`, `addOption`, `setOptions`, `sync`, `getSelectedValues`, `getSelectedItems`, `move`.

Element/registration: `defineCombobox(name = "combo-box", registry)`, `upgrade`, `configure`, `whenReady`, `dispose`. Registration is always explicit: the engine modules never call `customElements.define` on load — `src/define.js` is the designated side-effect entry and the sole input to the generated classic build.

Lifecycle: `init`, `getInstance`, `getOrCreateInstance`, `show`, `hide`, `dispose`.

## Working style

- Keep the implementation readable before making it clever.
- Prefer a small helper with an explicit contract over a new generic abstraction.
- Do not preserve an old option merely for API nostalgia; classify it in `docs/MIGRATION.md` first.
- When behavior changes, update the relevant docs and add/adjust a browser test in the same change.
- Test the native source state, not only generated DOM.
- Any bug involving focus, keyboard, popover state, forms, validation, browser layout, IME, or ARIA needs a real-browser regression test.
- Unit-test pure matching/tokenization/order helpers after extraction; do not use a DOM shim as a substitute for browser interaction tests.
- Work inside the project directory. Use the gitignored `.temp/` folder for throwaway artifacts (screenshots, ad-hoc scripts); never write outside the workspace.

## Commands

```bash
bun install
bun run lint
bun run test:unit
bun run build
bun run test:browser
bun run test:dist
bun run check
```

`check` = syntax + lint + unit + build + browser + dist smoke. The behavioral browser
suite targets the ESM source; only `test/dist` exercises the generated bundle.

The demo (`demo/index.html`) runs from ESM over http(s). For `file://` it needs
`bun run build` first (the classic build self-registers `<combo-box>` with zero globals;
JS-only demo sections degrade to native controls under `file://`).

## Definition of done for a feature

A feature is not done until:

1. the native/fallback behavior is known;
2. the enhanced keyboard path is specified;
3. source/form state stays correct;
4. lifecycle/events are documented;
5. cancellation/error/disabled cases are considered;
6. browser tests cover the normal path plus at least one edge case;
7. `dispose()` restores/cleans up anything the feature changed.
