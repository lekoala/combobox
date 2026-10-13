# Migrating from Select2

This guide covers **Select2 4.x → `@lekoala/combobox` 0.6.x**. Combobox is **not** a jQuery adapter or a drop-in Select2 replacement. Retire Select2 on each migrated field before enhancing that same `<select>`.

The main change: a native `<select>` owns the submitted value and form semantics, while Combobox supplies search, results, and optional creation. Selected remote items are materialized as real native options; unselected remote results are temporary.

See the [API reference](API.md), [use cases](USE_CASES.md), and [general migration notes](MIGRATION.md).

## 1. Replace initialization

**Before — Select2:**

```html
<select id="country" name="country" class="js-country">
  <option value=""></option>
  <option value="be">Belgium</option>
  <option value="fr">France</option>
</select>
```

```js
$(".js-country").select2({
  placeholder: "Choose a country",
  allowClear: true,
});
```

**After — declarative Combobox:**

```html
<combo-box class="country" placeholder="Choose a country">
  <select id="country" name="country">
    <option value=""></option>
    <option value="be">Belgium</option>
    <option value="fr">France</option>
  </select>
</combo-box>
<button type="button" id="clear-country">Clear</button>
```

```js
import "@lekoala/combobox/combobox.css";
import { defineCombobox } from "@lekoala/combobox";

defineCombobox();

document.querySelector("#clear-country").addEventListener("click", async () => {
  const combo = document.querySelector("combo-box.country").combobox;
  if (combo) await combo.clear();
});
```

