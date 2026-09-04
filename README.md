# @lekoala/combobox

A small, native-first combobox library for searchable selects, multiple values, tags and remote suggestions.

It enhances regular `<input>`, `<datalist>` and `<select>` controls instead of replacing them with a custom form model.

```html
<script type="module">
  import "@lekoala/combobox/define";
</script>

<combo-box create placeholder="Search or create a framework…">
  <select name="frameworks[]" multiple>
    <option value="react">React</option>
    <option value="vue">Vue</option>
  </select>
</combo-box>
```

The library uses the browser where it can:

* native form controls keep owning the value;
* Popover handles the picker top layer;
* `@lekoala/floating` handles placement and viewport updates;
* ARIA combobox/listbox semantics handle keyboard interaction;
* native `input`, `change`, validation and form reset keep working.

There is no CSS Anchor Positioning, no Bootstrap dependency and no global `window.*` API.

## Install

```bash
npm install @lekoala/combobox
```

or:

```bash
bun add @lekoala/combobox
```

## Four ways to use it

### `<combo-box>`

This is the simplest option for most applications.

```html
<script type="module">
  import "@lekoala/combobox/define";
</script>

<combo-box search="fuzzy" placeholder="Choose a country…">
  <select name="country">
    <option value="">Choose…</option>
    <option value="be">Belgium</option>
    <option value="fr">France</option>
  </select>
</combo-box>
```

Importing `@lekoala/combobox/define` registers `<combo-box>`.

Importing the main package does **not** register anything automatically.

### JavaScript

You can enhance a native control directly:

```js
import Combobox from "@lekoala/combobox";

const combo = new Combobox(document.querySelector("select"), {
  match: "fuzzy",
  minChars: 1,
});
```

### Classic script + separate CSS / `file://`

The classic build works without an ESM loader:

```html
<link rel="stylesheet" href="dist/combobox.css">
<script src="dist/combobox.js"></script>

<combo-box>
  <select>
    ...
  </select>
</combo-box>
```

It registers `<combo-box>`, but does not expose a global `Combobox` object. Styles stay
in a separate file, which is useful when your Content Security Policy forbids injected
inline styles.

### All-in-one standalone

For a single minified browser asset, use the standalone build:

```html
<script src="dist/combobox.standalone.min.js"></script>

<combo-box>
  <select>
    ...
  </select>
</combo-box>
```

The npm package exposes the same file as `@lekoala/combobox/standalone`. It registers
`<combo-box>` and injects the component CSS once as
`<style id="lekoala-combobox-style">`. Loading the script again does not duplicate
that style, and no library global is created.

#### Content Security Policy

The standalone script copies its own script nonce to the generated `<style>` element:

```html
<script nonce="your-request-nonce" src="dist/combobox.standalone.min.js"></script>
```

Your policy must accept that nonce for both `script-src` and `style-src`. If inline
style injection is not allowed, use the classic script plus `combobox.css`, or the ESM
entry plus separately imported CSS. Avoid loading `combobox.css` alongside the
standalone build unless duplicate CSS rules are intentional.

## Native controls stay native

The original control remains the source of truth.

For an input:

```text
<input list="cities">
       │
       └── owns the submitted value
```

For selects:

```text
<select>
<select multiple>
       │
       └── own the submitted value(s)
```

The searchable input added around a `<select>` is only there for interaction. It has no `name` and never replaces the select in `FormData`.

This also means things such as:

* `required`;
* `disabled`;
* `form.reset()`;
* native `input` and `change`;
* server-rendered selections;

continue to behave like normal form controls.

## Searchable selects

A regular select can be filtered without changing its value model:

```html
<combo-box search="includes">
  <select name="doctor">
    <option value="1">Dr Jane Smith</option>
    <option value="2">Dr John Martin</option>
  </select>
</combo-box>
```

You can also provide your own interaction input:

```html
<input data-filter-for="doctor" placeholder="Search doctors…">

<select id="doctor" name="doctor">
  ...
</select>
```

The input is only used for filtering. The select still owns the value.

## Multiple values and tags

Multiple selects are rendered as removable chips:

