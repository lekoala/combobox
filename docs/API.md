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

Boolean attributes accept `="false"` to turn off. The legacy `data-separator` attribute on the native source is supported for migration only; canonical separators live on `<combo-box separators="…">` or in JS. A matching `data-*` attribute on the native source is supported too, because the source may be reused imperatively. Wrapper options (`_options`) take precedence over both.

### Event

`combobox:ready` fires (bubbles) on the element once the engine instance exists, with `detail.combobox` and `detail.source`.

## Core options

```js
{
  placeholder: "Search…",
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

  render: {
    option: null,
    item: null,
    group: null,
    loading: null,
    noResults: null,
    create: null,
  },
}
```

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

Refresh from externally-mutated native DOM. The explicit `sync()` contract is the default. Opt-in automatic sync via `observeSource: true` (default `false`): a MutationObserver watches the source `<select>`/`<datalist>` for structural `<option>`/`<optgroup>` changes plus `selected`/`disabled` and source-level `required`/`disabled`/`readonly`/`multiple` attributes, debounces to a single `sync()` per batch, and skips refreshes caused by the component's own mutations. Even with `observeSource` on, `sync()` remains the explicit escape hatch for arbitrary mutations.

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
- automatic DOM sync: opt-in `observeSource` (default `false`), debounced `sync()`, internal mutations suppressed, implementation in Phase 2;
- ESM export shape: see PROJECT_SETUP.md — implementation in Phase 8.
