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
- removal never changes picker visibility (closed stays closed, open stays
  open) and never counts as a search intent: no `beforefilter`/`filter`, no
  remote `load` — focus moves only because the removed chip disappears;
- search remains focused while options/results refresh;
- Arrow Left/Right keyboard access to chips;
- max selections can prevent further additions without making existing chips impossible to remove;
- duplicate labels and duplicate values remain distinguishable by native option identity.
- Two models: default *pick from what remains* (selected rows hidden, re-selecting
  is a no-op) or opt-in *edit the current selection* via `toggleSelected: true`
  (or `<combo-box toggle-selected>`): selected rows stay visible and Enter/click
  deselects them through the guarded `remove()` path. Checking keeps the filter
  text and reflects state with `refresh()`; the manipulated row keeps active by
  exact `<option>` identity.

## UC4 — Creatable tags

GitHub-topics recipe (demo 20):

```html
<combo-box create toggle-selected autoselect-first placeholder="Add a topic…">
  <select name="topics[]" multiple>
    <option value="php" selected>php</option>
    <option value="docker">docker</option>
  </select>
</combo-box>
```

```js
box.configure({
  messages: { create: () => "Press Enter to add as new topic" },
});
```

`toggle-selected` keeps checked rows visible so Enter/click deselects;
`autoselect-first` highlights the first match like GitHub; the create row only
appears when nothing matches (default behavior, text via `messages.create` or
`render.create`). No checkbox restyle is needed: `aria-selected="true"` already
marks checked rows.

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

## UC15 — Service option picker

A constrained single select where some options are unavailable, each option
carries business metadata, and unavailable options explain themselves.

### Recette

```html
<combo-box placeholder="Choose an option…">
  <select id="service-option" name="service-option" required>
    <option value="">Choose an option…</option>
    <option
      value="priority-15"
      disabled
      data-duration="15 min"
      data-reason="Login required · Members"
      title="Reserved for members. Log in to your account to book this option."
    >Priority session</option>
    <option value="standard-45" data-duration="45 min">Standard session</option>
  </select>
</combo-box>
```

```js
box.configure({
  render: {
    option(item) {
      const root = document.createElement("span");
      root.className = "service-option";
      if (item.disabled && item.title) {
        root.dataset.tooltip = item.title; // application-owned enhancement
      }
      const label = document.createElement("span");
      label.textContent = item.label;
      root.append(label);
      if (item.data?.duration) {
        const duration = document.createElement("span");
        duration.textContent = item.data.duration;
        root.append(duration);
      }
      if (item.data?.reason) {
        const reason = document.createElement("span");
        reason.textContent = item.data.reason;
        root.append(reason);
      }
      return root;
    },
  },
});
```

Separation of concerns, from generic to specific:

```text
<option disabled>  → availability (native, keyboard skips it, selection refused)
data-duration      → business metadata (item.data, never combobox config)
data-reason        → short inline explanation, readable without hover
title              → native metadata/fallback, round-tripped onto rows, chips
                     and materialized options
render.option()    → rich presentation (DOM Nodes, never HTML strings)
data-tooltip       → optional application-owned polish (here Actual CSS)
```

Requirements:

- disabled options render `aria-disabled`, refuse selection and are skipped by
  keyboard navigation;
- the short reason stays inline: a hover-only tooltip would be invisible to
  keyboard users on rows they cannot focus;
- the renderer returns text-built Nodes only — hostile strings stay text;
- the styled tooltip is never the only channel: without its script the native
  `title` still applies (progressive enhancement, not a dependency);
- the combobox learns no business notion (`duration`, `reason`, login rules).

### Fallback

In fallback mode the recipe degrades to a plain native select: `disabled`,
`data-*` and `title` are native semantics and keep working with zero JavaScript.

### Tests

`demo/service-options.html` is the working reference, covered by a `test/dist`
smoke test asserting the rendered contract (duration pills, `aria-disabled` +
`title` rows, `data-tooltip` markup, keyboard skip, native value on select) —
never Actual CSS runtime behavior, which belongs to its own project.

## UC16 — Directory picker (remote rich results + selection/action)

A constrained single select over a remote directory. Most rows select a
member; some rows are profile actions that branch elsewhere. Both modalities
(keyboard `Enter` and click) flow through the same seam.

