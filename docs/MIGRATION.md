# Migrating to Combobox

This guide helps applications move from `bootstrap5-tags` or `bootstrap5-autocomplete` to `@lekoala/combobox`. Combobox is a new API, not a compatibility layer. Preserve use cases, not every historical option name.

## At a glance

```html
<!-- data-fuzzy="true" -->
<combo-box search="fuzzy">

<!-- data-max="2" -->
<combo-box max-items="2">

<!-- data-allow-new="true" -->
<combo-box create>
```

## Migration is documentation, not runtime compatibility

The new API is exactly two surfaces — the JavaScript engine and the `<combo-box>`
element. Legacy source-level `data-*` attributes are **not** re-implemented as a
hidden compatibility layer: migration happens in the markup, once, by moving
configuration onto the `<combo-box>` element. The old markup simply stops being
configured (native semantics remain, unenhanced), and the new shape takes over:

| Existing (bootstrap5-tags/autocomplete) | Migrate to |
|---|---|
| `<select data-combobox>` / `<input data-combobox list="…">` | `<combo-box><select>…</select></combo-box>` |
| `data-create` | `<combo-box create>` |
| `data-placeholder` | `<combo-box placeholder>` |
| `data-max` | `<combo-box max-items>` |
| `data-match` | `<combo-box search>` |
| `data-separator` | `<combo-box separators>` |
| `data-fuzzy="true"` | `<combo-box search="fuzzy">` |
| `data-allow-new="true"` | `<combo-box create>` |
| `data-add-on-blur="true"` | `<combo-box create-on-blur>` |
| `data-filter-input="input-id"` | `<input data-filter-for="select-id" hidden>` |
| JS options (`load`, `create`, renderers) | `box.configure({ … })` on the `<combo-box>` element |
| imperative init | `Combobox.init("select.mine")` / `Combobox.getOrCreateInstance(source)` |
| explicit filter input sibling | `<combo-box><input data-filter-for="select-id" hidden><select id="select-id">…</select></combo-box>` |

The wrapper owns only lifecycle (upgrade/dispose); the native source never changes hands. `data-*` on source items remains **application metadata** (`item.data`), never configuration.

## `bootstrap5-tags`

