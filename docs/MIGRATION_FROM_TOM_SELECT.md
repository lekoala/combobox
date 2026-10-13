# Migrating from Tom Select

This guide covers **Tom Select 2.x → `@lekoala/combobox` 0.6.x**. Combobox is a new API, **not a drop-in replacement**: migrate use cases rather than options one-for-one. Never initialize both libraries on the same source control.

The key difference: Combobox enhances a real `<select>` (single or multiple) or `<input list="…">`. The native control remains responsible for submitted values, `required`, `disabled`, `form.reset()`, and the initial selection. Remote suggestions are temporary until selected.

See also the [API reference](API.md), [use cases](USE_CASES.md), and [general migration notes](MIGRATION.md).

## 1. Initialization

**Before — Tom Select:**

```html
<select id="country" name="country">
  <option value="">Choose a country</option>
  <option value="be">Belgium</option>
  <option value="fr">France</option>
</select>
```

```js
new TomSelect("#country", { maxOptions: 30 });
```

**After — declarative Combobox:**

```html
<combo-box max-options="30" placeholder="Choose a country">
  <select id="country" name="country">
    <option value="">Choose a country</option>
    <option value="be">Belgium</option>
    <option value="fr">France</option>
  </select>
</combo-box>
```

Register the element and load CSS once:

```js
import "@lekoala/combobox/combobox.css";
import { defineCombobox } from "@lekoala/combobox";

defineCombobox();
```

