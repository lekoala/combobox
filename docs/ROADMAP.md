# Roadmap from POC to implementation

## Phase 0 — Freeze contracts

Before splitting/refactoring the POC:

- [ ] decide async operation guards/confirmations (`remove`, `clear`, possibly `select/create`);
- [ ] finalize dynamic `init(root, selector?)` API;
- [ ] finalize tokenizer/separator contract, including quoted terms and paste;
- [ ] distinguish `maxItems` (selected) from `maxOptions` (shown);
- [ ] decide `closeOnSelect` defaults single vs multiple;
- [ ] decide Tab selection policy;
- [ ] decide ordered-mode keyboard reorder gesture + live announcement;
- [ ] decide optional automatic MutationObserver sync vs explicit `sync()` only;
- [x] decide package name and primary element (`@lekoala/combobox`, `<combo-box>`, explicit `defineCombobox()` registration);
- [ ] decide ESM/export shape (classic global files today — see PROJECT_SETUP.md).

No major architecture change should be needed for these.

## Phase 1 — Extract pure model helpers

Extract only where tests justify the boundary:

- item normalization;
- matching/search fields/accent folding;
- result scoring/sorting;
- tokenizer;
- ordered selection model.

Add fast unit tests for these pure functions.

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

- createFilter;
- sync and async create;
- create errors/aborts;
- separators and paste batches;
- duplicate label/value behavior;
- maxItems interaction;
- fallback create parity where cheap.

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
