# Changelog

All notable changes to `@lekoala/combobox` are documented here.

The changelog highlights user-facing changes rather than listing every build, dependency, or test commit. Versions and dates follow the GitHub releases.

## [0.8.0] - 2026-10-26

### Added

- One documented creation pipeline shared by the enhanced picker, the native fallback and separator tokens, with the resolution rule "existing option first".
- A transition catalogue in `TESTING.md` and a state-ownership section in `ARCHITECTURE.md` covering authority, validity epochs and rebuild/dispose boundaries.

### Changed

- Selecting an already-selected match is now an idempotent creation success: the typed text is consumed, no value event or `combobox:select` fires, and `maxItems` no longer turns it into a refusal. `guards.add` still runs for brand-new items only.
- Rebuilding an instance from `<combo-box>` configuration keeps native selection, option identity and explicit selection order, and abandons only transient state (query, remote results, pending creation, open picker).
- Pending `whenReady()` promises reject with `AbortError` on public `dispose()`; a rebuild never rejects them.
- The native fallback selects an existing match through the shared commit path, clearing `aria-invalid` and emitting `combobox:select` consistently with the enhanced picker.
- The engine no longer writes `data-active-option` on source options. Use `.cb-option[data-active]` or `aria-activedescendant`; `data-filtered` remains the only option-level state mirror.

### Fixed

- An effective `form.reset()` now invalidates pending search, creation, removal and clear operations even when it restores the same native selection; a cancelled reset invalidates nothing.
- A superseded asynchronous creation can no longer overwrite a newer edit, selection or reset, and a disposed instance emits no late `guarderror`, `createerror` or `select`.

## [0.7.3] - 2026-10-24

### Fixed

- Preserved `selectionOrder: "selected"` by exact option identity when `<combo-box>` rebuilds after configuration or observed-attribute changes.
- Resolved a multiple select's current `name` and owner form when `FormData` is constructed, so ordered submission also works when either is assigned after initialization.
- Cancelled pending picker-opening intents on `hide()` even before the picker opens, and after external Popover closure; native closes now also clear the tracked open instance.
- Kept all input navigation and editing keys native during IME composition, preventing active-row movement, chip focus handoff and Backspace removal while composing.
- Re-resolved labels, `aria-label`, `aria-labelledby` and `aria-describedby` from the native source during `refresh()` and observed source updates.
- Followed late owner-form changes for `form.reset()`, and kept transient results intact when `observeSource` sees an accessible-name-only change.
- Passed the native fallback Add input to `remove` and `clear` guards, exposed `null` when fallback has no interaction input, consumed Backspace when it removes a chip, and preserved distinct same-label `<optgroup>` identities and disabled states across `setOptions()`.

### Documentation

- Documented which interaction state survives declarative rebuilds and warned that unrestricted user-authored `match: "pattern"` expressions can cause unbounded JavaScript regular-expression execution.

## [0.7.2] - 2026-10-23

### Fixed

- Discarded stale asynchronous creation intents after newer input or selection, disposal, or a readonly/disabled transition, in both the enhanced picker and native Add fallback. Pending guards cannot start an obsolete creation; stale results cannot clear newer text or mutate native selection.
- Rechecked native matches after asynchronous creation to avoid duplicate options when an equivalent option appears during the request. Repeated creation requests share the pending operation.
- Kept generated controls responsive to ancestor `fieldset[disabled]` changes instead of freezing inherited disabled state, and respected readonly controls across user interaction paths.
- Extended `observeSource` to ancestor fieldset state and kept input/datalist query state synchronized after programmatic value changes.
- Prevented late remote responses from reopening a closed picker or replacing newer results after a cancelled search; loading/error rows no longer expose stale selectable results.
- Disposed an existing instance before constructing its replacement, preserving authored state and cleanup ownership.
- Revalidated guarded removal and clearing against concurrent selection changes, and aligned `move()` with reconciled selection order and native fallback submission order.
- Aligned fallback selection events and limits with the enhanced picker.

