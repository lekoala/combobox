# API reference

This documents the API surface shipped in `@lekoala/combobox`. Its exact contract
may still evolve in a later 0.x.

## Initialization

```js
Combobox.init("select.my-combobox", options);

const combo = new Combobox(element, options);
Combobox.getInstance(element);
Combobox.getOrCreateInstance(element, options);
Combobox.supported;
```

`init()` is a discovery/creation API, not a reconfiguration API. It accepts:
- a CSS selector, globally or scoped to a root;
- a root `Element`/`Document` **plus an explicit selector**;
- a list of source elements (`NodeList` or array).

```js
Combobox.init("select");
Combobox.init("select", options);
Combobox.init(root, "select");
Combobox.init(root, "select", options);
Combobox.init([select1, input2], options);
Combobox.init(nodeList, options);
```

Discovery is always explicit: an element root without a selector (or a bare
`init()`) finds nothing — there is no implicit `data-*` marker.

An element that already has an instance is returned as-is and **never** reconfigured — `init(root, { maxItems: 3 })` followed by `init(root, { maxItems: 10 })` upgrades nothing twice and silently reconfigures nothing. Unsupported elements inside a collection are ignored without invalidating the call. `init()` returns the array of `Combobox` instances.

## Element and registration

The engine is wrapped by an autonomous custom element `<combo-box>` (no Shadow DOM, not form-associated). The child `<input>`/`<select>` remains the form-value owner.

Importing the library never registers anything. Register explicitly:

```js
defineCombobox(); // registers <combo-box>, idempotent
```

`defineCombobox()`:
- registers `<combo-box>` with `ComboBoxElement` in the global `customElements`;
- is idempotent — the second call returns the same constructor and never throws;
- returns the `ComboBoxElement` constructor for convenience.

The official component name is fixed. An application-specific tag is native
subclassing on the exported class:

```js
import { ComboBoxElement } from "@lekoala/combobox";

customElements.define("app-combobox", class extends ComboBoxElement {});
```

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

The table below is driven by a single `OPTION_ATTRIBUTES` schema in
`src/combo-box.js`: presence in that schema means the attribute is observed
and maps to an engine option. Numeric attributes (`min-chars`, `max-items`,
`max-options`, `debounce`) accept integers only; an invalid or non-integer
attribute value is ignored and the DEFAULTS value applies instead of a `NaN`
leaking into the engine.

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
| `tab-select` | `tabSelect: true` |
| `search-fields` | `searchFields: ["label", "email", ...]` (comma-delimited) |
| `label-field` | `labelField` |
| `value-field` | `valueField` |
| `load-on-empty` | `loadOnEmpty: true` |
| `allow-empty-option` | `allowEmptyOption: true` |
| `debounce` | `debounce` |

Boolean attributes honor `="false"` to turn off and `="true"` (or plain presence)
to turn on.

The JavaScript API and `<combo-box>` attributes are the **two canonical
configuration surfaces**. `<combo-box>` attributes expose simple serializable
behavior (boolean / number / enum / short string / short list) declaratively;
JavaScript options expose the same configuration plus functions and structured
behavior. Native form semantics stay on the enhanced `<input>`/`<select>`.
`data-*` attributes on **source items** are application metadata exposed as
`item.data` (e.g. they feed `search-fields="label,email"`), never combobox
configuration — there is no generic `data-*` → option mapping and no
source-level `data-*` configuration API. Wrapper options (`_options`) take precedence over markup.

### Declarative surface freeze (0.1)

The `OPTION_ATTRIBUTES` schema is the **frozen declarative surface for 0.1**: the
attribute → option table above is a commitment, not a proposal. The rule:

- **primitive / simple serializable config** → an attribute (`present`/`absent`,
  numbers, enums, short strings, pipe-delimited lists);
- **function / object behavior** → JavaScript-only.