| Existing concept | Direction | New shape / note |
|---|---|---|
| select single/multiple | Keep | Native select is source/value owner |
| `items` | Keep, redesign | durable `setOptions()` vs transient `setResults()` |
| `allowNew` | Rename | `create` |
| `showAllSuggestions` | Simplify | matching/filter hook; empty query naturally shows source |
| badge/chip styling options | Drop from JS core | CSS/render skin |
| `allowClear` | Keep capability | `clear()`; the clear affordance is application-authored and calls `clear()` — no core option auto-injects a clear button |
| `selected` config | Prefer native | selected `<option>`; programmatic `select()` |
| `regex` | Redesign | `createFilter()` |
| `separator` | Keep, redesigned | `separators` + `tokenize` seam; pipe-delimited attribute, full-string separators, sequential token consumption (implemented) |
| `max` | Keep | `maxItems` |
| `placeholder` | Keep | `placeholder` / native placeholder option |
| `showDropIcon` | Skin | CSS/markup decision |
| `keepOpen` | Keep behavior | `closeOnSelect`; default single closes / multiple stays open (implemented) |
| `allowSame` | Drop/clarify | identity is the native `<option>` element, never the `value` string — if the catalogue has three `<option value="2">` they are three distinct choices (and only three); `select/remove/move/chips` address the exact option. Duplicate labels stay legal. |
| `addOnBlur` | Consider | `createOnBlur` (implemented); means a real leave — internal blur and IME composition never create |
| `showDisabled` | Default behavior decision | disabled results stay visible but are never selectable; a selected-but-disabled option keeps its chip without a remove button |
| `hideNativeValidation` | Drop | preserve native validation instead |
| `suggestionsThreshold` | Rename | `minChars` |
| `maximumItems` (visible results) | Keep separately | `maxOptions` (implemented): rendering cap only, never bypassed by `loadMore()` |
| `autoselectFirst` | Divergence (documented) | default `false` (select-first requires ArrowDown); legacy default was `true` |
| `updateOnSelect` | Mostly drop | select filter and form value are intentionally separate |
| `highlightTyped` | Renderer/helper | not core state |
| `fullWidth` | Drop | floating reference width |
| `fixed` | Drop | Popover + floating placement |
| `fuzzy` | Keep, native | `match: "fuzzy"` — lightweight subsequence matching, no ranking; `score`/`sort` remain for custom ranking |
| `startsWith` | Keep | `match: "startswith"` |
| `singleBadge` | Drop | renderer/skin |
| `activeClasses` | Drop | component CSS/state attributes |
| `labelField`, `valueField` | Keep, narrowed | map data objects only; real `<option>` elements are never reinterpreted (implemented) |
| `searchFields` | Keep | `searchFields` |
| `queryParam`, `server*`, `fetchOptions`, `liveServer`, `noCache` | Drop transport DSL | application-owned `load()` |
| `allowHtml`, `sanitizer` | Replace | safe text by default; rich renderer returns Node |
| `debounceTime` | Keep | `debounce` |
| `notFoundMessage` | Keep, grouped | `messages.noResults` (+ `render.noResults` override) |
| callbacks | Prefer events/hooks | lifecycle CustomEvents + render/load/create hooks |
| `confirmAdd`, `confirmClear` | Implemented as `guards` | explicit async guard contract: `false` refuses, rejected promises are app errors (`combobox:guarderror`) |
| programmatic `addItem/setItem/removeItem/removeAll` | Keep | `select/remove/clear/addOption` |
| paste multiple tags | Keep | tokenizer/paste (implemented) |
| reset/native change | Keep and strengthen | native source authoritative |

## `bootstrap5-autocomplete`

| Existing concept | Direction | New shape / note |
|---|---|---|
| input autocomplete | Keep | `input + datalist` value model |
| server/live server | Replace | `load()` |
| `source` callback | Replace | local setResults or `load()` |
| hidden input/value | Usually drop | if label != value, model it as select-backed combobox |
| datalist source | Keep | native fallback + enhanced source |
| clear control | Core API, external UI | `clear()` |
| `tabSelect` | Divergence (documented) | opt-in JS option `tabSelect`, default `false`: Tab keeps native focus traversal unless the option is enabled, and then only commits when a real commit is possible. Legacy default was `true`/selective. |
| `ignoreEnter` | Decide through keyboard policy | avoid legacy keyCode behavior |
| `fillIn` secondary action | Not core initially | rich renderer/app action if needed |
| browser autocomplete hacks | Minimize | enhanced input `autocomplete=off`; restore on dispose |
| itemClass / activeClasses | Skin | CSS/renderers |
| groups | Keep | optgroups/group renderer |
| disabled | Native | source state |
| destroy/getInstance | Keep | lifecycle API |

## Legacy demo migration tour

Each scenario exercised by the old `bootstrap5-tags` and `bootstrap5-autocomplete`
demos is classified against the new engine. The classification is the migration
contract: every legacy case either keeps a functional equivalent, has a designed
replacement, or is dropped on purpose. Not every row needs a new demo — demos are
illustrations, the coverage matrix in `TESTING.md` is the proof.

### `bootstrap5-tags` demo