### Recette

```js
box.configure({
  shouldLoad: (query) => query.trim().length >= 1,
  load: async (query, { signal }) => directory.search(query, { signal }),
  render: {
    option(item) {
      const row = document.createElement("span");
      const avatar = document.createElement("span");
      avatar.textContent = initials(item.label);
      const name = document.createElement("strong");
      name.textContent = item.label;
      const meta = document.createElement("span");
      meta.textContent = `${item.data.role} · ${item.data.team}`;
      row.append(avatar, name, meta);
      return row;
    },
  },
});

// One activation intent for every modality.
source.addEventListener("combobox:beforeselect", (event) => {
  const item = event.detail.item;
  if (item.data?.action !== "navigate") return;
  event.preventDefault();
  navigate(item.data.url);
  // Real app: window.location.assign(item.data.url);
});
```

Neutral item shape — `value`/`label` is the combobox contract, the rest is
opaque application metadata:

```js
{
  value: "42",
  label: "Denis Léonard",
  data: { role: "Designer", team: "Platform", action: "navigate", url: "/people/denis-leonard" },
}
```

Requirements:

- activating a result (keyboard or mouse) fires synchronous, cancellable
  `combobox:beforeselect` with `event.detail.item`;
- a cancelled activation materializes nothing: no native `<option>`, no
  `input`/`change` events, catalogue untouched;
- a normal selection materializes exactly that one transient result;
- the renderer returns text-built DOM Nodes only (avatar = CSS initials, so
  the demo has no network dependency and works over `file://`);
- below the search threshold no search ever runs, so the empty row must not
  claim "No results": a `render.noResults(query)` branch names the wait
  (`Type to search the directory…`) and only reports a genuine miss above
  it — returned strings render as text, so interpolating the query stays
  safe;
- the combobox learns no domain notion (`role`, `team`, profile URLs).

ARIA boundary: focus stays on the input (`role=combobox` +
`aria-activedescendant`, picker is `listbox`). That fits a selector where
some activations branch elsewhere. If almost every result were a navigation
link, prefer a search-results / command-palette primitive instead of a
combobox.

### Fallback

Remote loading is enhanced-mode only. In fallback mode the recipe degrades
to a plain native select with its placeholder option.

### Tests

`demo/directory-picker.html` is the working reference, covered by a
`test/dist` smoke test: rich rows render, `Enter` and click on a `navigate`
row cancel with zero native side effects, selecting a normal row
materializes one option and emits native value events.

## UC17 — Place picker (provider-neutral remote datasource)

The browser never talks to a maps SDK. The combobox queries an application
datasource and renders provider-neutral items; swapping Google / Mapbox /
Nominatim / internal API changes the provider, never the renderer.

### Recette

```js
const placeProvider = {
  async search(query, { signal }) {
    const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal });
    return response.json(); // neutral { value, label, data } items
  },
};

box.configure({
  shouldLoad: (query) => query.trim().length >= 2,
  load: (query, context) => placeProvider.search(query, context),
  render: {
    option(item) {
      const row = document.createElement("span");
      const label = document.createElement("strong");
      label.textContent = item.label;
      const secondary = document.createElement("span");
      secondary.textContent = item.data?.secondary ?? "";
      row.append(label, secondary);
      return row;
    },
  },
});
```

```js
{ value: "place-1", label: "Saint-Gilles", data: { secondary: "Belgium", kind: "locality", providerId: "…" } }
```

Requirements:

- the contract under test is the datasource (`query + AbortSignal →
  items`), not any maps API — the demo uses an async fake provider with an
  abortable delay;
- transient remote results never fill the native select; only the selected
  result is materialized;
- `minChars`/`shouldLoad` gate short queries; abort/stale rules follow UC5;
- below the threshold the empty row names the wait (`Type at least 2
  characters to search…`, via `render.noResults`) instead of reporting a
  miss; only a searched query with zero hits reports one;
- the renderer only knows `label` + opaque `data`.

### Fallback

Same as UC16: a plain native select with its placeholder option.

### Tests

`demo/place-picker.html` is the working reference, covered by a `test/dist`
smoke test: below-threshold query loads nothing, results stay transient
until selection, one selection materializes one native option with its
secondary text.
