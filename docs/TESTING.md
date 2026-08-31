# Test plan

The test strategy is intentionally derived from two mature regression corpora:

- Tom Select: `test/tests/interaction.js`, `config-load.js`, `events.js`, `validation.js`, `xss.js`, `a11y.js`, `api.js`, `optgroups.js`.
- Select2: `tests/data/tags-tests.js`, `tokenizer-tests.js`, `maximumSelectionLength-tests.js`, `minimumInputLength-tests.js`, `maximumInputLength-tests.js`, `tests/integration/dom-changes.js`, selection/dropdown/results accessibility and focus tests, allow-clear and keyboard tests.

We should copy **coverage ideas**, not their implementation architecture or test code.

## Test levels

### Browser tests — primary

Use Playwright against real browsers. The behavioral suite in `test/browser` targets the
**ESM source** (`src/…`) directly; the generated bundle only gets dedicted smoke tests in
`test/dist` (self-contained iife, no globals, self-registering `<combo-box>`, a `file://`
page). Tests reach the engine in the page via the harness bridge in
`test/browser/helpers.js` (`exposeEsm`), never via a library global.

Required for:

- focus/blur;
- Popover state/top layer;
- keyboard interactions;
- native form validation/reset/FormData;
- CSS Anchor behavior/layout;
- pointer/outside click;
- IME/composition;
- DOM MutationObserver if adopted;
- ARIA state timing.

### Unit tests — only pure logic

Use Bun test after extracting pure functions:

- normalize/accent folding;
- match/search fields;
- score/sort ordering;
- tokenizer;
- selection-order model.

Do not use happy-dom/jsdom as a substitute for browser interaction tests.

---

# Coverage matrix

## A. Initialization / lifecycle

- [x] valid `input[list]`, select single, select multiple initialize.
- [x] invalid element or input without datalist fails clearly.
- [x] `init()` is idempotent.
- [x] `getInstance/getOrCreateInstance` return stable instance.
- [x] explicit sibling filter input is reused, unhidden, unnamed, and restored on dispose.
- [x] generated filter input is removed on dispose.
- [x] datalist is detached in enhanced mode and exactly restored on dispose.
- [x] source tabindex/aria/classes restored on dispose.
- [x] repeated init/dispose does not duplicate listeners/DOM.
- [x] dynamic fragment initialization works with final scoped-init API (`init(root, selector)`, `init(root | [element, …])`, idempotence without reconfiguration).

Reference lesson: Select2 DOM-integration suite exercises source mutation and update behavior; Tom Select interaction tests verify label focus and original option identity.

## B. Progressive fallback

Run on every browser with fallback forced even when modern APIs exist.

Coverage: `test/browser/matrix.spec.js` (auto enhanced/fallback per engine, forced-fallback contract, native submission), `combobox-element.spec.js` (fallback create parity incl. async create/createFilter/guards/dispose) and `test/dist/smoke.spec.js` (`?native=1`).

- [x] input+datalist remains native and named (untouched fallback path).
- [x] single select remains native (untouched fallback path).
- [x] multiple select remains native.
- [x] no `.cb-popover` custom picker is created.
- [x] creatable select gets unnamed fallback input and Add button only.
- [x] fallback create selects existing option rather than duplicating it.
- [x] fallback create can materialize async `{value,label}`.
- [x] fallback create respects createFilter/maxItems.
- [x] fallback `dispose()` removes only fallback enhancement.

## C. Open / close / pointer lifecycle

- [x] focus opens expected picker.
- [x] clicking the control does not immediately close it (regression for the original auto-popover race).
- [x] outside pointer closes.
- [x] pointer inside listbox does not close before selection.
- [x] Escape closes.
- [x] opening a second combobox closes the first unless beforeclose cancels.
- [x] beforeopen/beforeclose cancellation works.
- [x] single closes after select by default; multiple default policy tested once decided.
- [x] no open/close event duplication.

Tom Select interaction tests explicitly cover close-after-select variants, Escape, reopen-after-close and keeping focus while interacting with dropdown content.

## D. Keyboard picker navigation