You can instead `import "@lekoala/combobox/define"` for side-effect registration. For classic scripts, use `dist/combobox.js` and `dist/combobox.css`; the `standalone` build registers the element **and injects CSS**. See [installation](../README.md#four-ways-to-use-it).

**Alternative — JavaScript-only initialization:**

```js
import { Combobox } from "@lekoala/combobox";

const select = document.querySelector("#country");
const combo = Combobox.getOrCreateInstance(select, { maxOptions: 30 });
// Or: const combo = new Combobox(select, { maxOptions: 30 });
```

Do not combine the custom-element wrapper and imperative engine on the same control. The wrapper discovers **direct child** sources only.

For a nullable single select, keep an empty `<option value="">` as the **first option**: by default that empty option is a placeholder (never a chip, never a submitted value), and `allowEmptyOption` promotes it to a real selectable value. Tom Select's `placeholder` text lives on that empty option label; Combobox's `placeholder` option only sets the filter input's placeholder.

## 2. Configuration mapping

| Tom Select                              | Combobox                                         | Notes                                                  |
|-----------------------------------------|--------------------------------------------------|--------------------------------------------------------|
| `new TomSelect(selector, settings)`     | `<combo-box>` or `new Combobox(source, options)` | Not a compatible constructor                           |
| `maxItems`                              | `maxItems` / `max-items`                         | **`0`**, not `null`, means unlimited                   |
| `maxOptions`                            | `maxOptions` / `max-options`                     | `0` = unlimited; caps **rendered** rows                |
| `create: true`                          | `create: true` / `create` attribute              | Adds real native options when selected                 |
| `create(input)`                         | `create(label, { signal })`                      | Return `{ value, label }`; async supported             |
| `createFilter`                          | `createFilter`                                   | Predicate; check callback signature                    |
| `createOnBlur`                          | `createOnBlur` / `create-on-blur`                | Opt-in                                                 |
| `delimiter`                             | `separators` / `separators=",|;"`                | Multi-select tokenization; attribute is pipe-separated |
| `searchField`                           | `searchFields` / `search-fields`                 | Array of fields; matching semantics differ             |
| `valueField`, `labelField`              | `valueField`, `labelField`                       | Only map plain data objects, not native `<option>`s    |
| `load(query, callback)`                 | `async load(query, { signal, cursor })`          | Return an array or `{ items, cursor }`                 |
| `shouldLoad`                            | `shouldLoad`                                     | Predicate for business/query validation                |
| `loadThrottle`                          | `debounce`                                       | Milliseconds (default 200)                             |
| `score`, `sortField`                    | `score`, `sort`                                  | Rewrite callbacks; signatures are not identical        |
| `render.option`, `render.item`          | `render.option`, `render.item`                   | Return DOM nodes or text; never raw HTML strings       |
| `closeAfterSelect`                      | `closeOnSelect` / `close-on-select`              | Defaults: single closes; multiple stays open           |
| `selectOnTab`                           | `tabSelect` / `tab-select`                       | Off by default                                         |
| `onChange`, `onItemAdd`, `onItemRemove` | Native `change`, `combobox:*` events             | DOM listeners, not Tom Select callbacks                |
| `plugins`                               | No plugin registry                               | See deliberate omissions below                         |

**Important:** the native `multiple` attribute decides single versus multi selection. A `<select multiple>` with `max-items="1"` is **still a multiple select** with a limit of one. It is not converted into single-select mode.

The multiple-select picker hides selected entries by default. `toggle-selected` is different from Tom Select's `hideSelected: false`: it keeps selected rows visible **and makes activating them remove the selection**.

## 3. Multiple values, chips, and creation

**Before:**

```js
new TomSelect("#topics", {
  plugins: ["remove_button"],
  create: true,
  maxItems: 5,
  delimiter: ",",
});
```

**After:**

```html
<combo-box create max-items="5" separators=",">
  <select id="topics" name="topics[]" multiple>
    <option value="php" selected>PHP</option>
    <option value="js">JavaScript</option>
  </select>
</combo-box>
```

Removable chips are built in; no `remove_button` plugin is required. For a checkbox-like tag editor, add `toggle-selected` so rows can be turned off in the dropdown. Server-backed creation is a JavaScript callback on the wrapper:

```js
const box = document.querySelector("combo-box");
box.configure({
  createFilter: (label) => label.trim().length >= 3,
  async create(label, { signal }) {
    const response = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: label }),
      signal,
    });
    if (!response.ok) throw new Error("Creation failed");
    const topic = await response.json();
    return { value: String(topic.id), label: topic.name };
  },
});
```

`createOnBlur`, multi-character separators and asynchronous `guards` exist, but application-specific plugins should stay in the application.

## 4. Remote search: callback → promise

**Before:**

```js
new TomSelect("#patient", {
  valueField: "id",
  labelField: "name",
  searchField: "name",
  shouldLoad: (query) => query.length >= 2,
  load(query, callback) {
    fetch("/api/patients?q=" + encodeURIComponent(query))
      .then((r) => r.json())
      .then((data) => callback(data.items))
      .catch(() => callback());
  },
});
```

**After:**

```html
<combo-box class="patients" min-chars="2">
  <select id="patient" name="patient">
    <option value="">Select a patient</option>
  </select>
</combo-box>
```

```js
document.querySelector("combo-box.patients").configure({
  async load(query, { signal }) {
    const response = await fetch(
      "/api/patients?q=" + encodeURIComponent(query),
      { signal },
    );
    if (!response.ok) throw new Error("Search failed");
    const data = await response.json();
    return data.items.map((patient) => ({
      value: String(patient.id),
      label: patient.name,
    }));
  },
});
```

Combobox handles debounce, aborts superseded requests, and protects against stale responses. **Remote results are temporary suggestions**: unselected items do not become native `<option>`s. Selecting one materializes that option. `setResults()` replaces transient suggestions; `setOptions()` replaces the persistent native catalogue while preserving selected native options by default. If the application depended on Tom Select's option cache, implement that caching policy separately.

For cursor-based pagination, `load` can return `{ items, cursor }`, and application-owned UI can invoke `combo.loadMore()`. No infinite scrolling is built into the core.

## 5. Values, events, and lifecycle

```js
const box = document.querySelector("combo-box.patients");
const combo = await box.whenReady();

combo.getSelectedValues();                      // array of strings
combo.getSelectedItems();                       // normalized selected items
combo.select("existing-value");                 // existing native option only
combo.select({ value: "42", label: "Jane" });     // materialize if absent
await combo.remove("42");                       // Promise<boolean>
await combo.clear();                            // Promise<boolean>
combo.show();
combo.hide();
combo.sync();                                   // after direct source DOM changes
```

There is no direct `setValue(array)` API. For a multiple select replacement, clear the existing selection, then select each existing value or pass `{ value, label }` objects for missing options. Unlike Tom Select's `setValue`, this sequence is **not atomic** and emits regular native value-change events; if atomic semantics matter, keep that orchestration in application code.

**Before:** `tom.on("item_add", handler)` and `tom.on("change", handler)`.

**After:** listen on the real `<select>`:

```js
const select = document.querySelector("#patient");
select.addEventListener("change", () => console.log(select.value));
select.addEventListener("combobox:select", (event) => {
  console.log(event.detail);
});
select.addEventListener("combobox:beforeselect", (event) => {
  if (event.detail.item.value === "forbidden") event.preventDefault();
});
```

A real value mutation through Combobox dispatches native `input` then `change`, once each. `combobox:*` lifecycle/selection events fire on the **native source**; `beforefilter` and `filter` fire on the **interaction input** (`combo.input`), not the select. Unlike Tom Select's event emitter, these are standard DOM events.

With `<combo-box>`, changing observed attributes or calling `box.configure()` **rebuilds the engine on a microtask**. Do not cache `box.combobox` across reconfiguration. Use `combobox:ready` to reattach per-instance handlers. Call `box.dispose()` or `combo.dispose()` to restore the native control.

## 6. Rendering and deliberate differences

```js
box.configure({
  render: {
    option(item) {
      const strong = document.createElement("strong");
      strong.textContent = item.label;
      return strong;
    },
  },
});
```

Tom Select templates may return HTML strings. Combobox treats strings as **text**, so rich rendering requires safe DOM nodes. Styling uses its own `.cb-*` CSS and variables, not Tom Select's generated classes.

Combobox intentionally does **not** ship a plugin framework, virtual scrolling, built-in chip drag/drop, caret-between-chips editing, checkbox result plugins, or general `dropdownParent` control. You can use `selectionOrder: "selected"` and `combo.move()` for custom chip reordering. The Popover API and `@lekoala/floating` replace most dropdown positioning hacks.

## Migration checklist

- [ ] Remove Tom Select JS/CSS/plugins from migrated fields; never double-initialize.
- [ ] Preserve `name`, `multiple`, `required`, `disabled`, `selected`, and `<optgroup>` on the native select.
- [ ] Check empty-first-option behavior, `form.reset()`, `FormData`, and `name="tags[]"` submissions.
- [ ] Adapt remote callbacks into promise-returning loaders; verify cancellation and selected-option materialization.
- [ ] Review `null` → `0` for unlimited items/options and single-vs-multiple selection behavior.
- [ ] Replace Tom Select instance events with DOM events; rewire listeners on rebuild.
- [ ] Verify custom templates, keyboard behavior, accessibility, and fallback in your target browsers.

**Upstream references:** [Tom Select settings](https://tom-select.js.org/docs/), [API](https://tom-select.js.org/docs/api/), and [events](https://tom-select.js.org/docs/events/).
