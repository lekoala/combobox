# Important use cases

These scenarios should drive implementation and tests.

## UC1 — Free-form autocomplete

```html
<input name="city" list="cities">
<datalist id="cities">...</datalist>
```

Requirements:

- arbitrary input value remains valid;
- native datalist is the no-enhancement fallback;
- enhanced mode never shows/flashes the UA datalist picker;
- local search is accent-insensitive by default;
- source input keeps `name`, validation and form semantics.

## UC2 — Filterable constrained single select

```html
<input data-filter-for="doctor" hidden>
<select id="doctor" name="doctor" required>...</select>
```

Requirements:

- search text is not the form value;
- selected option/value remains authoritative;
- single selection can be cleared when the HTML contract allows it;
- required validity follows the native select;
- label click focuses the enhanced input;
- disabled option/disabled optgroup cannot be selected.

## UC3 — Multiple select + chips

Requirements:

- chips mirror selected native options;
- remove button and keyboard removal update native selection;
- search remains focused while options/results refresh;
- Arrow Left/Right keyboard access to chips;
- max selections can prevent further additions without making existing chips impossible to remove;
- duplicate labels and duplicate values remain distinguishable by native option identity.

## UC4 — Creatable tags

Requirements:

- blank/whitespace is not created;
- creation validation is separate (`createFilter`);
- existing equivalent result should win over duplicate creation;
- async create can return a server ID distinct from label;
- creation can be cancelled/error cleanly;
- create state is visible when no normal result matches;
- basic fallback can still create an option through the cheap Add input;
- separators/paste multiple values are implemented (sequential token consumption, `maxItems` re-evaluated between tokens, trailing incomplete token stays in the input).

Real validation example:

- reject tags <= 2 characters;
- reject purely numeric tags because they may be confused with database IDs.

## UC5 — Remote search with dependent fields

Real application requirement: a query also depends on values from other form fields.

Do not encode “extra selectors” into the library. Read them in the loader:

```js
load: async (query, { signal }) => {
  const clinic = document.querySelector("#clinic").value;
  const params = new URLSearchParams({ q: query, clinic });
  return fetch(`/patients?${params}`, { signal }).then((r) => r.json());
}
```

### Reacting to a dependency change

The loader reads `#clinic`, but the combobox cannot know when that field
changes. Re-run the *existing* query through the normal pipeline when a
dependency moves:

```js
const box = document.querySelector("combo-box.patients");
const combo = await box.whenReady(); // or box.combobox on an upgraded element

document.querySelector("#clinic").addEventListener("change", () => {
  combo.search(combo.query); // programmatic: no input debounce, same abort/load path
});
```

Policy for the existing selection is application-owned: keep it (default),
`combo.remove(item)` it, or re-validate it once the new results land. A
dependency change while a request is in flight is safe — the previous call is
aborted through its `AbortSignal` and the engine guards stale responses by
search generation, so a late clinic-A response cannot overwrite clinic-B
results.

Requirements:

- debounce;
- previous request abort;
- stale response cannot overwrite newer query;
- dependency change while a request is in flight never mixes results;
- loading state does not briefly show no-results;
- errors do not destroy current selection;
- result store remains transient;
- only selected remote result is materialized into native select.

### Fallback

Remote loading is enhanced-mode only: in fallback mode there is no `load()`
pipeline and no picker. Load static options into the native select instead, or
leave it empty for the form to handle.

### Tests

`test/browser/remote.spec.js` covers the whole contract, including the recipe
above (“dependent loader reads a live field and refreshes when the dependency
changes”), abort/stale ordering, transient results, materialization on select
and error handling.

## UC6 — Business query guard

Real application requirement: endpoint accepts complete `DD/MM/YYYY`, but typing a partial date should not trigger remote calls.

```js
shouldLoad(query) {
  return !isPartialDate(query);
}
```

or:

```js
const select = document.querySelector("select.patients"); // the native source
select.addEventListener("combobox:beforeload", (event) => {
  if (isPartialDate(event.detail.query)) event.preventDefault();
});
```

`combobox:*` lifecycle events fire on the native source control, not on the
generated interaction input (only `beforefilter`/`filter` live there).

No transport override should be necessary.

## UC7 — External modal/API creates an entity

The component knows nothing about the modal.

Application flow:

```text
open application modal
→ submit form
→ server returns {id, name}
→ combo.select({value:id, label:name})
```

### Recette

```js
const box = document.querySelector("combo-box.patients");
const combo = await box.whenReady(); // or box.combobox on an upgraded element

combo.select({ value: id, label: name }); // materializes a native option when missing
```

`select()` materializes the missing native `<option>`, updates the chip/single
label, and emits exactly one native `input` then `change` — no
`new Option(...).trigger("change")` boilerplate.

### Fallback

Fallback adds no picker, but `addOption`/`select` still mutate the native
select directly, so the modal-created entity remains a real, submittable option.

### Tests

Exactly-once native events on programmatic mutation live in
`test/browser/events.spec.js`; materialization of an external/remote result is
covered in `test/browser/remote.spec.js`.

## UC8 — Clear / clear all

Core responsibility:

```js
combo.clear();
```

with cancellation (async `guards.clear`) + native value events.

The clear UI is application-authored (no core auto-injected clear button); it lives wherever the app wants — near the label, in the control wrapper or on an external button — and calls `clear()`.

## UC8b — Guarded mutations (business rules + confirmations)

Real application requirement: an email list must not combine `mr.x` and `ms.x`, and destructive actions need a confirmation dialog without blocking the renderer.

```js
guards: {
  add: async (label, ctx) => {
    if (exclusivePair(label)) return false;      // voluntary refusal
    return confirmDialog(`Add ${label}?`);       // cancel resolves false
  },
  remove: async (item, ctx) => confirmDialog(`Remove ${item.label}?`),
  clear: async (ctx) => confirmDialog("Clear all?"),
}
```

