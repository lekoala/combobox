# Design references

## Platform direction

- Open UI Combobox explainer: https://open-ui.org/components/combobox.explainer/
- Open UI Filterable Select explainer: https://open-ui.org/components/filterable-select.explainer/
- Popover API: https://developer.mozilla.org/en-US/docs/Web/API/Popover_API
- CSS Anchor Positioning: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_anchor_positioning
- ARIA combobox pattern: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- Custom Elements: https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements
- DOM `handleEvent` / EventListener pattern: https://webreflection.medium.com/dom-handleevent-a-cross-platform-standard-since-year-2000-5bf17287fd38

The library follows the concepts and progressive direction, not unstable experimental syntax verbatim.

## Functional references

### Tom Select

Repository: https://github.com/orchidjs/tom-select

Particularly useful test files reviewed:

- `test/tests/interaction.js` — focus/open/close, keyboard, selection, no-results, original option identity, selection ordering cases.
- `test/tests/config-load.js` — loading lifecycle, query churn, no-results/loading state.
- `test/tests/events.js` — event counts/order, native input/change behavior, disabled options.
- `test/tests/validation.js` — required select and input pattern validity.
- `test/tests/xss.js` — source/item/group/template injection cases.
- `test/tests/a11y.js`, `api.js`, `optgroups.js` — broader release coverage to revisit during implementation.

### Select2

Repository: https://github.com/select2/select2

Particularly useful test files reviewed:

- `tests/data/tags-tests.js` — blank/trim behavior, duplicate matching, tag creation/injection/cleanup.
- `tests/data/tokenizer-tests.js` — separators, multiple tokens, createTag returning null, quoted separator cases.
- `tests/integration/dom-changes.js` — selected/unselected option mutations, focus preservation, batching thousands of option updates.
- `tests/selection/search-a11y-tests.js` — aria-activedescendant and aria-controls lifecycle.
- other suites worth mining during implementation: maximum/minimum input/selection length, allowClear, focusing, openOnKeyDown, results accessibility, infiniteScroll (contract ideas only; virtualization itself is not a goal).

## Prior art and regression sources

- https://github.com/lekoala/bootstrap5-tags
- https://github.com/lekoala/bootstrap5-autocomplete

These projects and their issue histories informed the initial use-case and regression matrix (`docs/MIGRATION.md`, `docs/TESTING.md`). They do not define Combobox's public API.