Consequently these are intentionally **JS-only** and have no `<combo-box>`
attribute: `create` (function form), `createFilter`, `tokenize`, `load`,
`shouldLoad`, `filter`, `score`, `sort`, `guards`, `render`, `messages`,
`observeSource`, `anchor`, and the `loadMore()` method. `maxItems`/`maxOptions`
are documented separately: `maxItems` caps selection, `maxOptions` caps rendered
rows (see Core options above).

Config must never be smuggled onto the **source** element via `data-*`; the
liaison between a `<select>` and an authored filter `<input>` uses the
proprietary `data-filter-for` attribute (see ARCHITECTURE.md), which is
configuration, not application metadata.

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
    position: (label, position, total) => `${label} position ${position} of ${total}`,
  },
  minChars: 0,
  match: "includes",       // includes | startswith | fuzzy | pattern | function
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
  anchor: null,             // optional consumer-authored HTMLElement

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

`placeholder` deliberately stays top-level: it maps to the `<combo-box placeholder="…">` attribute and is structural input state, not generated text. It supplies the generated select filter or an input+datalist source only when that interaction input has no authored native `placeholder`; `dispose()` restores authored input state exactly. `render` stays separate from `messages` — messages are the accessible/bypassable text fallback, renderers return DOM.

#### Localization

Shipped base translations live in `src/locales/<lang>.js` and are importable through the `@lekoala/combobox/locales/*` subpaths. Importing one applies it to the engine defaults as a side effect:

```js
import "@lekoala/combobox/locales/fr";       // application-level default becomes French
// or: await import("data-grid-component/locales/fr");
```

```html
<script type="module" src="https://unpkg.com/@lekoala/combobox/locales/fr.js"></script>
```

Available locales: `en`, `fr`, `nl`, `de`, `es`, `it`, `pt` (European Portuguese), `ru`, `zh-CN`.

Semantics (mirroring data-grid):

- A locale only affects comboboxes created **after** the import: instances snapshot their `messages` at construction time. Existing instances keep their current text — reconfigure them explicitly with `options.messages` or re-create them.
- Per-instance `messages` always win over the locale defaults.
- `placeholder` is intentionally **not** part of the locales: it is structural input state and stays application-authored.

Programmatic control (re-exported from `src/index.js`):

```js
import { Combobox } from "@lekoala/combobox";
Combobox.getDefaultMessages();              // shallow copy of the current catalog
Combobox.setDefaultMessages({ noResults: "Custom" }); // merge; missing keys keep current values
```

`setDefaultMessages` merges (partial objects are fine) and never replaces the producer functions unless a replacement is provided. It does not refresh already-created instances — same contract as the locale imports.

### Deliberately not config options

No `fixed`, `dropdownParent`, `width`, `server`, `queryParam`, `serverDataKey`, `allowHtml`, Bootstrap modal options, or plugin registry.

`anchor` is the narrow composition seam for a consumer-authored control shell.
The picker uses that element as the `@lekoala/floating` reference for geometry
and as its internal-interaction boundary. This lets an input-backed combobox sit
beside application buttons/tokens without teaching the core what those adornments
mean. The anchor is not mutated by the engine.

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

### Matching modes

Every strategy is applied to **each `searchField` value independently** — the
fields are never concatenated, so a match can never span field boundaries. The
strategy decides *how a field matches*, not *which fields are merged*. The
pipeline is `query → match (per field) → filter → score/sort → maxOptions`;
an empty query skips matching entirely (the matcher has nothing to decide) but
`filter` admissibility still applies.

| Mode | Behavior |
|---|---|
| `includes` (default) | plain substring within one field (case- and accent-insensitive) |
| `startswith` | a field starts with the query |
| `fuzzy` | lightweight subsequence match within one field: every non-space query character appears in order (over already-normalized text, so `som` matches `Sómething`). It **never re-ranks** — catalogue order is preserved; use `score`/`sort` for custom ranking |
| `pattern` | escape-hatch regex on a field: the query string becomes a `RegExp` with the `i` flag only (never a caller-supplied regex, so no stateful `g`/`y` matcher); case- and accent-insensitive — `liège`, `Liège`, `LIEGE` and `liege` all match each other while regex structure (classes, anchors) is preserved. An invalid regex yields no results, never an error |
| `function` | `match(item, query, { combobox })` fully owns matching |

