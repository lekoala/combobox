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

External mutants are reconciled at an explicit `sync()` — the fastest, most predictable contract. The opt-in `observeSource` option (default `false`) adds an automatic, debounced MutationObserver that calls `sync()` once per batch: the select's `<option>`/`<optgroup>` structure plus `selected`/`disabled`/`required`/`readonly` attributes, and the detached `<datalist>`'s `<option>` set for inputs. Engine-driven mutations are suppressed by dropping the observer around the engine's own writes (the engine re-reads the source on its own refresh). `sync()` remains the explicit escape hatch for arbitrary mutations — in particular, programmatic `option.selected = …` is a live-property change MutationObserver cannot see, and `multiple` is fixed at init time.

### Result store

The current list of candidates shown by the picker. For local searches it can be derived from the native catalogue. For remote searches it is transient.

Do **not** use the native select as a cache for every remote page/query. A result is materialized as a native `<option>` when it is selected.

### Selection

For select-backed controls the native selected option(s) are authoritative. For input-backed controls the original input value is authoritative.

**Option identity is the `HTMLOptionElement`**, never the `value` string. A duplicate
`value` on distinct options means distinct identities: they can all be selected at once
and serialize as repeated FormData entries. The internal selection model
(`selectionOrder`) stores option references, so a `Set`/`Map` keyed on the element
distinguishes the three `value="2"` options where a value-keyed model collapsed them.
Chips carry the exact option behind them (a `WeakMap`), and the `data-value` attribute
is inspection-only. The `value` string is used purely to *resolve* a bare-value API call
to the first matching selectable option.

### Selection order

A native multiple select has selected values but does not naturally model “chosen in this order”. Keep that separately only when `selectionOrder: "selected"` is requested.

This avoids the common Select2 workaround of detaching and appending `<option>` elements merely to encode display order.

## 3. DOM shape

### Input combobox

Raw HTML:

```html
<input id="city" name="city" list="cities">
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
<select id="doctor" name="doctor">...</select>
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
- Registration is explicit and centralized: engine modules never touch `customElements` on load — `src/define.js` (`defineCombobox()`), an app-level `defineCombobox("my-tag")`, or the generated classic build are the only ways it happens.
- It runs the exact same `Combobox` engine via `getOrCreateInstance` — it is not a second implementation.

```html
<combo-box create placeholder="Search or create…">
  <select name="frameworks[]" multiple>…</select>
</combo-box>
```

The transformation is identical to the imperative path above; the wrapper only owns the upgrade/dispose lifecycle. Configuration comes from exactly two surfaces: `<combo-box>` attributes (serializable behavior) and JS (`configure()`/constructor options) — there is **no** third `data-*`-driven surface on the source. Child lookup is direct-children only; a source nested in another element is not found.

## Declarative configuration policy

The declarative contract follows Data Grid's split between structure and configuration:

| Type of config | HTML | JS |
|---|---|---|
| native form semantics (name, multiple, required, disabled, optgroup, selected) | ✅ native attributes | rarely |
| boolean | ✅ `<combo-box foo>` (honors `="false"`) | ✅ |
| number | ✅ `max-items="5"` | ✅ |
| enum | ✅ `search="fuzzy"` | ✅ |
| short string | ✅ | ✅ |
| short list | ✅ `search-fields="label,email"` | ✅ array |
| item metadata | ✅ `<option data-email="…">` → `item.data.email` | ✅ |
| callback | ❌ | ✅ |
| async loader | ❌ | ✅ |
| renderer | ❌ | ✅ |
| guards | ❌ | ✅ |
| score/sort/filter functions | ❌ | ✅ |
| structured objects | generally ❌ | ✅ |

`data-*` on source items is **application metadata** (`item.data`, e.g. feeding the `search-fields` attribute), never combobox configuration. An explicit filter input is declared structurally with a liaison attribute on the input itself: `<input filter="select-id" hidden>`. There is no legacy `data-*` compatibility layer.

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

A failed non-abort load renders the same empty-row family as loading with a `cb-error` modifier (`loadError` text, `render.error` seam), emits `combobox:loaderror`, and leaves the native selection untouched. The error row *replaces* the list exactly like loading and is cleared by the next load or a local query — deliberately no retry affordance, so pagination/retry UX stays application-owned.

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
- Arrow Down/Up changes active option and opens the picker when closed; disabled results are skipped, navigation wraps within the rendered window;
- Home/End stay on the native caret inside the editable filter input (ARIA APG editable-combobox guidance); PageDown/PageUp move by a page (listbox viewport height ÷ row height) and clamp at the selectable edges;
- Enter selects active option or creates when eligible;
- Escape closes and clears `aria-activedescendant`;
- Tab: native focus traversal by default (an open picker closes first so an open top layer never traps the Tab in engines like Firefox, without ever `preventDefault()`ing); the opt-in `tabSelect` option makes Tab commit the active option or an eligible create like Enter, but only ever blocks default focus traversal when such a commit is actually possible. Picker never blocks Tab during IME composition.
- Arrow and page keys are physical in RTL layouts (DOM-index semantics); direction-aware layout is handled by logical CSS alone.

Multiple chips:

- Arrow Left from an empty search can focus the last chip;
- Arrow Left/Right navigates focused chips;
- Home/End first/last;
- Delete/Backspace removes focused chip;
- Arrow Right from last returns to search;
- Escape returns to search;
- Alt+Arrow Left/Right reorders a focused chip one position; Alt+Home/End jumps to first/last; the moved chip keeps focus and the live status region announces the new position.

No virtual caret positions between chips. Reordering chip keyboard support landed together with ordered mode (`Alt+Arrow/Home/End`, live position announcement).

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
