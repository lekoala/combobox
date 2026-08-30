# Proposed API

This documents the intended v1 shape. The POC implements many of these seams already; items marked **TODO** are contract placeholders, not promises that behavior is complete.

## Initialization

```js
Combobox.init("[data-combobox]", options);

const combo = new Combobox(element, options);
Combobox.getInstance(element);
Combobox.getOrCreateInstance(element, options);
Combobox.supported;
```

`init()` is a discovery/creation API, not a reconfiguration API. It accepts:
- a CSS selector, globally or scoped to a root;
- a root `Element`/`Document`;
- a list of source elements (`NodeList` or array).

```js
Combobox.init("select");
Combobox.init("select", options);
Combobox.init(root);                 // root.querySelectorAll("[data-combobox]")
Combobox.init(root, options);
Combobox.init(root, "select");
Combobox.init(root, "select", options);
Combobox.init([select1, input2], options);
Combobox.init(nodeList, options);
```

An element that already has an instance is returned as-is and **never** reconfigured — `init(root, { maxItems: 3 })` followed by `init(root, { maxItems: 10 })` upgrades nothing twice and silently reconfigures nothing. Unsupported elements inside a collection are ignored without invalidating the call. `init()` returns the array of `Combobox` instances.

## Element and registration

The engine is wrapped by an autonomous custom element `<combo-box>` (no Shadow DOM, not form-associated). The child `<input>`/`<select>` remains the form-value owner.

Importing the library never registers anything. Register explicitly:

```js
defineCombobox();                 // "combo-box"
defineCombobox("app-combobox");   // same engine under an application namespace
```

`defineCombobox(name = "combo-box", registry = globalThis.customElements)`:

- returns the registered constructor;
- is idempotent for an already registered name owned by this library — the same class comes back;
- throws `NotSupportedError` if the name is already owned by a different element.

### Instance surface

- `box.upgrade()` enhances the first direct child `<select>`, else the first direct child `<input list="…">`. Safe to call repeatedly; returns the `Combobox` instance or `null` until a source child exists.
- `box.combobox` is the underlying `Combobox` instance (or `null`).
- `box.whenReady()` returns a promise resolving to the `Combobox` instance once upgraded.
- `box.configure(options)` merges JavaScript-only options (remote `load`, `create`, renderers); JS options always win over attributes.
- `box.dispose()` tears the engine down and restores the native source.

Child lookup is **direct children only**: a source nested inside another element is not found.

### Lifecycle

- element connected → `upgrade()` runs on the next microtask;
- element removed → teardown is deferred until a microtask confirms the element is truly gone, so a simple DOM move does not destroy state;
- attribute changes on observed attributes rebuild the instance.

### Observed attributes

| Attribute | Option |
|---|---|
| `create` | `create: true` |
| `placeholder` | `placeholder` |
| `search` | `match` |
| `min-chars` | `minChars` |
| `max-items` | `maxItems` |
| `max-options` | `maxOptions` |
| `selection-order` | `selectionOrder` |
| `separators` | `separators` (pipe-delimited: `",|;"` ⇒ `[",", ";"]`) |
| `create-on-blur` | `createOnBlur: true` |
| `close-on-select` | `closeOnSelect: true` |
| `autoselect-first` | `autoselectFirst: true` |
| `label-field` | `labelField` |
| `value-field` | `valueField` |
| `load-on-empty` | `loadOnEmpty: true` |
| `allow-empty-option` | `allowEmptyOption: true` |
| `debounce` | `debounce` |

Boolean attributes accept `="false"` to turn off. A fixed **legacy subset** of `data-*`
attributes on the native source is supported for migration only and so sources can be
reused imperatively without a wrapper: `data-create`, `data-placeholder`, `data-match`,
`data-max`, `data-separator`. There is no general `data-*` → option mapping. Canonical
configuration lives on `<combo-box>` attributes or in JS; wrapper options (`_options`)
take precedence over both.

### Event

`combobox:ready` fires (bubbles) on the element once the engine instance exists, with `detail.combobox` and `detail.source`.

## Core options

