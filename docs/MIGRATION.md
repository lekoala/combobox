# Migration audit: existing libraries → Combobox

This is a design migration, not a compatibility layer. Preserve use cases, not every historical option name.

## Declarative contract: `data-combobox` → `<combo-box>`

The library started with a `[data-combobox]` attribute contract. The declarative wrapper `<combo-box>` is now the primary element, but `data-combobox` and the imperative path remain first-class until migration is done. Both feed the exact same engine — this is a markup classification, not a rewrite.

| Existing | Direction | New shape |
|---|---|---|
| `<select id="x" data-combobox>` | Expand | `<combo-box><select id="x">…</select></combo-box>` |
| `<input data-combobox list="…">` + `<datalist>` | Expand | `<combo-box><input list="…"><datalist>…</datalist></combo-box>` |
| `data-create` | Map to attribute | `<combo-box create>` |
| `data-placeholder` | Map to attribute | `placeholder` |
| `data-max` | Map to attribute | `max-items` |
| `search` attribute | Keep | `search` → `match` (same on wrapper) |
| JS-only options (`load`, `create`, renderers) | Keep | `element.configure({ … })` |
| imperative init | Keep | `Combobox.init(selector)` / `Combobox.getOrCreateInstance(source)` |
| explicit filter input sibling | Keep | `<combo-box><input filter="select-id" hidden><select id="select-id">…</select></combo-box>` |

The wrapper owns only lifecycle (upgrade/dispose); the native source never changes hands. `data-combobox` is intentionally kept so the two contracts coexist during the progressive move.

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
| `allowSame` | Drop/clarify | value identity must be unambiguous (`#selectItem` resolves by value); duplicate labels are allowed |
| `addOnBlur` | Consider | `createOnBlur` (implemented); means a real leave — internal blur and IME composition never create |
| `showDisabled` | Default behavior decision | disabled results stay visible but are never selectable; a selected-but-disabled option keeps its chip without a remove button |
| `hideNativeValidation` | Drop | preserve native validation instead |
| `suggestionsThreshold` | Rename | `minChars` |
| `maximumItems` (visible results) | Keep separately | `maxOptions` (implemented): rendering cap only, never bypassed by `loadMore()` |
| `autoselectFirst` | Divergence (documented) | default `false` (select-first requires ArrowDown); legacy default was `true` |
| `updateOnSelect` | Mostly drop | select filter and form value are intentionally separate |
| `highlightTyped` | Renderer/helper | not core state |
| `fullWidth` | Drop | CSS Anchor sizing |
| `fixed` | Drop | Popover + Anchor |
| `fuzzy` | Extension seam | custom `match/score` rather than built-in engine initially |
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

## Select2 integration hacks that should disappear

### Extra dynamic AJAX fields

Old: encode selectors in `ajax.extra`, then rewrite `ajax.data`.

New: loader reads current application state directly.

### Partial-date transport override

Old: replace AJAX transport to return empty results.

New: `shouldLoad(query)` or cancellable `beforeload`.

### `dropdownParent`, modal tabindex and width fixes

Drop. Top layer + CSS Anchor Positioning own popup geometry/stacking.

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