- [x] Arrow Down opens and activates first enabled result.
- [x] Arrow Down/Up walks enabled results and skips disabled options/groups.
- [x] `aria-activedescendant` follows active result.
- [x] active descendant is removed on close/no active item.
- [x] Enter selects active result.
- [x] Enter create behavior only runs when eligible.
- [x] Escape closes without corrupting source value.
- [x] Home/End step to first/last selectable option (disabled tails skipped).
- [x] PageDown/PageUp step by a page (viewport height ÷ row height) and clamp at the selectable edges.
- [x] all picker navigation keys open a closed picker.
- [x] Tab behavior explicitly tested once policy is fixed (`tabSelect` option; default native traversal, opt-in commit, IME-safe).
- [x] label click focuses enhanced input.

Select2 search-a11y tests are particularly useful for `aria-activedescendant` and `aria-controls` lifecycle; Tom Select tests cover arrows through optgroups.

## E. Multiple chip keyboard navigation

- [x] Arrow Left from empty search focuses last chip.
- [x] Left/Right navigate chips.
- [x] Right from last returns search input.
- [x] Home/End first/last.
- [x] Delete/Backspace removes focused removable chip.
- [ ] disabled/read-only chip cannot be removed.
- [x] focus lands predictably after removal.
- [ ] normal Left/Right editing inside non-empty search is untouched.

We explicitly do **not** test or implement Tom Select's virtual caret-between-items behavior.

## F. Native source/value integrity

- [ ] selecting local result updates original option, does not recreate it.
- [ ] single reselect of current value does not fire false native value events.
- [ ] multiple select updates only intended options.
- [ ] duplicate labels with distinct values select correct identity.
- [x] disabled option cannot select.
- [x] disabled optgroup child cannot select.
- [ ] externally-created remote result materializes one native option when selected.
- [ ] unselected remote results do not accumulate as options.
- [ ] input-backed combobox leaves arbitrary text as source value.

Tom Select has direct regression tests for preserving original option elements and disabled options; Select2's AJAX model supports the “materialize selected result, not every remote result” lesson.

## G. Native event semantics

- [ ] value change emits native `input` then `change`, once each.
- [ ] no value change emits neither.
- [ ] programmatic `select/remove/clear` follows same contract.
- [ ] custom `before*` events are cancellable.
- [ ] after events do not fire when cancelled.
- [ ] event detail contains item/query/context expected.
- [ ] create/load error events expose error without unhandled state corruption.

Tom Select's events suite specifically verifies `input` before `change`, single firing, disabled values and no event when value is unchanged.

## H. Local filtering

- [ ] empty query behavior.
- [ ] includes.
- [ ] startswith.
- [ ] accent-insensitive (`liege` matches `Liège`).
- [ ] `searchFields` supports label and extra data fields.
- [ ] custom match.
- [ ] custom filter.
- [x] score ordering stable for equal scores (pure logic in `rankByScore`, unit-tested).
- [ ] custom sort.
- [ ] invalid pattern query fails safely.
- [ ] backspacing from no-results restores options.
- [ ] no-results state is visually stable and never horizontally scrolls.
- [ ] selected multiple values are excluded from results unless future policy says otherwise.
- [ ] data-filtered mirror state correct for local source options.

## I. `beforefilter` / app-owned filtering

- [ ] event is fired before normal filtering.
- [ ] `event.query` and detail query match.
- [ ] preventDefault stops built-in load/filter.
- [ ] handler can asynchronously call `setResults().applyFilter()`.
- [ ] manual apply does not recursively fire beforefilter.
- [ ] focus remains in search input during result replacement.

This maps to the Open UI direction and also covers the focus-stability concern present in Select2 DOM-change tests.

## J. Remote loading

Coverage lives in `test/browser/remote.spec.js` (`test/fixtures/remote.html`).

- [x] minChars prevents load.
- [x] `shouldLoad` prevents load (partial-date guard case).
- [x] debounce coalesces quick input.
- [x] new query aborts old request before it can win race.
- [x] stale query cannot render after newer query (late-resolving loader that ignores the signal).
- [x] loading state appears without flashing no-results.
- [x] load receives live source/input/application-readable state (dependent-field test).
- [x] array result works.
- [x] `{items,cursor}` result works.
- [x] loadMore passes cursor and appends transient results (`maxOptions` never bypassed).
- [x] load error leaves selection intact and emits loaderror; `.cb-error` row mirrors `loading` and clears on the next load or a below-threshold local query.
- [x] aborted load does not emit loaderror/load.
- [x] clearing query drops stale remote result store as designed.
- [x] transient results stay out of the native catalogue; selecting a result materializes exactly that native option (single and multiple).