Multi-token cross-field matching (e.g. `jean paris` matching a name *and* a
city) is deliberately **out of scope** for the matcher; it belongs to
application-level query tokenization, not to `match`.

Declarative entry: `<combo-box search="fuzzy">`; imperative: `match: "fuzzy"`.

### `data-filtered` state mirror

`data-filtered` mirrors the dataset's *filtered* state — not the picker's
*visibility*. While a filter query is active, source `<option>`s that do not
match carry the attribute; it is removed as soon as the query is empty and on
`dispose()`. Opening or closing the popup does **not** touch it: visibility and
filtering are orthogonal. Apps may style or query `[data-filtered]` as their
temporary `:filtered` while the native primitive is not yet interoperable.

### `search(query, options)`

Runs the full `beforefilter → optional load → filter → render` pipeline.
It deliberately does not assign the interaction input's visible value.

### `setQuery(value, { show = true, reason = "api" })`

Assigns the visible interaction text, synchronizes `combo.query`, then runs the
normal search pipeline. Like native programmatic value assignment, it does not
emit `input`/`change`.

### `clearQuery({ show = false, reason = "api" })`

Equivalent to `setQuery("")`, with a closed picker staying closed by default.
It is intended for action-like results that transform application state from a
cancellable `combobox:beforeselect` handler.

### `applyFilter(query, { show })`

Runs local filtering without firing `beforefilter` or initiating load. Intended after an application cancels `beforefilter` and provides results itself.

**Choosing between the three search entry points:** `search(query, …)` is the
complete pipeline (used to restart the current search or drive a remote
datasource); `setQuery(value, …)` is the programmatic "type into the combobox"
operation (visible text + `combo.query` + pipeline, no native `input`/`change`);
`applyFilter(query, …)` is the low-level local-only primitive reserved for the
canceled-`beforefilter` escape hatch. If you just want a filtered view of
locally-known options, `setQuery` is the intended call.

### `setResults(items)`

Sets transient picker results. Does not rewrite the native select catalogue.

### `clearResults()`

Returns to source-backed results.

### `setOptions(items, { preserveSelected })`

Explicitly replaces the durable native source catalogue. This is intentionally distinct from `setResults()`.

### Durable catalogue vs transient results (contract)

```text
results transitoires
      ↓ sélection / create
source native matérialisée
      ↓
préservée lors des remplacements tant qu'elle est sélectionnée
```

Concretely:

- **`setResults()`/`clearResults()` never touch the native source.** Transient
  results exist only in the picker; dropping them cannot remove or add a single
  `<option>`.
- **Selecting a transient result materializes exactly that one native option**;
  `create` materializes the created option. Both become ordinary catalogue
  entries.
- **`setOptions()` replaces the catalogue but preserves every native option that
  is currently selected, whatever its origin** (`preserveSelected`, the default
  for a select source). A created or materially-realized option therefore
  survives `sync()`, `clearResults()` and a `setOptions()` **as long as it is
  selected** — and a future `setOptions()` may drop it once it is not.
- A native option that was materialized but is **not selected** is not protected:
  the next `setOptions()` drops it when it is absent from the new catalogue. So
  temporary remote collections never accumulate indefinitely in the `<select>`.
- `form.reset()` follows native `<select>` semantics: it restores the authored
  default selection and never rewrites the catalogue. A created option stays in
  the source after a reset, it just stops being selected.

### `sync()`

Refresh from externally-mutated native DOM. `sync()` also drops transient `setResults()` results back to the source catalogue, so it remains the explicit escape hatch for arbitrary mutations.

`observeSource: true` (default `false`) adds an opt-in, debounced MutationObserver that calls `sync()` once per batch. It watches:

- the select's `<option>`/`<optgroup>` structure and its `selected`/`disabled`/`required`/`readonly` attributes;
- the `<datalist>`'s `<option>` set for input-backed comboboxes (the catalogue stays discoverable by id while the input's native `list` liaison is temporarily removed).

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

Example from a real application requirement:

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

Grouped results render as named `role="group"` containers inside the listbox;
each container owns its option rows and is labelled by the visible `.cb-group`
header. This preserves native `<optgroup>` structure in the accessible picker
projection, including for transient remote groups.

## Result rendering cap

`maxOptions` caps *displayed/navigable* options only. `results` may hold 500 items with `maxOptions: 20` — at most 20 render, and keyboard navigation stays inside that window. `0` means no cap. Remote `loadMore()` may enrich the result store but never bypasses the cap; a pagination affordance is a separate concept.

## Keyboard interaction

Focus stays in the search input; the picker is driven entirely through it (`role=combobox` + `aria-activedescendant`). Options are non-focusable rows.

### Picker

| Key | Behavior |
| --- | --- |
| `ArrowDown` / `ArrowUp` | open the picker when closed; move the active option, wrapping within the rendered window and skipping `disabled` rows |
| `Home` / `End` | stay on the native caret inside the editable filter input (per the ARIA APG editable-combobox guidance) |
| `PageDown` / `PageUp` | move the active option by a page (listbox viewport height ÷ row height), clamped to the first/last selectable option |
| `Enter` | select the active option, or create/commit an eligible entry when no option is active; without a possible commit, preserve native behavior such as form submission |
| `Escape` | close the picker and clear `aria-activedescendant` |
| `Tab` | native focus traversal by default (an open picker closes first without blocking traversal, per the ARIA APG combobox pattern); with `tabSelect: true` commits the active option / eligible create like Enter, and only `preventDefault()`s when a commit is actually possible |

Navigation keys always operate on the filtered, rendered window (`maxOptions`), open a closed picker, skip `disabled` rows, and never land on one. IME composition never tokenizes/selects. `autoselectFirst: true` preselects the first selectable option after every filter.

### Chips (multiple)

- `ArrowLeft` on an empty search focuses the last chip; `Backspace` on an empty search removes the last selected entry through the normal guarded/`beforeremove` path.
- On a focused chip: `ArrowLeft`/`ArrowRight` move between chips, `Home`/`End` jump to first/last, and moving past the last returns to the search input.
- `Delete` / `Backspace` on a focused chip removes it and refocuses the neighbor (or the input when the list empties); `Escape` returns to the search input.
- Arrow/handoff keys are physical: in RTL layouts they keep DOM-index semantics while the layout flows right-to-left via logical CSS.

## Value operations

```js
combo.select({ value: data.id, label: data.name });
combo.select("existing-value");
const removed = await combo.remove("value");      // boolean
const removedExact = await combo.remove(option);  // boolean (exact <option>)
const cleared = await combo.clear();              // boolean
combo.addOption(item, { selected: false });
combo.getSelectedValues();
combo.getSelectedItems();
```

For a `<select>`, **option identity is the `HTMLOptionElement`**; `option.value` is only
the serialized payload. Three `<option value="2">` in the catalogue are three distinct
choices — each selectable once, each kept as its own chip, each serialized into FormData.
This replaces any notion of a same-value toggle entirely: the catalogue decides how many copies exist,
and nothing magically makes a single option selectable twice.

- `select({value, label})` is the external-create seam: if no selectable catalogue option
  carries that value, the component materializes one, selects it, refreshes UI and emits
  native value events. Passing an exact `<option>` selects that identity.
- `select("value")` is strictly "select the next matching catalogue occurrence": each call
  resolves to the first matching option that is not already selected (in multiple mode)
  and never creates. Repeated `select("2")` on three catalogue `2`s selects all three and
  a fourth call returns `false`.
- `select()` returns a boolean; nothing is created or changed on `false`.
- `remove(valueOrOption)` takes an exact `<option>` (e.g. the one behind a chip) or a
  string (the first selected occurrence in the current order).