## [0.7.1] - 2026-10-18

### Fixed

- Kept equal spacing around chip remove-button backgrounds inside the chip border. Added `--cb-chip-remove-size` and `--cb-chip-remove-inset` for host badge geometry, and extended the invisible click target to at least 24 × 24px without enlarging the visible background.

## [0.7.0] - 2026-10-17

### Added

- Added `chipClass`, the `chip-class` attribute and `Combobox.setDefaultChipClass()` to style chips with application classes. Author classes supply the chip skin while the library preserves layout, removal and keyboard focus styling; empty or nullish classes use the default skin.
- Added migration guides for [Tom Select](docs/MIGRATION_FROM_TOM_SELECT.md) and [Select2](docs/MIGRATION_FROM_SELECT2.md).
- Added `combobox:tokenerror` to report unexpected token-processing errors without blocking subsequent input batches.

### Changed

- `splitTokens()` now includes empty segments in `done` so separator offsets stay exact. Direct consumers that only need nonempty tokens should filter entries with `text.trim()`.

### Fixed

- Prevented `createOnBlur` from creating text or losing chip focus during internal interactions, including when the picker is closed.
- Cleared async creation loading rows on refusal, rejection, invalid results and selection vetoes, preserving input text and native selection without reopening a closed picker.
- Preserved exact unprocessed token text around empty separator segments and queued Enter commits. Custom tokenizers now retain the original batch on partial refusal and keep their declared `rest` after successful Enter, Tab or blur commits.
- Made `dispose()` idempotent so stale references cannot unregister or restore over newer instances. Pending async work and disposed rendering methods no longer mutate restored native state; untouched author-supplied option markers are preserved.
- Invalidated stale pagination cursors and responses when results are cleared or queries change. `loadMore()` now returns `false` for cancelled, failed or superseded loads.
- Respected `search(..., { show: false })` during remote loading and completion.
- Dispatched native `input` then `change` when `move()` changes the submitted value sequence, without emitting native value events for vetoes, no-ops or moves between equal values.
- Restored native default selection order on `form.reset()`, including ordered chips and submission, without rewriting the catalogue or emitting value events. Cancelled resets preserve the current state.
- Kept the fallback creation input accessibly named when its placeholder is empty.
- Improved token resolution for multiple selects: prefer enabled, unselected matching options; treat an already-selected match as idempotent; do not create duplicates when only disabled matches exist.
- Refactored built-in matching to prepare queries once per filtering pass and ignore inherited properties when resolving `searchFields`.
- Reduced unnecessary native-option marker writes when updating the active or filtered option.

## [0.6.0] - 2026-10-12

### Added

- Added `readonly` support for select-based comboboxes. The source attribute locks user interaction (opening, keyboard changes, chip removal and toggling) while leaving programmatic `select()`, `remove()` and `clear()` available.

### Fixed

- Avoided reentrant search handling when native `input` and `change` events are dispatched from an input-backed combobox.
- Improved native form-validation focus handling so a combobox does not steal focus from an earlier invalid field.
- Fixed locale-related handling and input/datalist edge cases.

## [0.5.0] - 2026-09-15

### Changed

- Refreshed the default neutral theme, including control borders, focus rings, active/selected rows, chip colors and alignment with other form controls.
- Added a lightweight, CSS-only trailing caret for select-based single and multiple comboboxes. It follows the inline-end edge, supports RTL and flips when the picker opens; input/datalist autocomplete has no caret.
- Simplified picker positioning: `coordinateSpace` now defaults to `"viewport"` (`position: fixed`), with explicit `"document"` opt-in instead of automatic layout detection.

### Documentation

- Added a side-by-side visual demo with `@lekoala/date-picker` and expanded positioning examples.

## [0.4.0] - 2026-09-14

### Added

