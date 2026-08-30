# AGENTS.md

## Mission

Build a small, native-first combobox/filterable-select enhancer. Prefer browser/platform primitives over compatibility machinery. Preserve the useful real-world capabilities of `bootstrap5-tags` and `bootstrap5-autocomplete` without recreating Tom Select or Select2.

## Invariants

- The original `<input>` or `<select>` is the form-value owner.
- Generated search/filter inputs are interaction controls and MUST NOT have a `name`.
- `input+datalist` means free-form text; `select` means constrained values.
- `<select multiple>` is the multiple-value model. Do not invent a hidden serialized state.
- `<combo-box>` is a declarative lifecycle boundary only: the contained `<select>`/`<input list>` stays the value owner. It is never auto-registered and has no shadow root.
- Keep catalogue order, result order, and selection order separate.
- Remote results are transient. Do not append every remote result to the native select; materialize a native option when a remote item is selected.
- Enhanced picker = Popover top layer + CSS Anchor Positioning. Do not add `getBoundingClientRect()` placement, global scroll/resize positioning listeners, `dropdownParent`, or modal-specific positioning hacks.
- Use `popover="manual"`; outside-click/Escape behavior is owned by the component to avoid light-dismiss races with focus-driven opening.
- ARIA model: focus stays on the input; `role=combobox` + `aria-activedescendant`; picker is `listbox`; results are `option`.
- Strings rendered by the core are text, not HTML. Rich renderers return DOM Nodes.
- Value mutations dispatch native `input` then `change`, and do not fire them when the value did not change.
- All `combobox:before*` events are synchronous and cancellable. Do not pretend DOM cancellation can await a modal; async guard/confirmation semantics must be designed explicitly.

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

Element/registration: `defineCombobox(name = "combo-box", registry)`, `upgrade`, `configure`, `whenReady`, `dispose`. Registration is always explicit; the scripts must never call `customElements.define` on load.

Lifecycle: `init`, `getInstance`, `getOrCreateInstance`, `show`, `hide`, `dispose`.

## Working style

- Keep the implementation readable before making it clever.
- Prefer a small helper with an explicit contract over a new generic abstraction.
- Do not preserve an old option merely for API nostalgia; classify it in `docs/MIGRATION.md` first.
- When behavior changes, update the relevant docs and add/adjust a browser test in the same change.
- Test the native source state, not only generated DOM.
- Any bug involving focus, keyboard, popover state, forms, validation, browser layout, IME, or ARIA needs a real-browser regression test.
- Unit-test pure matching/tokenization/order helpers after extraction; do not use a DOM shim as a substitute for browser interaction tests.

## Commands

```bash
bun install
bun run lint
bun run test:browser
bun run check
```

The demo can also be opened directly from `demo/index.html`.

## Definition of done for a feature

A feature is not done until:

1. the native/fallback behavior is known;
2. the enhanced keyboard path is specified;
3. source/form state stays correct;
4. lifecycle/events are documented;
5. cancellation/error/disabled cases are considered;
6. browser tests cover the normal path plus at least one edge case;
7. `dispose()` restores/cleans up anything the feature changed.
