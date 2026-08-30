# Test plan

The test strategy is intentionally derived from two mature regression corpora:

- Tom Select: `test/tests/interaction.js`, `config-load.js`, `events.js`, `validation.js`, `xss.js`, `a11y.js`, `api.js`, `optgroups.js`.
- Select2: `tests/data/tags-tests.js`, `tokenizer-tests.js`, `maximumSelectionLength-tests.js`, `minimumInputLength-tests.js`, `maximumInputLength-tests.js`, `tests/integration/dom-changes.js`, selection/dropdown/results accessibility and focus tests, allow-clear and keyboard tests.

We should copy **coverage ideas**, not their implementation architecture or test code.

## Test levels

### Browser tests — primary

Use Playwright against real browsers. Required for:

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

- [ ] valid `input[list]`, select single, select multiple initialize.
- [ ] invalid element or input without datalist fails clearly.
- [ ] `init()` is idempotent.
- [ ] `getInstance/getOrCreateInstance` return stable instance.
- [ ] explicit sibling filter input is reused, unhidden, unnamed, and restored on dispose.
- [ ] generated filter input is removed on dispose.
- [ ] datalist is detached in enhanced mode and exactly restored on dispose.
- [ ] source tabindex/aria/classes restored on dispose.
- [ ] repeated init/dispose does not duplicate listeners/DOM.
- [x] dynamic fragment initialization works with final scoped-init API (`init(root, selector)`, `init(root | [element, …])`, idempotence without reconfiguration).

Reference lesson: Select2 DOM-integration suite exercises source mutation and update behavior; Tom Select interaction tests verify label focus and original option identity.

## B. Progressive fallback

Run on every browser with fallback forced even when modern APIs exist.

- [ ] input+datalist remains native and named.
- [ ] single select remains native.
- [ ] multiple select remains native.
- [ ] no `.cb-popover` custom picker is created.
- [ ] creatable select gets unnamed fallback input and Add button only.
- [ ] fallback create selects existing option rather than duplicating it.
- [ ] fallback create can materialize async `{value,label}` if we retain async support there.
- [ ] fallback create respects createFilter/maxItems.
- [ ] fallback `dispose()` removes only fallback enhancement.

## C. Open / close / pointer lifecycle

- [ ] focus opens expected picker.
- [ ] clicking the control does not immediately close it (regression for the original auto-popover race).
- [ ] outside pointer closes.
- [ ] pointer inside listbox does not close before selection.
- [ ] Escape closes.
- [ ] opening a second combobox closes the first unless beforeclose cancels.
- [ ] beforeopen/beforeclose cancellation works.
- [ ] single closes after select by default; multiple default policy tested once decided.
- [ ] no open/close event duplication.

Tom Select interaction tests explicitly cover close-after-select variants, Escape, reopen-after-close and keeping focus while interacting with dropdown content.

## D. Keyboard picker navigation

- [ ] Arrow Down opens and activates first enabled result.
- [ ] Arrow Down/Up walks enabled results and skips disabled options/groups.
- [ ] `aria-activedescendant` follows active result.
- [ ] active descendant is removed on close/no active item.
- [ ] Enter selects active result.
- [ ] Enter create behavior only runs when eligible.
- [ ] Escape closes without corrupting source value.
- [ ] Home/End behavior decided/tested if implemented.
- [x] Tab behavior explicitly tested once policy is fixed (`tabSelect` option; default native traversal, opt-in commit, IME-safe).
- [ ] label click focuses enhanced input.

Select2 search-a11y tests are particularly useful for `aria-activedescendant` and `aria-controls` lifecycle; Tom Select tests cover arrows through optgroups.

## E. Multiple chip keyboard navigation

- [ ] Arrow Left from empty search focuses last chip.
- [ ] Left/Right navigate chips.
- [ ] Right from last returns search input.
- [ ] Home/End first/last.
- [ ] Delete/Backspace removes focused removable chip.
- [ ] disabled/read-only chip cannot be removed.
- [ ] focus lands predictably after removal.
- [ ] normal Left/Right editing inside non-empty search is untouched.

We explicitly do **not** test or implement Tom Select's virtual caret-between-items behavior.

## F. Native source/value integrity

- [ ] selecting local result updates original option, does not recreate it.
- [ ] single reselect of current value does not fire false native value events.
- [ ] multiple select updates only intended options.
- [ ] duplicate labels with distinct values select correct identity.
- [ ] disabled option cannot select.
- [ ] disabled optgroup child cannot select.
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
- [ ] score ordering stable for equal scores.
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