```js
{
  placeholder: "Search…",
  messages: {
    noResults: "No results",
    loading: "Loading…",
    loadError: "Failed to load results",
    create: (query) => `Create “${query}”`,
  },
  minChars: 0,
  match: "includes",       // includes | startswith | pattern | function
  searchFields: ["label"],
  filter: null,
  score: null,
  sort: null,

  create: false,            // true | async function
  createFilter: null,
  createOnBlur: false,
  maxItems: 0,              // selected-value cap; never mutilates init state
  maxOptions: 0,            // rendering cap only; 0 = unlimited
  separators: [],           // full separator strings (multiple select)
  tokenize: null,           // custom tokenizer seam
  closeOnSelect: undefined, // default: single true, multiple false
  autoselectFirst: false,
  tabSelect: false,          // true: Tab commits the active option / eligible create like Enter
  labelField: undefined,
  valueField: undefined,
  guards: {},               // async { add, remove, clear }

  load: null,
  shouldLoad: null,
  debounce: 200,
  loadOnEmpty: false,

  selectionOrder: "source", // source | selected
  observeSource: false,     // opt-in MutationObserver -> debounced sync()

  render: {
    option: null,
    item: null,
    group: null,
    loading: null,
    error: null,
    noResults: null,
    create: null,
  },
}
```

`messages` centralizes every string the component generates, so i18n is a single object:

```js
new Combobox(select, {
  messages: {
    noResults: "Aucun résultat",
    loading: "Chargement…",
    loadError: "Impossible de charger les résultats",
    create: (query) => `Créer « ${query} »`,
  },
})
```

`placeholder` deliberately stays top-level: it maps to the `<combo-box placeholder="…">` attribute and is structural input state, not generated text. `render` stays separate from `messages` — messages are the accessible/bypassable text fallback, renderers return DOM.

### Deliberately not config options

No `fixed`, `dropdownParent`, `width`, `server`, `queryParam`, `serverDataKey`, `allowHtml`, Bootstrap modal options, or plugin registry.

## Item shape

Canonical normalized item:

```js
{
  value: "205",
  label: "Eva Dupont",
  disabled: false,
  selected: false,
  group: "Specialists",
  data: { ... },
  option: HTMLOptionElement | null,
}
```

Remote/transient results usually have no `option` until selected.

## Filtering

### `search(query, options)`

Runs the full `beforefilter → optional load → filter → render` pipeline.

### `applyFilter(query, { show })`

Runs local filtering without firing `beforefilter` or initiating load. Intended after an application cancels `beforefilter` and provides results itself.

### `setResults(items)`

Sets transient picker results. Does not rewrite the native select catalogue.

### `clearResults()`

Returns to source-backed results.

### `setOptions(items)`

Explicitly replaces the durable native source catalogue. This is intentionally distinct from `setResults()`.

### `sync()`

Refresh from externally-mutated native DOM. `sync()` also drops transient `setResults()` results back to the source catalogue, so it remains the explicit escape hatch for arbitrary mutations.

`observeSource: true` (default `false`) adds an opt-in, debounced MutationObserver that calls `sync()` once per batch. It watches:

- the select's `<option>`/`<optgroup>` structure and its `selected`/`disabled`/`required`/`readonly` attributes;
- the (detached) `<datalist>`'s `<option>` set for input-backed comboboxes.

Engine-driven mutations are not observed (the engine drops/reconnects the observer around its own writes and refreshes from source anyway), and the search input keeps focus and its query during an external sync. Two platform boundaries apply:

- `multiple` is deliberately **not** observed — the value model is fixed at init time; toggling it after init requires re-initialization;
- a programmatic `option.selected = true/false` is a live-property change, not an attribute/structural mutation, so MutationObserver cannot see it — call `sync()` for programmatic selection changes. `observeSource` covers structural changes and attribute-level source state only.

## Remote

```js
load: async (query, {
  signal,
  cursor,
  source,
  input,
  combobox,
}) => {
  return items;
  // or { items, cursor }
}
```

`shouldLoad(query, context)` is the cheap business guard. Example: do not hit an endpoint while a date-shaped query is incomplete.

`loadMore()` is a cursor seam, not an infinite-scroll implementation.

Remote/transient results never rewrite the native catalogue. Selecting a remote result materializes **that one** native option (`addOption`); unpublished results are dropped by `clearResults()`, a below-threshold local query, or `sync()`.

A failed `load` (non-abort rejection) shows the same `.cb-empty` family as loading with a `cb-error` modifier (text from `messages.loadError`, overridable via `render.error(query, { error, combobox })`), keeps the selection intact, and emits `combobox:loaderror`. The error row is cleared by the next `load()` that runs or by a local query that clears the result store. There is deliberately no built-in retry affordance — retry/pagination is application-owned. Returns are `[item…]` or `{ items, cursor }`; `cursor` is stored in `combobox.nextCursor` and fed back into `load(query, { cursor })` by `loadMore()`, which appends results and never bypasses `maxOptions`.

## Creation

### `createFilter(value, context)`

Returns false when typed text must not be offered/accepted as a new option.