Tom Select `config-load.js` covers preload/loading/no-results and query churn; our AbortSignal design should be stricter about races.

## K. Creation / tags

- [ ] blank/whitespace does not create.
- [ ] createFilter false hides/prevents create.
- [ ] case-insensitive existing label does not accidentally duplicate when policy says existing result wins.
- [ ] same label/different existing values remain selectable as separate identities.
- [ ] `create: true` creates `{value:text,label:text}`.
- [ ] async create can return different server ID/label.
- [ ] async create abort/error behavior.
- [ ] beforecreate cancellation.
- [ ] maxItems blocks new selection/create but still allows removal.
- [ ] created item updates native select and native events.
- [ ] selected created item survives sync as expected.
- [ ] persistence/removal policy for temporary created options is explicitly decided.

Select2 tags tests cover trim/null, duplicate matching, tag insertion and cleanup; Tom Select also tests created option persistence behavior.

## L. Tokenization / paste (P0 parity)

- [ ] one separator.
- [ ] multiple separators.
- [ ] paste multiple tokens creates/selects each valid token.
- [ ] invalid token/createFilter false does not corrupt remaining term.
- [ ] duplicate token handled once according to value policy.
- [ ] maxItems stops at limit cleanly.
- [ ] custom tokenizer can preserve quoted separator text.
- [ ] composition/IME input is not tokenized mid-composition.

Select2's tokenizer suite includes the important “createTag returns null must not cut the term” and quoted-token cases.

## M. Clear / remove / guards

- [ ] clear single.
- [ ] clear multiple.
- [ ] beforeclear cancellation.
- [ ] beforeremove cancellation.
- [ ] clear does not remove disabled selections unless policy explicitly allows it.
- [ ] external clear button can call API without DOM hacks.
- [ ] async confirmation design gets dedicated tests once finalized.

## N. Selection order

- [x] default source order remains source-like (`order.spec.js` covers chips, `move()` refusal and native FormData order).
- [x] `selectionOrder:"selected"` records selection sequence (click order preserved, `order.spec.js`).
- [x] source option DOM order does not change merely because selection order changes (catalogue asserted after every reorder, `order.spec.js`).
- [x] result sorting does not change selection order (custom `sort` in `order.spec.js`).
- [x] `move(value,index)` updates chips/order and emits reorder only (`order.spec.js` covers the `{value,from,to,values}` payload and `move()` no-ops).
- [x] before reorder cancellation (`combobox:beforereorder` preventDefault pins the order, `order.spec.js`).
- [x] remove then re-add gives defined position (append-at-end, `order.spec.js`).
- [x] external DOM selected option is reconciled predictably by sync (`source-adapters.spec.js`).
- [x] FormData repeated entries follow explicit ordered mode (`order.spec.js`; native order asserted in source mode).
- [x] keyboard reorder behavior and live announcement (`Alt+Arrow/Home/End` keeps focus and announces via `messages.position`, `order.spec.js`; physical-in-RTL proof in `rtl.spec.js`).

Covered by `test/browser/order.spec.js` (fixture `test/fixtures/order.html`).

The pure order model is covered by unit tests (`reconcileSelected` — order ∩ selection, native-order append for unknowns, never resurrecting deselected values; `moveValueInOrder` — clamped from/to, fresh array, no-op/unknown → `null`). Those unit tests do **not** replace the DOM/FormData integration proof above: chips rendering, catalogue order stability and ordered FormData stay as browser tests.

Tom Select has a regression test that physically reorders selected options; our test should deliberately prove we **do not need to** mutate catalogue order.

## O. Optgroups

- [x] headers appear only when group has visible results.
- [x] disabled optgroup makes descendants unselectable.
- [x] filtering removes empty headers.
- [ ] remote group values render without requiring native optgroups until selected.
- [ ] group renderer is safe.

## P. DOM sync / dynamic updates

- [x] add unselected native option → selection unchanged.
- [x] add selected native option → enhanced selection updates.
- [x] remove unselected option → selection unchanged.
- [x] remove selected option → selection updates according to native browser behavior.
- [x] replace many options → one batched UI refresh if MutationObserver is implemented.
- [x] update disabled/required/read-only after init → refresh/sync reflects it.
- [x] syncing while search focused preserves focus/query unless contract says otherwise.

