# Roadmap from POC to implementation

## Phase 0 — Freeze contracts

Before splitting/refactoring the POC:

- [x] decide async operation guards/confirmations (`guards: { add, remove, clear }`; `false` refuses, rejections surface as `combobox:guarderror`);
- [x] finalize dynamic `init(root, selector?)` API — type-dispatched overloads, discovery/creation only, idempotent (`init("selector")`, `init(root, "selector")`, `init(root | [element, …])`); implemented;
- [x] finalize tokenizer/separator contract (`separators` full-string pipe-delimited, sequential token consumption, optional `tokenize` seam);
- [x] distinguish `maxItems` (selected) from `maxOptions` (shown — rendering cap only);
- [x] decide `closeOnSelect` defaults single vs multiple (single closes, multiple stays open);
- [x] decide Tab selection policy — JS option `tabSelect` (default `false`; when enabled Tab commits like Enter, and only ever `preventDefault()`s when a commit is actually possible); implemented;
- [x] decide ordered-mode keyboard reorder gesture + live announcement — `Alt+ArrowLeft/Right` moves a focused chip, `Alt+Home/End` jumps to first/last, status region announces position; implementation lands in Phase 6;
- [x] decide optional automatic MutationObserver sync — opt-in `observeSource` (default `false`), debounced single `sync()`, component mutations suppressed; implemented in Phase 2;
- [x] decide package name and primary element (`@lekoala/combobox`, `<combo-box>`, explicit `defineCombobox()` registration);
- [x] decide ESM/export shape — ESM entry + default export, `./combobox.css` subpath, `./define` side-effect entry, zero globals, generated classic build; base landed in Phase 1.5, release polish (minification/types) stays in Phase 8.

No major architecture change should be needed for these.

## Phase 1 — Extract pure model helpers

Extract only where tests justify the boundary:

- item normalization; ✅ done in `src/helpers.js`
- matching/search fields/accent folding; ✅ done (`normalize`)
- result scoring/sorting; ✅ done (`rankByScore` — descending score, `false`/`null` exclusion, `0` valid, tie-stable by input index; custom `sort` stays a comparator passthrough with no internal behavior to encapsulate)
- tokenizer; ✅ done (`splitTokens`/`parseSeparators` + `tokenize` seam)
- ordered selection model; ✅ done (`reconcileSelected` for order ∩ selection + native-order unknowns; `moveValueInOrder` for pure clamped reordering)

Add fast unit tests for these pure functions. ✅ `test/unit/helpers.test.js` (`bun run test:unit`): scoring/sorting and order helpers covered.

## Phase 1.5 — Modernize the foundation

Full ESM source with zero globals; behavioral suite stays on the source, the bundle gets smoke tests only.

- ✅ `src/` converted to pure ESM named exports (`helpers.js`, `combobox.js`, `combo-box.js`); all `window.*`/helper-fallback scaffolding removed (`index.js` is a pure barrel, `define.js` is the single side-effect entry).
- ✅ generated classic build `dist/combobox.js` from `src/define.js` via `bun run build` (`--format=iife`), gitignored; `exports` maps `.`, `./define`, `./combobox.css`.
- ✅ unit tests import `src/helpers.js` directly (no `vm.runInNewContext`).
- ✅ persistent listeners routed through `handleEvent`; listbox/chips/control fully delegated so renderers add zero listeners; options are non-focusable `div[role=option]`.
- ✅ upgrade/dispose symmetry enforced with a `captureAttributes(...).restore()` snapshot on every non-owned element (filter input, source input/select) plus invented `<label>` id cleanup.
- ✅ custom `tokenize` seam frozen to `{ tokens, rest }` with a leftover-`rest` browser test.
- ✅ demo always loads generated `dist/combobox.js` (validates the distributable over http(s) and `file://`); browser suite hits ESM, `test/dist` smoke-tests the bundle (incl. a `file://` page).
- ✅ docs aligned (README, PROJECT_SETUP, API, USE_CASES, CONTRIBUTING, AGENTS, ROADMAP).

## Phase 2 — Harden native source adapters