- Added `toggleSelected` / `toggle-selected` for multiple selects: selected rows can remain visible and be deselected with Enter or click through the usual guarded removal path.
- Added `coordinateSpace` (`auto`, `document`, `viewport`) to choose popup positioning for document-flow, sticky/fixed and modal/popover contexts.
- Added richer, tested demo recipes for service options, directory search, place search and positioning modes.

### Fixed

- Unified selection and creation around cancellable `combobox:beforeselect`, avoiding native mutations when a selection is vetoed.
- Preserved native `<option>` identity, metadata and reset defaults when replacing the catalogue with `setOptions()`.
- Improved sequential async token creation: serialize batches, recheck `maxItems` and preserve refused tokens plus the remaining input text.
- Made chip removal preserve picker visibility and avoid unnecessary filtering or remote requests.
- Fixed selection-order submission so rewriting the select's values does not overwrite contributions from other controls sharing the same name.
- Improved handling of option `label`/`title`, disabled entries, focus, teardown and pending async operations.

### Changed

- Programmatic `remove()` and `clear()` now reject on a thrown guard error; voluntary refusals still resolve `false`.

## [0.3.0] - 2026-09-09

### Added

- Added a minified all-in-one standalone build (`@lekoala/combobox/standalone`) that registers the custom element and injects its CSS once, with CSP nonce forwarding.
- Published the demos through GitHub Pages and added a standalone distribution smoke test.
- Improved accessible grouped results with labelled `role="group"` containers inside the listbox.

### Fixed

- Improved Enter-to-commit behavior for eligible tokens while preserving native form submission when no commit is possible.
- Improved form reset, input/datalist preservation and the teardown/rebuild contract for `<combo-box>`.

### Documentation

- Clarified ESM versus classic-script versus standalone usage, CSS loading, browser fallback requirements and browser autofill limitations.

## [0.2.1] - 2026-09-03

### Fixed

- Aligned native-fallback item creation with the enhanced picker, including existing-option matching and the shared guard/create pipeline.

### Changed

- Extracted source and results handling into dedicated modules, with updated generated types and API documentation.

## [0.2.0] - 2026-09-03

### Changed

- Replaced CSS Anchor Positioning with `@lekoala/floating` for popup placement and automatic repositioning (flip/shift and viewport updates).
- Reduced the enhanced-mode browser requirements to the Popover API; native controls remain usable as fallback.

### Fixed

- Refined focus and clear-control styling.

## [0.1.0] - 2026-09-01

### Added

- Initial native-first combobox supporting `<input>`/`<datalist>`, single and multiple `<select>`, and the opt-in `<combo-box>` custom element.
- Search modes (`includes`, `startswith`, `fuzzy`, `pattern`), configurable search fields, remote suggestions and option creation.
- Multiple-selection chips, guarded selection/removal, token separators, selection ordering and keyboard/ARIA interactions.
- Native form values, validation, `input`/`change`, reset and progressive fallback, without a separate JavaScript form model.
- ESM and classic browser builds, styling hooks, documentation, demos and browser tests.

[Unreleased]: https://github.com/lekoala/combobox/compare/0.7.2...master
[0.7.2]: https://github.com/lekoala/combobox/compare/0.7.1...0.7.2
[0.7.1]: https://github.com/lekoala/combobox/compare/0.7.0...0.7.1
[0.7.0]: https://github.com/lekoala/combobox/compare/0.6.0...0.7.0
[0.6.0]: https://github.com/lekoala/combobox/compare/0.5.0...0.6.0
[0.5.0]: https://github.com/lekoala/combobox/compare/0.4.0...0.5.0
[0.4.0]: https://github.com/lekoala/combobox/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/lekoala/combobox/compare/0.2.1...0.3.0
[0.2.1]: https://github.com/lekoala/combobox/compare/0.2.0...0.2.1
[0.2.0]: https://github.com/lekoala/combobox/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/lekoala/combobox/releases/tag/0.1.0