Example copied from a real Select2 integration requirement:

```js
createFilter(value) {
  const term = value.trim();
  if (term.length <= 2) return false;
  if (term && !Number.isNaN(Number(term))) return false;
  return true;
}
```

### `create`

Boolean `true` means `{ value: text, label: text }`.

Async creation can resolve server identity:

```js
create: async (label, { signal }) => {
  const response = await fetch("/tags", { method: "POST", signal /* ... */ });
  const tag = await response.json();
  return { value: tag.id, label: tag.name };
}
```

## Async guards

`guards` gate *mutations*, returning a boolean (or a promise resolving to a boolean):

```js
guards: {
  add: async (label, ctx) => confirm(`Add ${label}?`),   // creation (new items)
  remove: async (item, ctx) => confirm(`Remove ${item.label}?`),
  clear: async (ctx) => confirm("Clear all?"),
}
```

`ctx = { combobox, source, input, signal }`.

Contract:

- `false` is a **voluntary refusal**: the operation is blocked and nothing mutates.
- A **rejection is an application error**: `combobox:guarderror` (detail `{ guard, error }`) fires and the operation is blocked. Do not reject for a user cancelling a dialog — that must resolve `false`.
- Guards run on both user and programmatic paths. `before` events still fire (synchronously, cancellable) only after a guard has passed.
- `guards.add` applies to brand-new items only: an existing match is selected without running it.
- `createOnBlur` means genuinely leaving the combobox. Blur caused by internal interaction (picker click, adornment, chip removal, clear) never creates, and IME composition also blocks it.

## Separators / tokenization

`separators` (multiple-select only) consumes completed tokens as they are typed or pasted:

```js
separators: [",", ";"],
separators: parseSeparators(",|;"),
```

```html
<combo-box create separators=",|;" create-on-blur>…</combo-box>
```

- Separators are **full strings**, matched longest-first (`",|;"` ⇒ `[",", ";"]`); the attribute form is pipe-delimited.
- Tokens are processed strictly sequentially — `existing → guard → create → select`, never `Promise.all` — and `maxItems` is re-evaluated between tokens (`maxOptions` is unrelated).
- A trailing incomplete token stays in the input.
- `tokenize(value, ctx)` replaces the default splitter when the application needs quoting or other rules.
- IME composition feeds search but never tokenizes or creates.

## Item field mapping

`labelField`/`valueField` map **data objects** to canonical items (`setResults`, `setOptions`, `select`, `create` results):

```js
combo.configure({ labelField: "name", valueField: "id", searchFields: ["id", "name", "sku"] });
```

Real `<option>` elements are already canonical `{ value, label }` and are never reinterpreted; an object that already carries `value`/`label` is likewise left untouched.

## Result rendering cap

`maxOptions` caps *displayed/navigable* options only. `results` may hold 500 items with `maxOptions: 20` — at most 20 render, and keyboard navigation stays inside that window. `0` means no cap. Remote `loadMore()` may enrich the result store but never bypasses the cap; a pagination affordance is a separate concept.

## Keyboard interaction

Focus stays in the search input; the picker is driven entirely through it (`role=combobox` + `aria-activedescendant`). Options are non-focusable rows.

### Picker

| Key | Behavior |
| --- | --- |
| `ArrowDown` / `ArrowUp` | open the picker when closed; move the active option, wrapping within the rendered window and skipping `disabled` rows |
| `Home` / `End` | jump to the first/last selectable option |
| `PageDown` / `PageUp` | move the active option by a page (listbox viewport height ÷ row height), clamped to the first/last selectable option |
| `Enter` | select the active option, or create an eligible entry when no option is active |
| `Escape` | close the picker and clear `aria-activedescendant` |
| `Tab` | native focus traversal by default; with `tabSelect: true` commits the active option / eligible create like Enter, and only `preventDefault()`s when a commit is actually possible |

Navigation keys always operate on the filtered, rendered window (`maxOptions`), open a closed picker, skip `disabled` rows, and never land on one. IME composition never tokenizes/selects. `autoselectFirst: true` preselects the first selectable option after every filter.

### Chips (multiple)

- `ArrowLeft` on an empty search focuses the last chip; `Backspace` on an empty search removes the last selected entry through the normal guarded/`beforeremove` path.
- On a focused chip: `ArrowLeft`/`ArrowRight` move between chips, `Home`/`End` jump to first/last, and moving past the last returns to the search input.
- `Delete` / `Backspace` on a focused chip removes it and refocuses the neighbor (or the input when the list empties); `Escape` returns to the search input.
- Arrow/handoff keys are physical: in RTL layouts they keep DOM-index semantics while the layout flows right-to-left via logical CSS (matching Select2/TomSelect and the legacy libraries).

