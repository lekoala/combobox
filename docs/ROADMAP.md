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
- matching/search fields/accent folding; ✅ done (`normalize`; fuzzy subsequence matching added in `match: "fuzzy"`)
- result scoring/sorting; ✅ done (`rankByScore` — descending score, `false`/`null` exclusion, `0` valid, tie-stable by input index; custom `sort` stays a comparator passthrough with no internal behavior to encapsulate)
- tokenizer; ✅ done (`splitTokens`/`parseSeparators` + `tokenize` seam)
- ordered selection model; ✅ done (`reconcileSelected` for order ∩ selection + native-order unknowns; `moveValueInOrder` for pure clamped reordering)

Add fast unit tests for these pure functions. ✅ `test/unit/helpers.test.js` (`bun run test:unit`): scoring/sorting and order helpers covered.

## Phase 1.5 — Modernize the foundation

Full ESM source with zero globals; behavioral suite stays on the source, the bundle gets smoke tests only.

- ✅ `src/` converted to pure ESM named exports (`helpers.js`, `combobox.js`, `combo-box.js`); all `window.*`/helper-fallback scaffolding removed (`index.js` is a pure barrel, `define.js` is the single side-effect entry).
- ✅ generated classic build `dist/combobox.js` from `src/define.js` via `bun run build` (`--format=iife`); all generated artifacts (`dist/`, `custom-elements.json`) are committed and drift-checked; `exports` maps `.`, `./define`, `./combobox.css`.
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
- [x] duplicate label/value behavior (option identity is authoritative: the `HTMLOptionElement` is the identity, `option.value` is serialized payload — three `<option value="2">` are three choices; `#selectItem`/`remove`/`move`/chips key on the exact option);
- [x] maxItems interaction (never mutilates pre-existing init state);
- [x] fallback create parity (`guards.add` + `beforecreate` on the Add input);
- [x] async guards edge review (guards `add`/`remove`/`clear` rejections from user-facing and programmatic paths surface `combobox:guarderror` with zero unhandled rejections; browser coverage in `features.spec.js` + fallback parity in `combobox-element.spec.js`).

## Phase 6 — Ordered multiple selection

- [x] explicit source/result/selection order tests (browser `order.spec.js` + unit `reconcileSelected`/`moveValueInOrder`);
- [x] `move()` (model operation with `combobox:beforereorder`/`combobox:reorder`, catalogue never mutated, no-op/edge semantics tested);
- [x] ordered chips (`#selectedOptionsInOrder()` reconciles remembered order with native selection);
- [x] ordered FormData (`formdata` listener serializes repeated entries in explicit order when `selectionOrder: "selected"`; native order otherwise);
- [x] keyboard reorder + announcement (`Alt+ArrowLeft/Right`, `Alt+Home/End` on a focused chip, focus kept, `messages.position` live announcement; RTL covered);
- [x] external reorder UI example (demo section 5), no built-in drag/drop.

## Phase 7 — Security/accessibility/browser matrix

- [x] XSS fixture suite (`test/browser/xss.spec.js` + `test/fixtures/xss.html`): hostile labels/values/optgroup/data/remote items/create/messages render as literal text, no execution, no attribute breakout, renderer Node path safe);
- [x] axe/static ARIA checks plus manual AT checklist (`test/browser/aria.spec.js` covers roles, `aria-expanded`, `aria-controls`, `aria-activedescendant` lifecycle, `aria-multiselectable`, `aria-disabled`, status live region; manual AT matrix documented in `TESTING.md` — select/remove intentionally not announced, documented decision);
- [x] Chromium/Firefox/WebKit current versions (Playwright projects; `check` stays Chromium-only for local speed, `test:browser:all`/`check:all` run the full matrix);
- [x] touch/IME/composition (IME already covered; Chromium-only `test/browser/touch.spec.js` for tap open/select/close/remove/outside; engine is Touch-safe by construction — pointer events);
- [x] forced-colors/high contrast (`visual.spec.js` proves rows/chips distinguishable, engine-skips engines without the media query);
- [x] zoom and reduced motion where relevant (`visual.spec.js`: zero transition/animation honoured under reduced-motion; 200% zoom keeps the picker anchored and contained);
- [x] fallback forced in every engine (`matrix.spec.js` proves auto enhanced/fallback per engine and identical forced-fallback contract on Chromium/Firefox/WebKit).

## Phase 8 — Package/release

- [x] v0.1.0 publishable shape: `version 0.1.0`, `private` removed, `files` (`dist`/`src`/`custom-elements.json`/`LICENSE`/`README`), `prepack` builds dist, `prepublishOnly` runs lint + typecheck + unit + build + types + package contract;
- [x] CI split — `quality` (static chain incl. typecheck/types/consumer/package/drift) on every push/PR, `browser` matrix Chromium/Firefox/WebKit with `test:dist` under Chromium (`.github/workflows/ci.yml`);
- [x] declarative surface frozen: the JS API and `<combo-box>` attributes are the two configuration surfaces — booleans honor `="false"`, `tab-select`/`search-fields` added, `data-*` on the source dropped (item `data-*` stays metadata), `init()` discovery explicit;
- [x] generated `.d.ts` from JSDoc (`strict` checkJs + `tsconfig.types.json` → `dist/types`, consumed-locked by `test/types/consumer.ts`);
- [x] no transpilation — ESM + generated classic `dist/combobox.js` only;
- [x] committed artifacts: `dist/` (minified + unminified JS/CSS) and `custom-elements.json` versioned, drift-enforced by `check:generated`;
- [x] migration guide for users of previous packages shipped as a standalone document (`docs/MIGRATION.md`, incl. the demo migration tour) — not a v1 blocker.