- [ ] minChars prevents load.
- [ ] `shouldLoad` prevents load (partial-date guard case).
- [ ] debounce coalesces quick input.
- [ ] new query aborts old request before it can win race.
- [ ] stale query cannot render after newer query.
- [ ] loading state appears without flashing no-results.
- [ ] load receives live source/input/application-readable state.
- [ ] array result works.
- [ ] `{items,cursor}` result works.
- [ ] loadMore passes cursor and appends transient results.
- [ ] load error leaves selection intact and emits loaderror.
- [ ] aborted load does not emit loaderror.
- [ ] clearing query drops stale remote result store as designed.

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

- [ ] default source order remains source-like.
- [ ] `selectionOrder:"selected"` records selection sequence.
- [ ] source option DOM order does not change merely because selection order changes.
- [ ] result sorting does not change selection order.
- [ ] `move(value,index)` updates chips/order and emits reorder only.
- [ ] before reorder cancellation.
- [ ] remove then re-add gives defined position.
- [ ] external DOM selected option is reconciled predictably by sync.
- [ ] FormData repeated entries follow explicit ordered mode.
- [ ] keyboard reorder behavior and live announcement once finalized.

Tom Select has a regression test that physically reorders selected options; our test should deliberately prove we **do not need to** mutate catalogue order.

## O. Optgroups

- [ ] headers appear only when group has visible results.
- [ ] disabled optgroup makes descendants unselectable.
- [ ] filtering removes empty headers.
- [ ] remote group values render without requiring native optgroups until selected.
- [ ] group renderer is safe.

## P. DOM sync / dynamic updates

- [ ] add unselected native option → selection unchanged.
- [ ] add selected native option → enhanced selection updates.
- [ ] remove unselected option → selection unchanged.
- [ ] remove selected option → selection updates according to native browser behavior.
- [ ] replace many options → one batched UI refresh if MutationObserver is implemented.
- [ ] update disabled/required/read-only after init → refresh/sync reflects it.
- [ ] syncing while search focused preserves focus/query unless contract says otherwise.

These mirror concrete Select2 `tests/integration/dom-changes.js` cases.

## Q. Forms / validation

- [ ] required empty single invalid.
- [ ] selecting real option makes required valid.
- [ ] clearing makes it invalid again.
- [ ] form `checkValidity()` tracks source, not generated input fiction.
- [ ] invalid directs focus to interaction input.
- [ ] form reset restores initial selections/input value/chips.
- [ ] source input `pattern` remains authoritative for free-form mode.
- [ ] FormData contains source `name` once/multiple as expected.
- [ ] generated search inputs never appear in FormData.
- [ ] ordered mode serializes intended order.

Tom Select validation tests cover required state transitions and input pattern validation.

## R. Accessibility state

Automated browser assertions:

- [ ] combobox role on focus input.
- [ ] listbox/option semantics.
- [ ] aria-expanded toggles exactly with picker state.
- [ ] aria-controls lifecycle is valid.
- [ ] aria-activedescendant references existing active option and is removed when closed.
- [ ] accessible name comes from label/aria-label.
- [ ] aria-describedby propagated.
- [ ] required/invalid/disabled state represented.
- [ ] status live region announces loading/no-results and selected/removal/reorder where necessary.

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

Tom Select has a dedicated XSS suite for original values, group labels, option labels/values and custom templates; match that coverage at minimum.

## T. Layout/browser regressions

- [ ] picker anchors to whole control, not residual inline input width after chips.
- [ ] picker flips when viewport lacks block-end space.
- [ ] input group/floating label/table/modal/overflow containers do not clip picker.
- [ ] no global scroll/resize positioning listeners.
- [ ] long no-results/loading state has no horizontal scrollbar.
- [ ] multiple chips wrap/grow without changing picker anchor width incorrectly.
- [ ] RTL logical placement/text.
- [ ] zoom and forced-colors.

These cover multiple historical issues from both existing libraries that should disappear with top-layer + Anchor rather than become special cases.

## U. Performance sanity

No virtualization target, but avoid pathological work:

- [ ] init dozens of controls without repeated layout reads.
- [ ] 4k local options: one source mutation batch should not produce thousands of refreshes.
- [ ] filtering avoids unnecessary DOM reconstruction when future profiling justifies optimization.
- [ ] remote searches do not grow native select catalogue indefinitely.

Select2 has a DOM-change regression using 4000 options and asserts one selection update; use it as a batching sanity reference, not a virtualization requirement.

---

# Starter release gate

Before calling the implementation “v1-ready”, all P0 cases above must be automated except the explicitly manual AT matrix. At minimum run current Chromium, Firefox and WebKit in CI, and always run forced-fallback tests as a separate path.
