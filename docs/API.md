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

`init()` should ultimately accept either a selector and optional scope or a root directly; dynamic-page use cases must remain easy and idempotent.

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
| `selection-order` | `selectionOrder` |
| `separators` | `separators` (per character) |
| `load-on-empty` | `loadOnEmpty: true` |
| `allow-empty-option` | `allowEmptyOption: true` |
| `debounce` | `debounce` |

A matching `data-*` attribute on the native source is supported too, because the source may be reused imperatively. Wrapper options (`_options`) take precedence over both.

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
  maxItems: 0,

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

Refresh from externally-mutated native DOM. **TODO:** decide whether an optional MutationObserver should call this automatically.

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

## Value operations

```js
combo.select({ value: data.id, label: data.name });
combo.select("existing-value");
combo.remove("value");
combo.clear();
combo.addOption(item, { selected: false });
combo.getSelectedValues();
combo.getSelectedItems();
```

`select({value,label})` is the important external-create seam: if a select-backed option does not exist, the component materializes it, selects it, refreshes UI and emits native value events.

## Ordering

```js
new Combobox(select, {
  selectionOrder: "selected",
});

combo.move("value", 0);
```

No built-in drag/drop. Applications may wire any UI to `move()`.

**TODO before ordered mode is production complete:** finalize a discoverable keyboard reorder gesture and screen-reader announcement strategy.

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

- async confirmation/guards for remove/clear/select vs synchronous cancellable events;
- exact `init(root, selector?)` signature for dynamic fragments;
- tokenizer contract for separators, quoted values and paste;
- max visible results (`maxOptions`) vs max selected values (`maxItems`);
- whether `tabSelect` belongs in core and what default is safest;
- keyboard reorder gesture/announcements;
- optional automatic MutationObserver sync;
- final ESM export shape (classic global files today; packaging deferred, see PROJECT_SETUP.md).