### Scope: creation is guarded, selecting an existing option is not

`guards.add` runs **only for a brand-new item** — an existing native or
transient match is selected before any guard runs (`#createItem`). The
exclusive-pair rule above blocks *creating* `ms.x`, but picking an existing
`ms.x` from the list still bypasses it.

For a rule that must block **every** addition, use the synchronous
`combobox:beforeselect` event, which fires on the native source before any
selection, existing or created:

```js
const source = document.querySelector("select.recipients");
source.addEventListener("combobox:beforeselect", (event) => {
  if (exclusivePair(event.detail.item.label)) event.preventDefault();
});
```

A rule that needs an **async confirmation covering selection too** has no
single turnkey guard today: combine a synchronous `beforeselect` rule with the
async `guards.*` confirmations, or design an explicit per-selection guard
contract. A user cancelling a confirmation dialog must resolve `false`, never
reject.

Requirements:

- `false` refuses and mutates nothing;
- a rejected promise is an application error surfaced as `combobox:guarderror`, never silently treated as `false`;
- `before*` events stay synchronous and fire only after the guard passes;
- tokenized/pasted batches apply guards per token, in order.

### Fallback

The fallback Add input runs the same create pipeline (`guards.add`,
`combobox:beforecreate`, `createerror`) and the same existing-match resolution.

### Tests

- guard semantics (`add`, `remove`, `clear`, rejections → `combobox:guarderror`): `test/browser/features.spec.js`;
- fallback create/guard parity: `test/browser/combobox-element.spec.js`.

## UC9 — Explicit selection order

Examples: ranked members, workflow priorities, ordered recipients.

Requirements:

- source catalogue order remains stable;
- result ranking is independent;
- chip/selection order is explicit;
- `move(value,index)` updates order model;
- ordered `FormData` can preserve that order;
- no built-in drag/drop requirement;
- keyboard reordering is specified and implemented (Alt+ArrowLeft/Right and Alt+Home/End on a focused chip) and covered by `order.spec.js`; no built-in drag/drop — apps wire `move()` to their own UI.

## UC10 — Dynamic fragments / partial page updates

Existing apps initialize controls repeatedly inside newly-rendered scopes.

### Recette

```js
// scope discovery inside a freshly-rendered container
Combobox.init(fragment.querySelector(".cards"), "select.app-control", options);

// a bare list of source elements works too
Combobox.init(Array.from(fragment.querySelectorAll("select.app-control")), options);
```

Discovery is always explicit: `init(selector)` on the document, `init(root,
selector)` scoping the selector to a container, or `init([element, …])` over a
collection. A **bare element root without a selector is not a scope** — it
discovers nothing, and an `init()` over an already-instantiated control is an
idempotent no-op that never reconfigures the existing instance.

Requirements:

- idempotent `getOrCreateInstance`;
- `dispose()` cleans all listeners/generated DOM and restores native controls;
- `sync()` handles application-driven option changes;
- opt-in `observeSource` MutationObserver batches changes to one `sync()` and preserves focus/query while they land.

### Fallback

`init`/`getOrCreateInstance` attach the engine as usual; per-browser `mode`
degrades to native controls (forced with `?native=1` in tests).

### Tests

`test/browser/init.spec.js` (discovery shapes/overloads) and
`test/browser/combobox-element.spec.js` (dynamic insertion, rebuild,
dispose/restore, forced fallback).

## UC11 — Native validation and reset

Requirements:

- `required` select remains invalid until a real option is selected;
- input `pattern`, required and other browser constraints remain meaningful;
- invalid event directs focus to enhanced interaction control without disabling native validity;
- form reset restores initial selected/value state and rendered UI;
- disabled/readonly state can change after initialization and `refresh()/sync()` reflects it.

## UC12 — Rich rendering without XSS regression

Requirements:

- option labels, values and optgroup labels are text by default;
- no raw `innerHTML` from server data;
- renderer can return a DOM Node for avatars/metadata;
- tests inject hostile strings into source, remote items, groups, create labels and renderers.

## UC13 — Fallback

Force fallback in tests even on modern browsers.

Requirements:

- native input/datalist/select/multiple remain visible and named correctly;
- no custom positioned picker exists;
- create fallback input is unnamed;
- creating through fallback mutates the select and emits native value events;
- advanced features may legitimately be unavailable rather than half-emulated.

## UC14 — Scoped search / query builder

The application owns scope and filter tokens; the combobox owns only
`query → suggestions → keyboard navigation → chosen action`.

### Recette

```js
const box = document.querySelector("combo-box.scoped");

box.addEventListener("combobox:beforeselect", (event) => {
  event.preventDefault();              // field suggestions are actions, not values
  applyScopeToken(event.detail.item);  // application renders its own token UI
  box.clearQuery();
});
```

- an `input+datalist` source keeps the remaining query free-form and native
  (the input stays the form-value owner);
- field suggestions are actions handled by cancelling `combobox:beforeselect`;
- `clearQuery()` / `setQuery()` replace the visible/interaction text; a
  cancelled `beforeselect` never materializes a transient native option;
- application tokens are distinct from selected-value `.cb-chip` elements and
  live inside the authored `anchor` shell, which the engine treats as one
  placement/interaction region and never mutates.

### Fallback

The token/scope recipe exists only in enhanced mode. In fallback mode an
`input+datalist` stays a plain native datalist (`?native=1` reproduces it).

### Tests

`demo/query-builder.html` is the working reference. The underlying pieces are
covered by `beforefilter.spec.js` and `remote.spec.js` (cancelled
`beforeselect`, `setQuery`/`clearQuery` sync, consumer anchor).