```html
<combo-box>
  <select name="specialties[]" multiple>
    <option value="cardiology">Cardiology</option>
    <option value="neurology">Neurology</option>
  </select>
</combo-box>
```

Enable creation when users may enter new values:

```html
<combo-box create>
  <select name="tags[]" multiple></select>
</combo-box>
```

Created options are added to the native `<select>` just like normal options.

## Matching

Built-in search modes are:

```text
includes
startswith
fuzzy
pattern
```

Search can cover several fields:

```html
<combo-box
  search="fuzzy"
  search-fields="label city specialty"
>
  ...
</combo-box>
```

Each field is matched independently. Search never matches by accidentally joining fields together.

Matching is case- and accent-friendly where appropriate, so values such as:

```text
Liège
liege
LIEGE
liège
```

behave as expected.

More specialized matching can be provided from JavaScript.

## Remote results

Remote search stays deliberately simple:

```js
combo.configure({
  minChars: 2,

  async load(query, { signal }) {
    const response = await fetch(`/api/patients?q=${encodeURIComponent(query)}`, {
      signal,
    });

    return response.json();
  },
});
```

Remote results are **temporary suggestions**. They do not immediately become native `<option>` elements.

Once a remote result is selected, it is added to the select so normal form submission continues to work.

That distinction is intentional:

```text
catalogue        persistent native options
results          temporary search results
selection        native selected options
```

`setResults()` and `clearResults()` only deal with temporary results.

`setOptions()` replaces the catalogue while keeping currently selected native options, including selected values that originally came from remote results or creation.

## Empty values

Empty option values are supported when explicitly enabled:

```html
<combo-box allow-empty-option>
  <select>
    <option value="">None</option>
    <option value="a">Option A</option>
  </select>
</combo-box>
```

Without `allow-empty-option`, `""` is not treated as a normal selectable item when options are added programmatically.

## JavaScript-only behavior

Simple options have HTML attributes where that makes sense:

```html
<combo-box
  create
  search="fuzzy"
  min-chars="2"
  max-items="5"
  max-options="20"
  tab-select
>
```

Behavior that requires functions stays in JavaScript:

```js
element.configure({
  async load(query, context) {
    // ...
  },

  guards: {
    async remove(item) {
      return confirm(`Remove ${item.label}?`);
    },
  },

  render: {
    option(item) {
      const strong = document.createElement("strong");
      strong.textContent = item.label;
      return strong;
    },
  },
});
```

Strings are always rendered as text. Rich rendering uses DOM nodes rather than an `allowHtml` switch.

See [API](docs/API.md) for the full option and method reference.

## Filtering events

Filtering can be intercepted:

```js
combo.input.addEventListener("beforefilter", (event) => {
  if (somethingSpecial) {
    event.preventDefault();

    // Application-defined behavior...
  }
});
```

`beforefilter` is cancellable and exposes the current query.

Filtering events belong to the interaction input. `combobox:*` lifecycle events belong to the native source control.

The full event table is documented in [API](docs/API.md).

## Selection order

For multiple selects, source order and selection order do not have to mean the same thing.

When explicit selection order is enabled, values can be reordered with:

```js
combo.move("value", 0);
```

Drag-and-drop is intentionally not built into the core. An application can add whatever UI it wants and call `move()`.

## Progressive fallback

If the browser does not support the Popover API needed by the enhanced picker, the original controls remain usable.

* `input + datalist` stays a native datalist;
* `select` stays a native select;
* `select multiple` stays a native multiple select;
* creatable multiple selects get a small native Add input/button.

There is no second JavaScript picker implementation for older browsers.

You can force this mode in the demo with:

```text
?native=1
```

## Styling

The component ships with a small default stylesheet and is designed to be easy to theme with CSS custom properties.

For example:

```css
combo-box.compact {
  --cb-chip-font-size: 0.75em;
}

combo-box.pills {
  --cb-chip-border-radius: 999px;
}

combo-box.solid {
  --cb-chip-bg: #6d28d9;
  --cb-chip-color: white;
}
```

Applications can also return marker elements from renderers and style them with normal CSS:

```js
render: {
  item(item) {
    const label = document.createElement("span");
    label.className = `tag-tone-${item.data.tone}`;
    label.textContent = item.label;
    return label;
  },
}
```

```css
.cb-chip:has(.tag-tone-success) {
  --cb-chip-bg: #dcfce7;
  --cb-chip-color: #15803d;
}
```

`demo/actual-css.html` shows the same component themed entirely with [Actual CSS](https://github.com/lekoala/actual-css) tokens.

## Demo

The main demo covers:

* input + datalist;
* searchable single selects;
* multiple values and chips;
* created values;
* fuzzy and multi-field search;
* remote loading;
* custom renderers;
* selection order;
* guards;
* separators;
* maximum items/results;
* RTL;
* runtime disabled states;
* form reset;
* custom clear controls.

Run it locally with:

```bash
bun install
bun run dev
```

Then open:

```text
http://127.0.0.1:4173/
```

The main demo uses the generated distribution build, not a special development-only
version. `demo/dist-standalone.html` is the equivalent smoke page for the all-in-one
artifact.

## API Coverage

The main API covers:

* input + datalist;
* single and multiple selects;
* `<combo-box>`;
* filtering and matching;
* multiple search fields;
* creation;
* remote loading;
* chips;
* separators;
* `maxItems` and `maxOptions`;
* selection order and `move()`;
* `clear()`;
* form semantics;
* exact cleanup with `dispose()`.

A few more advanced APIs are intentionally still experimental in 0.x:

* `observeSource`;
* custom `tokenize`;
* cursor pagination / `loadMore()`;
* rich `render.*` customization.

Things that are deliberately **not** part of the library:

* a plugin framework;
* virtualization;
* built-in drag/drop;
* checkbox dropdowns;
* Bootstrap JavaScript;
* automatic DOM observation by default;
* a built-in clear button;
* a second positioning implementation.

The goal is not to become another all-purpose Select2 clone. The library should stay small enough that native controls and browser APIs remain visible underneath it.

## Custom element registration

Registration is explicit:

```js
import { defineCombobox } from "@lekoala/combobox";

defineCombobox();
```

Calling `defineCombobox()` more than once is safe.

You can also build your own element name:

```js
import { ComboBoxElement } from "@lekoala/combobox";

customElements.define(
  "app-combobox",
  class extends ComboBoxElement {},
);
```

`<combo-box>` uses no Shadow DOM and does not become the form control itself.

## Development

The source is pure ESM and has no runtime dependencies.

```bash
bun install
bunx playwright install chromium firefox webkit

bun run check
bun run test:browser
bun run sync
bun run verify
```

A few useful commands:

```text
bun run check
    lint + typecheck + unit tests

bun run test:browser
    browser behavior tests against the ESM source

bun run sync
    regenerate dist JS/CSS, declarations and custom-elements.json

bun run verify
    run the full consistency/package checks

bun run check:all
bun run test:browser:all
    include Firefox and WebKit
```

Generated distribution files are committed so the demo, package contents and published artifacts can be checked directly.

The package ships:

* pure ESM entry points;
* an opt-in `<combo-box>` registration entry;
* a classic self-registering build;
* CSS;
* generated TypeScript declarations;
* `custom-elements.json`.

There are no runtime source maps. Declaration maps are kept for TypeScript editor navigation.

## Documentation

More detail lives here:

* [API](docs/API.md) — options, methods, attributes and events
* [Architecture](docs/ARCHITECTURE.md) — internal model and design decisions
* [Use cases](docs/USE_CASES.md) — practical examples
* [Migration](docs/MIGRATION.md) — moving from `bootstrap5-tags` / `bootstrap5-autocomplete`
* [Testing](docs/TESTING.md) — browser and behavior coverage
* [References](docs/REFERENCES.md) — related browser and Open UI work

## Design principles

A few rules keep the library intentionally small:

1. The native control owns the value.
2. Remote results stay temporary until selected.
3. Option identity comes from the actual `<option>`, not only its string value.
4. Form behavior should remain native whenever possible.
5. The browser handles placement and top-layer behavior.
6. Rich rendering uses DOM nodes, not HTML strings.
7. Application-specific transport and UI stay application-specific.

That is most of the design.
