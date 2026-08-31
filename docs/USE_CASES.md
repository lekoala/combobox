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
<input filter="doctor" hidden>
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

Requirements:

- debounce;
- previous request abort;
- stale response cannot overwrite newer query;
- loading state does not briefly show no-results;
- errors do not destroy current selection;
- result store remains transient;
- only selected remote result is materialized into native select.

## UC6 — Business query guard

Real application requirement: endpoint accepts complete `DD/MM/YYYY`, but typing a partial date should not trigger remote calls.

```js
shouldLoad(query) {
  return !isPartialDate(query);
}
```

or:

```js
input.addEventListener("combobox:beforeload", (event) => {
  if (isPartialDate(event.detail.query)) event.preventDefault();
});
```

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

Requirements:

- create native option if missing;
- select it;
- update chip/single label;
- fire native value events;
- no jQuery `.append(new Option).trigger("change")` boilerplate.

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

Requirements:

- `false` refuses and mutates nothing;
- a rejected promise is an application error surfaced as `combobox:guarderror`, never silently treated as `false`;
- `before*` events stay synchronous and fire only after the guard passes;
- tokenized/pasted batches apply guards per token, in order.

## UC9 — Explicit selection order

Examples: ranked members, workflow priorities, ordered recipients.

Requirements:

- source catalogue order remains stable;
- result ranking is independent;
- chip/selection order is explicit;
- `move(value,index)` updates order model;
- ordered `FormData` can preserve that order;
- no built-in drag/drop requirement;
- keyboard reordering must be specified before release.

## UC10 — Dynamic fragments / partial page updates

Existing apps initialize controls repeatedly inside newly-rendered scopes.

Requirements:

- idempotent `getOrCreateInstance`;
- type-dispatched `init(root, selector?, options?)` — implemented (`init(selector)`, `init(root, selector)`, `init(root | [element, …])`);
- `dispose()` cleans all listeners/generated DOM and restores native controls;
- `sync()` handles application-driven option changes;
- opt-in `observeSource` MutationObserver batches changes to one `sync()` and preserves focus/query while they land.

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