## Value operations

```js
combo.select({ value: data.id, label: data.name });
combo.select("existing-value");
const removed = await combo.remove("value");  // boolean
const cleared = await combo.clear();          // boolean
combo.addOption(item, { selected: false });
combo.getSelectedValues();
combo.getSelectedItems();
```

`select({value,label})` is the important external-create seam: if a select-backed option does not exist, the component materializes it, selects it, refreshes UI and emits native value events.

`remove()` and `clear()` are async because they can await `guards`; they resolve `false` when refused (voluntary or guarded).

## Ordering

```js
new Combobox(select, {
  selectionOrder: "selected",
});

combo.move("value", 0);
```

No built-in drag/drop. Applications may wire any UI to `move()`.

In ordered mode, a focused chip supports a keyboard reorder gesture:

- `Alt+ArrowLeft` / `Alt+ArrowRight` — move the chip one position;
- `Alt+Home` / `Alt+End` — jump to first/last position;
- the moved chip keeps focus, and the live status region announces its new position (`"<label> position N of M"`);
- reordering emits `combobox:beforereorder` (cancellable) then `combobox:reorder`, and never mutates catalogue order.

## Picker/lifecycle

```js
combo.show();
combo.hide();
combo.isOpen();
combo.refresh();
combo.dispose();
```

`dispose()` must restore everything the enhancer changed, including datalist linkage and explicit sibling filter-input placement/visibility.

## Events

### Open/close

```text
combobox:beforeopen    cancellable
combobox:open
combobox:beforeclose   cancellable
combobox:close
```

### Filtering

On the filter/search input:

```text
beforefilter           cancellable, event.query
filter
```

The POC also exposes the query in `event.detail.query`.

### Loading

```text
combobox:beforeload    cancellable
combobox:load
combobox:loaderror
```

### Selection

```text
combobox:beforeselect  cancellable
combobox:select
combobox:beforeremove  cancellable
combobox:remove
combobox:beforeclear   cancellable
combobox:clear
```

### Creation

```text
combobox:beforecreate  cancellable
combobox:create
combobox:createerror
combobox:guarderror     detail { guard, error }
```

### Ordering

```text
combobox:beforereorder cancellable
combobox:reorder
```

### Native events

A real value mutation on the source should dispatch:

```text
input
change
```

in that order, once each. Re-selecting the already-current value must not produce a false value-change event in production.

## Rendering

Renderer callbacks should return text-compatible values or DOM `Node`s.

```js
render: {
  option(item, state) {
    const row = document.createElement("span");
    row.textContent = item.label;
    return row;
  },
}
```

State rows (`loading`, `error`, `noResults`, `create`) accept a string or a returned `Node`:

```js
render: {
  error(query, { error, combobox }) {
    const row = document.createElement("span");
    row.textContent = `Couldn't load results (${error.message})`;
    return row;
  },
}
```

Do not return trusted raw HTML strings as an implicit rendering mode. If an application needs rich HTML, it owns the DOM construction/sanitization.

## P0 API questions still to settle

Resolved:

- async guards for create/remove/clear: `guards: { add, remove, clear }` — `false` refuses, rejected promises surface via `combobox:guarderror`;
- tokenizer: separators splitter + optional `tokenize` seam, sequential token consumption, IME-safe;
- `maxOptions` (rendered) vs `maxItems` (selected): independent options;
- `closeOnSelect` defaults (single closes, multiple stays open) and `autoselectFirst` (default `false`, divergence from `bootstrap5-tags` documented);
- `labelField`/`valueField` data-object mapping;
- `init(root, selector?, options?)`: type-dispatched overloads, discovery/creation only, idempotent (returned instance is never reconfigured);
- `tabSelect`: JS option, default `false`; when enabled Tab commits like Enter and only `preventDefault()`s when a commit is possible; IME composition falls through to native Tab (divergence from `bootstrap5-autocomplete` documented);
- ordered-mode keyboard reorder: `Alt+ArrowLeft/Right` and `Alt+Home/End` on a focused chip, status-region position announcement, implementation in Phase 6;
- automatic DOM sync: opt-in `observeSource` (default `false`), debounced `sync()`, internal mutations suppressed (implemented in Phase 2; programmatic `.selected` changes and `multiple` toggles are intentionally out of the observer — see `sync()`);
- ESM export shape: see PROJECT_SETUP.md — implementation in Phase 8.