- [x] input+datalist detach/restore (imperative + wrapper dispose, idempotent dispose, clear TypeError for a datalist-less input);
- [x] select single/multiple source mapping (explicit filter input reuse/unnaming/restore, generated filter removed on dispose, single label sync);
- [x] optgroup/disabled propagation (disabled option and disabled optgroup unselectable by mouse and keyboard, headers only for visible groups, filter removes empty headers);
- [x] required/invalid/reset (native `checkValidity()`, `invalid` focus + `aria-invalid`, form reset restores label/value/chips, disabled/readonly reflected by refresh/sync);
- [x] label/description accessibility transfer (for-label, wrapped label, `aria-label` fallback, `aria-describedby`, invented ids stripped on dispose, label click focuses the filter);
- [x] external `sync()` (add/remove options, transient-results purge, ordered reconciliation, source state attributes);
- [x] source mutations while focused (opt-in `observeSource`: one debounced `sync()` per batch, engine mutations suppressed, focus/query preserved, detached datalist observed).

## Phase 3 — Picker + keyboard

- [x] manual popover lifecycle (`popover="manual"` + Anchor Positioning, `show/hide/isOpen`, single open instance, `combobox:beforeopen/open/beforeclose/close`, popover removed on `dispose()`, canceled before-events never flip state);
- [x] outside click without races (capture `pointerdown` hides, blur-microtask guard keeps option `pointerdown` and control-internal moves from closing);
- [x] active option state (`aria-activedescendant`, `data-active` on the row + `data-active-option` on the source option, reset on close, skipped/none never highlighted);
- [x] arrow/home/end/page behavior as chosen (wrapping arrows, Home/End first/last selectable, PageDown/PageUp step by viewport page, all opening a closed picker and skipping disabled);
- [x] Enter/Escape/Tab policy (Enter selects or creates, opt-in `tabSelect` commits and never blocks native traversal unless a commit is possible, IME never blocks/commits, Escape closes and clears the active descendant);
- [x] chip navigation/removal (ArrowLeft from empty search, chip ArrowLeft/Right/Home/End, Delete/Backspace guarded removal with focus hand-back, Escape, arrow keys physical in RTL);
- [x] focus stability through filtering and DOM updates (filtering, async load → results and chip removal never steal focus; valid `aria-activedescendant` throughout);
- [x] RTL (logical-CSS layout: chips flow right-to-left, popover flips via `position-try`; browser coverage added).

## Phase 4 — Remote/result store

- [x] debounce + abort race tests;
- [x] transient results separate from catalogue;
- [x] select remote result materialization;
- [x] loading/error/no-results (loading row, `.cb-error` state mirrors loading, no retry affordance — pagination/retry stay app-owned; coverage in `test/browser/remote.spec.js` + fixture `test/fixtures/remote.html`);
- [x] dependent field loader examples (demo section 7 + browser coverage);
- [x] cursor/loadMore contract (`{items,cursor}`, cursor passed to `load`, append-only, `maxOptions` never bypassed);
- [x] no automatic virtual scrolling.

## Phase 4.5 — Messages/i18n

- [x] flat UI-text options grouped into a `messages` object (`noResults`, `loading`, `loadError`, `create`) with deep-ish merge; `createLabel` renamed to `messages.create`; `placeholder` stays top-level (structural input state) and `render` stays the separate DOM-representation seam; browser coverage for overrides.

## Phase 5 — Creation/tokenization

- [x] createFilter;
- [x] sync and async create;
- [x] create errors/aborts;
- [x] separators and paste batches (sequential, `maxItems` re-evaluated between tokens);
- [x] duplicate label/value behavior (value identity is authoritative, `#selectItem` resolves by value);
- [x] maxItems interaction (never mutilates pre-existing init state);
- [x] fallback create parity (`guards.add` + `beforecreate` on the Add input);
- [x] async guards edge review (guards `add`/`remove`/`clear` rejections from user-facing and programmatic paths surface `combobox:guarderror` with zero unhandled rejections; browser coverage in `features.spec.js` + fallback parity in `combobox-element.spec.js`).

## Phase 6 — Ordered multiple selection

- explicit source/result/selection order tests;
- `move()`;
- ordered chips;
- ordered FormData;
- keyboard reorder + announcement;
- external reorder UI example, but no built-in drag/drop.

## Phase 7 — Security/accessibility/browser matrix

- XSS fixture suite;
- axe/static ARIA checks plus manual AT checklist;
- Chromium/Firefox/WebKit current versions;
- touch/IME/composition;
- forced-colors/high contrast;
- zoom and reduced motion where relevant;
- fallback forced in every engine.

## Phase 8 — Package/release

- ESM default export + documented direct-browser path;
- subpath CSS export if useful;
- generated `.d.ts` or JSDoc type generation;
- no transpilation unless a concrete browser floor requires it;
- minification as release artifact only;
- migration guide from both legacy packages;
- mark legacy packages maintenance-only with pointer to new library.
