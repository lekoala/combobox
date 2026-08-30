# Architecture

## 1. Why one component

Open UI currently discusses free-form comboboxes and filterable selects as different platform primitives because their value semantics differ. A JavaScript enhancer can share almost all interaction machinery while preserving that semantic distinction internally.

```text
                           Combobox
                              │
                 ┌────────────┴────────────┐
                 │                         │
           input value model         select value model
                 │                         │
        input owns arbitrary text    option(s) own values
                 │                         │
                 └────────────┬────────────┘
                              │
                search / active option / picker
                load / render / keyboard / events
```

The public component is therefore `Combobox`; the source element determines the value model.

## 2. Four separate pieces of state

Treat these as distinct even when local/simple cases make them look identical.

### Native source catalogue

For a select this is the declared `<option>` / `<optgroup>` catalogue. For an input combobox it is the `<datalist>`.

It represents durable source data, including labels, disabled state, optgroups and initial selections.

### Result store

The current list of candidates shown by the picker. For local searches it can be derived from the native catalogue. For remote searches it is transient.

Do **not** use the native select as a cache for every remote page/query. A result is materialized as a native `<option>` when it is selected.

### Selection

For select-backed controls the native selected option(s) are authoritative. For input-backed controls the original input value is authoritative.

### Selection order

A native multiple select has selected values but does not naturally model “chosen in this order”. Keep that separately only when `selectionOrder: "selected"` is requested.

This avoids the common Select2 workaround of detaching and appending `<option>` elements merely to encode display order.

## 3. DOM shape

### Input combobox

Raw HTML:

```html
<input id="city" name="city" list="cities" data-combobox>
<datalist id="cities">
  <option value="Brussels">
</datalist>
```

Enhanced:

- the original input remains visible and named;
- `list` is temporarily removed;
- the datalist is temporarily detached so the browser picker cannot flash;
- the original input becomes the combobox focus/input element;
- `dispose()` restores list/autocomplete/datalist placement.

### Select combobox

Raw HTML:

```html
<label for="doctor">Doctor</label>
<input filter="doctor" hidden>
<select id="doctor" name="doctor" data-combobox>...</select>
```

Enhanced:

- select remains in the DOM as native value/validation source but is visually hidden;
- explicit sibling filter input is reused when supplied, otherwise generated;
- filter input has no `name`;
- a visual control wrapper is generated;
- listbox popover is appended to document top layer;
- selected values update the native select.

For multiple select, chips are projections of selected native options.

### Custom element wrapper

`<combo-box>` is a lifecycle boundary, not a shadow tree.

- It is an autonomous custom element that simply contains the native source.
- The source — first direct child `<select>`, else first direct child `<input list>` — stays the only value/validation owner.
- The element is **not** form-associated and adds no hidden serialized state; no Shadow DOM, so labels, forms and reset keep working through the normal tree.
- Registration is explicit (`defineCombobox()`); loading the scripts never touches the global `customElements` registry.
- It runs the exact same `Combobox` engine via `getOrCreateInstance` — it is not a second implementation.

```html
<combo-box create placeholder="Search or create…">
  <select name="frameworks[]" multiple>…</select>
</combo-box>
```

The transformation is identical to the imperative path above; the wrapper only owns the upgrade/dispose lifecycle. Options come from wrapper attributes (mapped) plus JS via `configure()`, and any `data-*` on the native source keeps working — so the `data-combobox` contract and the wrapper coexist while migration is progressive. Child lookup is direct-children only; a source nested in another element is not found.

Fallback: without JS or on unsupported browsers the browser sees an unknown element wrapping a fully functional native control.

## 4. Popover and positioning

Use a manual popover:

```html
<div popover="manual" class="cb-popover">...</div>
```

Why manual instead of auto:

- combobox opening is driven by focus/input rather than a simple invoker click;
- automatic light-dismiss can race with the pointer event that caused focus/open;
- deterministic outside-click + Escape handling is small;
- top-layer behavior remains native.

CSS Anchor Positioning owns geometry:

- anchor = whole visual control (important for multi/chips);
- focus/ARIA owner = search input;
- picker width derives from anchor width;
- block-axis fallback can flip above;
- no JS geometry calculations.

## 5. Filtering model