- `addOption()` always appends a new native option — it never dedupes by `value` — unless
  `item.option` is passed, in which case that exact option is adopted.
- `addOption(item, { selected: true })` changes live selection only; it never
  changes `defaultSelected` or rewrites the baseline used by `form.reset()`.
- Empty values are handled deliberately, never through truthiness: a selected
  `<option value="">` reports `[""]` from `getSelectedValues()`/`getSelectedItems()`
  for a select source, and an empty free-text input returns `[]` (nothing
  selected). `""` only becomes a *creatable* value through `addOption()` /
  `setOptions()` when `allow-empty-option` admits it; otherwise those APIs throw
  / skip it so the placeholder convention stays the single-select default.

`remove()` and `clear()` are async because they can await `guards`; they resolve `false` when refused (voluntary or guarded).

`clear()` on a **multiple** select deselects every selectable option. On a
**single** select it deselects the current option and the browser collapses the
select back to its first option — so author a `value=""` placeholder option as
the first child, otherwise `clear()` silently re-selects the first real option
instead of producing an empty value (`selectedIndex` is never `-1`; the
collapse is the browser's native rule, not an engine behavior).

Native `<option title="…">` tooltips propagate onto rendered rows and chips; richer
tooltips are the job of `render`.

## Ordering

```js
new Combobox(select, {
  selectionOrder: "selected",
});

combo.move("value", 0);
combo.move(option, 2); // exact option identity
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

Events split into two dispatch targets. This is deliberate: the `<select>` is
the data/value owner while the interaction input is where filtering actually
happens, so `beforefilter`/`filter` live on that input and `combobox:*`
lifecycle/value events live on the source element.

| Event | Target | Bubbles | Cancelable |
|---|---:|---:|---:|
| `beforefilter` | interaction input | yes | yes |
| `filter` | interaction input | yes | no |
| `combobox:*` (all others) | source element | yes | see below |

`beforefilter` also mirrors Open UI by exposing `event.query` directly in
addition to `event.detail.query`. For a select-backed combobox the interaction
input is a sibling of the `<select>` (inside the generated control), so
listeners attached to the `<select>` never see `beforefilter`/`filter` — listen
on `combo.input` or on `document`; for `input+list` the source *is* the input,
so both styles work.

### Open/close

```text
combobox:beforeopen    cancellable
combobox:open
combobox:beforeclose   cancellable
combobox:close
```

### Filtering

```text
beforefilter           cancellable, event.query
filter
```

`filter` fires with `manual: true` when triggered through `applyFilter()`.
Both expose the query in `event.detail.query`.

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

## P0 API questions (all resolved before 0.1)

Resolved during design; kept as an audit trail:

- async guards for create/remove/clear: `guards: { add, remove, clear }` — `false` refuses, rejected promises surface via `combobox:guarderror`;
- tokenizer: separators splitter + optional `tokenize` seam, sequential token consumption, IME-safe;
- `maxOptions` (rendered) vs `maxItems` (selected): independent options;
- `closeOnSelect` defaults (single closes, multiple stays open) and `autoselectFirst` (default `false`: selection requires ArrowDown);
- `labelField`/`valueField` data-object mapping;
- `init(root, selector?, options?)`: type-dispatched overloads, discovery/creation only, idempotent (returned instance is never reconfigured);
- `tabSelect`: JS option, default `false`; when enabled Tab commits like Enter and only `preventDefault()`s when a commit is possible; IME composition falls through to native Tab.
- ordered-mode keyboard reorder: `Alt+ArrowLeft/Right` and `Alt+Home/End` on a focused chip, status-region position announcement;
- automatic DOM sync: opt-in `observeSource` (default `false`), debounced `sync()`, internal mutations suppressed (programmatic `.selected` changes and `multiple` toggles are intentionally out of the observer — see `sync()`);
- ESM export shape: `src/index.js` barrel + `src/define.js` side-effect entry + generated classic `dist/combobox.js` — see README's integration section;