These mirror concrete Select2 `tests/integration/dom-changes.js` cases.

## Q. Forms / validation

- [x] required empty single invalid.
- [x] selecting real option makes required valid.
- [x] clearing makes it invalid again.
- [x] form `checkValidity()` tracks source, not generated input fiction.
- [x] invalid directs focus to interaction input.
- [x] form reset restores initial selections/input value/chips.
- [ ] source input `pattern` remains authoritative for free-form mode.
- [ ] FormData contains source `name` once/multiple as expected.
- [ ] generated search inputs never appear in FormData.
- [ ] ordered mode serializes intended order.

Tom Select validation tests cover required state transitions and input pattern validation.

## R. Accessibility state

Automated browser assertions (`test/browser/aria.spec.js` for the role/attribute/status coverage):

- [x] combobox role on focus input.
- [x] listbox/option semantics (listbox on `aria-controls` target, `role=option` rows, `aria-multiselectable` on multiple).
- [x] aria-expanded toggles exactly with picker state.
- [x] aria-controls lifecycle is valid.
- [x] aria-activedescendant references existing active option and is removed when closed.
- [x] accessible name comes from label/aria-label.
- [x] aria-describedby propagated.
- [x] required/invalid/disabled state represented.
- [x] status live region announces loading/no-results/reorder. **Decision:** `select`/`remove` are intentionally *not* announced — chips removal is visible and focus-managed, and announcing every token of a separator paste batch would be noise; documented API choice.

Manual AT matrix before release:

- NVDA + Firefox/Chromium;
- VoiceOver + Safari;
- TalkBack/Android if mobile support is claimed.

## S. Security / renderer safety

Inject hostile strings into:

- input initial value;
- option label/value;
- optgroup label;
- remote item label/value/data;
- create text;
- no-results/loading labels.

Verify no execution. Renderer Node paths must make unsafe application behavior explicit rather than silently trusting HTML strings.

Covered by `test/browser/xss.spec.js` (fixture `test/fixtures/xss.html`): hostile labels/values/optgroup labels/`data-*`/remote items/create text/state messages render as literal text via `textContent`, `window.__xss` + `pageerror` prove no execution, no `<script|img|svg>` nodes generated, no attribute breakout, datalist options stay literal.

Tom Select has a dedicated XSS suite for original values, group labels, option labels/values and custom templates; match that coverage at minimum.

## T. Layout/browser regressions

- [ ] picker anchors to whole control, not residual inline input width after chips.
- [ ] picker flips when viewport lacks block-end space.
- [ ] input group/floating label/table/modal/overflow containers do not clip picker.
- [ ] no global scroll/resize positioning listeners.
- [ ] long no-results/loading state has no horizontal scrollbar.
- [ ] multiple chips wrap/grow without changing picker anchor width incorrectly.
- [ ] RTL logical placement/text.
- [x] RTL: chips flow right-to-left, picker flips and has no horizontal overflow, physical keyboard navigation is stable.
- [x] reduced motion: no transition/animation runs in the picker (CSS has none; asserted under `prefers-reduced-motion: reduce` in `visual.spec.js`).
- [x] forced-colors/high contrast: picker rows and chips stay distinguishable and visible (`visual.spec.js`; engines without the `forced-colors` media query are skipped).
- [x] zoom: at 200% zoom the picker stays anchored, internally contained and within the document (`visual.spec.js`).

These cover multiple historical issues from both existing libraries that should disappear with top-layer + Anchor rather than become special cases.

## U. Performance sanity

No virtualization target, but avoid pathological work:

- [ ] init dozens of controls without repeated layout reads.
- [x] 4k local options: one source mutation batch should not produce thousands of refreshes (batching proven with the `observeSource` debounce).
- [ ] filtering avoids unnecessary DOM reconstruction when future profiling justifies optimization.
- [ ] remote searches do not grow native select catalogue indefinitely.

Select2 has a DOM-change regression using 4000 options and asserts one selection update; use it as a batching sanity reference, not a virtualization requirement.

---

# Starter release gate

Before calling the implementation “v1-ready”, all P0 cases above must be automated except the explicitly manual AT matrix. The suite runs on current Chromium, Firefox and WebKit (Playwright projects; `bun run test:browser:matrix` / `test:matrix` for the non-Chromium engines, `check` stays Chromium-only for fast local loops), and forced-fallback tests run in every engine.