Normal pipeline:

```text
query
  ↓
beforefilter (cancellable, event.query)
  ↓
shouldLoad?
  ↓
optional debounced load + AbortSignal
  ↓
local match/filter/score/sort
  ↓
filter
  ↓
render
```

If `beforefilter` is cancelled, the application owns filtering. It can asynchronously obtain data, call `setResults()`, then call `applyFilter()` without recursively firing `beforefilter`.

Mirror Open UI-like future states today with data attributes (`data-filtered`, `data-active-option`). When interoperable native primitives ship, the adapter boundary can delegate more work to the platform without changing the public model.

## 6. Remote loading

The core should know **how to schedule/cancel a load**, not how an application's API is shaped.

```js
load: async (query, { signal, cursor, source, input, combobox }) => {
  const country = document.querySelector("#country").value;
  const response = await fetch(`/patients?q=${encodeURIComponent(query)}&country=${country}`, { signal });
  return response.json();
}
```

Accepted result contracts:

```js
[ item, item, item ]
```

or future-ready:

```js
{
  items: [ ... ],
  cursor: "next-page-token"
}
```

`loadMore()` is an API seam; the core does not implement virtual scrolling or automatically decide when to fetch another page.

## 7. Events and native integration

Two layers intentionally coexist:

### Native value events

When the form value really changes:

```text
input
change
```

on the original source element.

### Combobox lifecycle events

Namespaced events describe component operations. `before*` events are cancellable.

Do not fire native value events when a user chooses the already-current value.

### Async confirmation caveat

DOM event cancellation is synchronous. `guards` is the explicit async guard API:

```js
guards: {
  add: async (label, context) => boolean,      // creation of new items
  remove: async (item, context) => boolean,
  clear: async (context) => boolean,
}
```

Contract:

- `false` is a voluntary refusal and mutates nothing.
- A rejected promise is an application error: `combobox:guarderror` (`detail { guard, error }`) fires, the operation blocks, and cancellation by a user dialog must resolve `false` rather than reject.
- Guards run before the (still synchronous, cancellable) `before*` events, and on user and programmatic paths alike.
- `remove()`/`clear()` are async (`Promise<boolean>`) because of guard evaluation; `select` and creation follow the same guarded path for creation.

## 8. Selection order

Three independent orders:

```text
catalogue order    source DOM / API order
result order       filtering, relevance, explicit sort
selection order    order in which selected items are presented/submitted
```

Default should remain source/native-like. `selectionOrder: "selected"` enables an explicit ordered selection array.

`move(value, index)` is the model primitive. Built-in drag/drop is intentionally out of scope.

For form submission in ordered mode, use the `formdata` event to replace repeated field values in explicit selection order instead of moving source options.

## 9. Keyboard model

Picker:

- focus remains in search input;
- Arrow Down/Up changes active option;
- Enter selects active option or creates when eligible;
- Escape closes;
- disabled results are skipped.

Multiple chips:

- Arrow Left from an empty search can focus the last chip;
- Arrow Left/Right navigates focused chips;
- Home/End first/last;
- Delete/Backspace removes focused chip;
- Arrow Right from last returns to search;
- Escape returns to search.

No virtual caret positions between chips.

Accessible keyboard reordering still needs a final shortcut/design decision before ordered mode is considered production-complete.

## 10. Fallback policy

Fallback is not a second combobox engine.

Allowed fallback work:

- leave native controls alone;
- optionally add tiny behavior that does not need custom picker geometry (currently create input for creatable native select).

Not allowed:

- fixed-position menu engine;
- scroll/resize re-positioning;
- modal parent hacks;
- partial recreation of advanced enhanced behavior.

## 11. Target implementation split

Do not split merely for file count. Once tests are in place, likely boundaries are:

```text
helpers.js            pure helpers: normalize/toItem, separators/tokenizer
combobox.js           orchestration/public API
source/input.js       input+datalist adapter
source/select.js      select adapter/native selection
results.js            transient result store + matching
picker.js             listbox/popover/active option
selection.js          chips/order/formdata
events.js             event helpers/operation guards
```

The current POC intentionally keeps these as visible sections in one file until the contracts stabilize; `helpers.js` is already extracted so the pure functions can be unit-tested without a DOM shim.