| Legacy scenario | Classification | Where it lands |
|---|---|---|
| select single/multiple | covered | native source owner |
| chips (badges) | covered, identity fixed | chips; a duplicate `value` is a distinct `<option>` identity |
| optgroup / disabled option / disabled select | covered | `sync()`, disabled propagation |
| native validation + reset | covered | `checkValidity()`/`invalid`/reset restore default selections incl. duplicate `value` |
| allow clear / clear API | covered | `clear()`; the clear affordance stays application-authored |
| allow new (`allowNew`) | redesigned | `create` + `createFilter` + async `create` + guards |
| regex (`canAdd`) | redesigned | `createFilter()` |
| separator / paste of several values | covered | `separators` + `tokenize` seam, sequential consumption |
| add on blur | covered | `createOnBlur` (real leave only; IME-safe) |
| max items | covered | `maxItems` counts selected `<option>`s, never unique values |
| show disabled | covered | disabled rows stay visible, are never selectable |
| search fields | covered | `searchFields` |
| custom label/value fields | covered, narrowed | map data objects only; real `<option>`s are canonical |
| custom render item | redesigned | `render.item`/`render.option` returning DOM `Node`s (safe by default) |
| remote initial + live remote | covered | `load(query, { signal, cursor, source, input, combobox })` |
| dependent parameters | covered | app-level loader reads live state |
| selected ordering | covered | `selectionOrder: "selected"` + `move()` |
| fuzzy | covered | native `match: "fuzzy"` subsequence matching (no ranking) |
| HTML in labels | redesigned | renderer returns Nodes; strings are text |
| SortableJS chip drag/drop | intentionally dropped | `move()` is the model op; drag/drop stays external |
| `allowSame` | deliberately removed | native option identity replaces it (see option-identity contract) |

### `bootstrap5-autocomplete` demo

| Legacy scenario | Classification | Where it lands |
|---|---|---|
| input + array | covered | datalist/`setOptions` |
| datalist | covered | native fallback + enhanced source adapter |
| label/value different | covered | select-backed, `label-field`/`value-field` |
| groups, threshold, show-all | covered | optgroups, `minChars`, empty query shows source |
| local filtering / `startsWith` | covered | `match: "includes" \| "startswith" \| "pattern"` |
| custom `source()` | covered | `load()` / transient `setResults()` |
| remote, debounce, stale requests | covered | `load` + AbortSignal + debounce |
| `searchFields` | covered | `searchFields` |
| not-found | covered | `messages.noResults` + `render.noResults` |
| custom rendering | covered | `render.option`/`render.item` |
| Tab select | diverged (documented) | opt-in `tabSelect`; Tab never blocked unless a commit is possible |
| disabled | covered | native source state |
| RTL | covered | logical CSS + physical keyboard tests |
| custom element integration | covered | `<combo-box>` wrapper |
| clear API / external control | covered | `clear()` |
| `fullWidth`/`fixed`/`dropdownParent` | intentionally dropped | Popover top layer + `@lekoala/floating` |
| fuzzy | covered | native `match: "fuzzy"` subsequence matching |
| Bootstrap modal / positioning hacks | intentionally dropped | we anchor inside the modal via the `<dialog>` parent instead |

## Select2 integration hacks that should disappear

### Extra dynamic AJAX fields

Old: encode selectors in `ajax.extra`, then rewrite `ajax.data`.

New: loader reads current application state directly.

### Partial-date transport override

Old: replace AJAX transport to return empty results.

New: `shouldLoad(query)` or cancellable `beforeload`.

### `dropdownParent`, modal tabindex and width fixes

Drop. The Popover owns the top layer and `@lekoala/floating` owns popup geometry.

### Manual `new Option(...).trigger("change")` after modal creation

Replace with:

```js
combo.select({ value: response.id, label: response.name });
```

### Clear-all DOM injection

Core provides `clear()` and events. UI placement stays outside the data model.

### Reorder by detach/append `<option>`

Do not mutate catalogue order. Use explicit selection order + `move()`.

## Features intentionally not inherited from Tom Select / Select2

- plugin/decorator architecture;
- virtual scrolling;
- chip drag/drop;
- caret positions between chips;
- checkbox result mode;
- generic dropdown-parent/positioning configuration.

These are not considered parity regressions unless a concrete application use case proves otherwise.
