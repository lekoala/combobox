# Roadmap from POC to implementation

## Phase 0 — Freeze contracts

Before splitting/refactoring the POC:

- [x] decide async operation guards/confirmations (`guards: { add, remove, clear }`; `false` refuses, rejections surface as `combobox:guarderror`);
- [ ] finalize dynamic `init(root, selector?)` API;
- [x] finalize tokenizer/separator contract (`separators` full-string pipe-delimited, sequential token consumption, optional `tokenize` seam);
- [x] distinguish `maxItems` (selected) from `maxOptions` (shown — rendering cap only);
- [x] decide `closeOnSelect` defaults single vs multiple (single closes, multiple stays open);
- [ ] decide Tab selection policy;
- [ ] decide ordered-mode keyboard reorder gesture + live announcement;
- [ ] decide optional automatic MutationObserver sync vs explicit `sync()` only;
- [x] decide package name and primary element (`@lekoala/combobox`, `<combo-box>`, explicit `defineCombobox()` registration);
- [ ] decide ESM/export shape (classic global files today — see PROJECT_SETUP.md).

No major architecture change should be needed for these.

## Phase 1 — Extract pure model helpers

Extract only where tests justify the boundary:

- item normalization; ✅ done in `src/helpers.js`
- matching/search fields/accent folding; ✅ done (`normalize`)
- result scoring/sorting;
- tokenizer; ✅ done (`splitTokens`/`parseSeparators` + `tokenize` seam)
- ordered selection model.

Add fast unit tests for these pure functions. ✅ `test/unit/helpers.test.js` (`bun run test:unit`); order helpers still pending extraction.

## Phase 2 — Harden native source adapters

- input+datalist detach/restore;
- select single/multiple source mapping;
- optgroup/disabled propagation;
- required/invalid/reset;
- label/description accessibility transfer;
- external `sync()`;
- source mutations while focused.

## Phase 3 — Picker + keyboard

- manual popover lifecycle;
- outside click without races;
- active option state;
- arrow/home/end/page behavior as chosen;
- Enter/Escape/Tab policy;
- chip navigation/removal;
- focus stability through filtering and DOM updates;
- RTL.

## Phase 4 — Remote/result store

- debounce + abort race tests;
- transient results separate from catalogue;
- select remote result materialization;
- loading/error/no-results;
- dependent field loader examples;
- cursor/loadMore contract;
- no automatic virtual scrolling.

## Phase 5 — Creation/tokenization

- [x] createFilter;
- [x] sync and async create;
- [x] create errors/aborts;
- [x] separators and paste batches (sequential, `maxItems` re-evaluated between tokens);
- [x] duplicate label/value behavior (value identity is authoritative, `#selectItem` resolves by value);
- [x] maxItems interaction (never mutilates pre-existing init state);
- [x] fallback create parity (`guards.add` + `beforecreate` on the Add input);
- [ ] async guards edge review (unhandled rejections from user-facing paths are already event-surfaced).

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