The wrapper upgrades its **direct-child** native source when connected. You can instead use `new Combobox(select, options)` or `Combobox.init("select.js-country", options)` (which returns an array of instances) without a wrapper; do not mix the two approaches on the same field. For classic/standalone scripts, see [installation](../README.md#four-ways-to-use-it).

Unlike Select2's `allowClear`, Combobox does **not** insert a clear button. The application owns the button, layout, and accessible label. `await combo.clear()` deselects the current option(s); on a single select that leaves `selectedIndex = -1`, not a return to the first real option. Keep an empty `<option value="">` as the **first option** so the cleared state is explicit: by default that empty option is a placeholder (never a chip, never a submitted value), and `allowEmptyOption` promotes it to a real selectable value.

## 2. Settings mapping

| Select2                               | Combobox                                         | Notes                                                 |
|---------------------------------------|--------------------------------------------------|-------------------------------------------------------|
| `$(select).select2(options)`          | `<combo-box>` or `new Combobox(select, options)` | No jQuery dependency                                  |
| `data-*` config on `<select>`         | Attributes on `<combo-box>`                      | No generic `data-*`-to-config mapping                 |
| `placeholder`                         | Empty first `<option>` + `placeholder`            | Select2's placeholder text lives on the empty option; `placeholder` sets the filter input |
| `allowClear`                          | `await combo.clear()`                            | Author the button yourself                            |
| `multiple`                            | Native `<select multiple>`                       | Native control defines selection mode                 |
| `tags: true`                          | `create: true` / `create`                        | Created tags become native `<option>`s                |
| `tokenSeparators`                     | `separators` / `separators=",|;"`                | Pipe-delimited attribute syntax                       |
| `maximumSelectionLength`              | `maxItems` / `max-items`                         | `0` = unlimited selected values                       |
| `maximumInputLength`                  | No direct equivalent                             | Validate input/creation in app code                   |
| `minimumInputLength`                  | `minChars` / `min-chars`                         | Also review local-search UX                           |
| `minimumResultsForSearch`             | No direct equivalent                             | Consider keeping a plain native select                |
| `ajax.url`, `ajax.data`               | `load(query, { signal })`                        | Construct endpoint and params in app code             |
| `ajax.delay`                          | `debounce`                                       | Milliseconds                                          |
| `ajax.processResults`                 | Transform data in `load`                         | Return items or `{ items, cursor }`                   |
| `ajax.transport`                      | Your `fetch` inside `load`                       | No transport/adapter abstraction                      |
| `templateResult`, `templateSelection` | `render.option`, `render.item`                   | Return DOM `Node`s or text, never HTML markup strings |
| `matcher`, `sorter`                   | `match`, `filter`, `sort`                        | Rewrite callbacks; signatures differ                  |
| `language`                            | Locale imports or `messages`                     | Import locale before new instances                    |
| `dropdownParent`, `width`             | No direct equivalent                             | Popover + floating placement; style with CSS          |
| `closeOnSelect`                       | `closeOnSelect` / `close-on-select`              | Default multiple-select behavior is to stay open      |
| `select2:*` events                    | `combobox:*` DOM events                          | Native `input`/`change` for value changes             |

Keep `name`, `required`, `disabled`, `<option selected>`, and `<optgroup>` on the native source. Select2's `data-tags`, `data-ajax--url`, and other `data-*` *configuration* attributes are **not read** by Combobox; remove them after migrating. `data-*` on **options** may still carry application item metadata.

## 3. AJAX search and response mapping

Select2 mixes transport, query parameters, response parsing, and pagination under `ajax`.

**Before:**

```js
$("#patient").select2({
  minimumInputLength: 2,
  ajax: {
    url: "/api/patients",
    delay: 250,
    data: (params) => ({ q: params.term, clinic: $("#clinic").val() }),
    processResults: (data) => ({
      results: data.items.map((p) => ({ id: p.id, text: p.name })),
    }),
  },
});
```

**After:**

```html
<combo-box class="patients" min-chars="2" debounce="250">
  <select id="patient" name="patient">
    <option value="">Select a patient</option>
  </select>
</combo-box>
```

```js
document.querySelector("combo-box.patients").configure({
  async load(query, { signal }) {
    const params = new URLSearchParams({
      q: query,
      clinic: document.querySelector("#clinic").value,
    });
    const response = await fetch("/api/patients?" + params, { signal });
    if (!response.ok) throw new Error("Search failed");
    const data = await response.json();
    return data.items.map((patient) => ({
      value: String(patient.id),
      label: patient.name,
    }));
  },
});
```

Combobox loaders return a Promise (not a Select2 `processResults` object). Combobox handles debounce, request abort, and stale responses. It **does not automatically send** Select2's `term`, `q`, `_type`, or `page`: maintain any required API parameters explicitly.

When a dependency changes, the app decides whether to preserve the selected value and can re-run the existing query:

```js
document.querySelector("#clinic").addEventListener("change", () => {
  const combo = document.querySelector("combo-box.patients").combobox;
  if (combo) combo.search(combo.query);
});
```

**Pagination is not automatic.** Select2's `pagination.more` and automatic infinite scroll do not carry over. Combobox can accept `{ items, cursor }` from `load` and the app can call `combo.loadMore()`. Translate page numbers into a cursor or maintain explicit pagination state if your endpoint is page-based.

Unselected results do **not** become native options. `setResults()` updates only temporary suggestions; `setOptions()` replaces the durable source catalogue (preserving selected options by default).

## 4. Preselected AJAX values and external updates

Select2's programmatic recipe often needs `new Option(text, id, true, true)`, `.trigger("change")`, and sometimes a synthetic `select2:select` event.

**After:**

```js
const combo = await document.querySelector("combo-box.patients").whenReady();
combo.select({ value: String(patient.id), label: patient.name });
```

This creates a real native option if necessary, selects it, and dispatches native `input` then `change`. Server-rendering a selected `<option selected>` is simpler still. Do not dispatch a synthetic Select2 event.

`combo.select("existing-id")` selects an existing option **only**; it does not create a missing one. `getSelectedValues()` always returns an array of strings, even for a single select. `await combo.clear()` and `await combo.remove(value)` are asynchronous, because mutation guards may be asynchronous.

If application code directly changes `select.value`, `option.selected`, or the option children, call `combo.sync()` afterward. `observeSource: true` can observe structure/attributes, **not** live JavaScript property assignments such as `option.selected = true`.

## 5. Multi-select and tag creation

**Before:**

```js
$("#topics").select2({
  tags: true,
  tokenSeparators: [",", ";"],
  maximumSelectionLength: 5,
});
```

**After:**

```html
<combo-box create separators=",|;" max-items="5" placeholder="Add topics">
  <select id="topics" name="topics[]" multiple>
    <option value="php" selected>PHP</option>
    <option value="js">JavaScript</option>
  </select>
</combo-box>
```

For server-backed tag creation, replace Select2's `createTag` / `insertTag` customization with `create(label, { signal })` and `createFilter(label)`, returning `{ value: "42", label: "New tag" }`. Chips and removal are built in. For a state-editor dropdown, `toggle-selected` makes already-selected rows visible and toggles their selection on activation.

`max-items="1"` on `<select multiple>` **does not change its mode**. The native `multiple` attribute, not the item limit, determines single/multi behavior.

## 6. Events, rendering, and teardown

Select2 publishes jQuery events. Combobox uses ordinary DOM `CustomEvent`s on the **native source**:

| Select2                                    | Combobox                                            |
|--------------------------------------------|-----------------------------------------------------|
| `select2:opening` / `select2:open`         | `combobox:beforeopen` / `combobox:open`             |
| `select2:closing` / `select2:close`        | `combobox:beforeclose` / `combobox:close`           |
| `select2:selecting` / `select2:select`     | `combobox:beforeselect` / `combobox:select`         |
| `select2:unselecting` / `select2:unselect` | `combobox:beforeremove` / `combobox:remove`         |
| `select2:clearing` / `select2:clear`       | `combobox:beforeclear` / `combobox:clear`           |
| `change` / `change.select2`                | Native `input` then `change` after engine mutations |

```js
const select = document.querySelector("#patient");
select.addEventListener("change", () => console.log(select.value));
select.addEventListener("combobox:beforeselect", (event) => {
  if (event.detail.item.value === "forbidden") event.preventDefault();
});
```

`beforefilter` and `filter` fire on the **interaction input** (`combo.input`), not the select. There is no Select2 event namespace or `e.params.data`; consult the [API events](API.md#events) for event details and use `combo.getSelectedItems()` when needed.

**Rich rendering:** `render.option` / `render.item` return text or DOM nodes. A returned string is displayed as **text**, never parsed as HTML. Use `textContent` and safe DOM APIs rather than string templates with HTML markup.

**Lifecycle:** `combo.dispose()` restores the native source. Removing the `<combo-box>` wrapper tears down the engine (after a deferred check, so synchronous DOM moves survive). `box.configure()` and observed wrapper attribute changes **rebuild** it on a microtask; reacquire `box.combobox`, and use `combobox:ready` to attach per-instance handlers again.

**No direct parity:** Select2 adapter/decorator extensions, built-in infinite scroll, `dropdownParent`, built-in clear affordances, checkbox result modes, and Bootstrap modal positioning hacks. Popover top-layer and `@lekoala/floating` cover the positioning problem differently, but application-specific interactions stay outside the core.

## Migration checklist

- [ ] Remove Select2 JS/CSS and jQuery initialization for migrated fields; never double-initialize.
- [ ] Preserve native `name`, `multiple`, `required`, selected/default options, groups, and disabled state.
- [ ] Remove Select2-specific `data-*` configuration; move options onto `<combo-box>` or the JS API.
- [ ] Keep an empty first option for nullable single selects, particularly when offering Clear.
- [ ] Adapt AJAX query parameters, result mapping, pagination, and preselected remote values.
- [ ] Replace `.val(...).trigger("change")` with Combobox methods or native DOM mutation plus `sync()`.
- [ ] Convert jQuery namespaced listeners into DOM events; account for async `clear()` / `remove()`.
- [ ] Test `FormData`, native validation/reset, keyboard behavior, accessibility, dynamic fragments, and fallback.

**Upstream references:** [Select2 configuration](https://select2.org/configuration/), [AJAX](https://select2.org/data-sources/ajax/), [programmatic values](https://select2.org/programmatic-control/add-select-clear-items/), and [events](https://select2.org/programmatic-control/events/).
