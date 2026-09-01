# Test plan

The test strategy is derived from mature combobox regression corpora and prior-art
issue histories (see REFERENCES.md). We copy **coverage ideas**, not their
implementation architecture or test code.

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

Prior-art lessons this pan closes: source-mutation updates, label focus and original-option identity regressions.

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

Prior-art coverage confirms close-after-select variants, Escape, reopen-after-close and keeping focus while interacting with picker content are the cases that regress.

## D. Keyboard picker navigation

- [x] Arrow Down opens and activates first enabled result.
- [x] Arrow Down/Up walks enabled results and skips disabled options/groups.
- [x] `aria-activedescendant` follows active result.
- [x] active descendant is removed on close/no active item.
- [x] Enter selects active result.
- [x] Enter create behavior only runs when eligible.
- [x] Escape closes without corrupting source value.
- [x] Home/End stay native text-editing in the editable input (caret per ARIA APG); picker navigation uses ArrowDown/Up and PageUp/PageDown (`picker-keyboard.spec.js`).
- [x] PageDown/PageUp step by a page (viewport height ÷ row height) and clamp at the selectable edges.
- [x] all picker navigation keys open a closed picker.
- [x] Tab behavior explicitly tested once policy is fixed (`tabSelect` option; default native traversal, opt-in commit, IME-safe).
- [x] label click focuses enhanced input.

Prior-art accessibility corpora cover the `aria-activedescendant`/`aria-controls` lifecycle and arrows through optgroups.

## E. Multiple chip keyboard navigation

- [x] Arrow Left from empty search focuses last chip.
- [x] Left/Right navigate chips.
- [x] Right from last returns search input.
- [x] Home/End first/last.
- [x] Delete/Backspace removes focused removable chip.
- [x] disabled chip cannot be removed (no remove button is rendered for a selected-disabled option, `features.spec.js`; the source `readonly` mirror is `source-adapters.spec.js`).
- [x] focus lands predictably after removal.
- [x] normal Left/Right editing inside non-empty search is untouched (`chips-keyboard.spec.js`).

We explicitly do **not** test or implement virtual caret positions between chips/items.

## F. Native source/value integrity

- [x] selecting local result updates original option, does not recreate it (a UI click on the second duplicate `value` touches that exact option, `identity.spec.js`).
- [x] single reselect of current value does not fire false native value events (`events.spec.js`, exact-option and bare-value reselects).
- [x] multiple select updates only intended options (removing the middle duplicate deselects only that `<option>`, `identity.spec.js`).
- [x] duplicate labels with distinct values select correct identity (`identity.spec.js` covers same value + same label).
- [x] disabled option cannot select.
- [x] disabled optgroup child cannot select.
- [x] externally-created remote result materializes one native option when selected (`remote.spec.js`).
- [x] unselected remote results do not accumulate as options (`remote.spec.js`).
- [x] input-backed combobox leaves arbitrary text as source value (`xss.spec.js` hostile-input case).

Prior-art regressions cover preserving original option elements and disabled options; the transient-remote-results model means only the selected result is ever materialized.

## G. Native event semantics

- [x] value change emits native `input` then `change`, once each (asserted by the async-create event sequence `["input","change","create"]`, `features.spec.js`).
- [x] no value change emits neither (`events.spec.js`: no-op remove, empty clear, single reselect).
- [x] programmatic `select/remove/clear` follows same contract (`events.spec.js`: each emits exactly one `input` then one `change`).
- [x] custom `before*` events are cancellable (`picker-keyboard.spec.js` beforeopen/beforeclose, `features.spec.js` beforecreate/beforeremove/beforeclear, `filter-modes.spec.js`/`beforefilter.spec.js`).
- [x] after events do not fire when cancelled (asserted in the same `before*` cancel tests).
- [x] event detail contains item/query/context expected (`order.spec.js` reorder payload, `beforefilter.spec.js` query/context, `features.spec.js` guarderror/createerror payloads).
- [x] create/load error events expose error without unhandled state corruption (`combobox:createerror`, `combobox:loaderror`, `combobox:guarderror` in `features.spec.js`/`remote.spec.js`).

The event suite verifies `input` before `change`, single firing, disabled values and no event when the value is unchanged.

## H. Local filtering

- [x] empty query behavior (stale: covered indirectly by the fuzzy/whitespace case and `maxOptions` baseline rows).
- [x] includes (stale: default pipeline exercised throughout the local filter suite).
- [x] startswith (`filter-modes.spec.js`: label prefix, not arbitrary substring).
- [x] accent-insensitive (`liege` matches `Liège` — `normalize` unit tests; the filter pipeline funnels through it in `applyFilter`).
- [x] `searchFields` supports label and extra data fields (custom `searchFields` incl. item `data-*` metadata, `fuzzy.spec.js`).
- [x] fuzzy subsequence matching (`fuzzy.spec.js`: order-preserving subsequence `bnn→Banana`, space-skipping, whitespace query matches all, accent/case fold, garbage → no-results).
- [x] fuzzy never re-ranks — catalogue order preserved (`fuzzy.spec.js`).
- [x] default `match` stays `includes` and never fuzzy-matches subsequences (control test, `fuzzy.spec.js`).
- [x] custom match (`filter-modes.spec.js`: fn receives item/query/context and returns the subset).
- [x] custom filter (`filter-modes.spec.js`: fn narrows the default includes subset).
- [x] score ordering stable for equal scores (pure logic in `rankByScore`, unit-tested).
- [x] custom sort (`sort` comparator exercised by `order.spec.js`).
- [x] invalid pattern query fails safely (`filter-modes.spec.js`: malformed `"("` → no options, no page error).
- [x] backspacing from no-results restores options (`filter-modes.spec.js`).
- [x] no-results state is visually stable and never horizontally scrolls (stale: `css-polish.spec.js`; the long-message containment variant lives in `layout.spec.js`).
- [x] selected multiple values are excluded from results unless future policy says otherwise (stale: asserted by the `source-adapters.spec.js` sync test).
- [x] data-filtered mirror state correct for local source options (`filter-modes.spec.js`).

## H2. Declarative configuration policy

- [x] `<combo-box>` attributes are the canonical declarative surface (booleans honor `="false"`, numbers/enums/short lists, `declarative.spec.js`).
- [x] `tab-select` and `search-fields` attributes map (`declarative.spec.js`, `combobox-element.spec.js`).
- [x] JS options win over wrapper attributes (`declarative.spec.js`).
- [x] source `data-*` attributes are application metadata, never configuration — no third way (`declarative.spec.js`).
- [x] item `data-*` is application metadata consumed by `searchFields` (`fuzzy.spec.js`); an explicit filter input uses the structural `filter="select-id"` link (`source-adapters.spec.js`).

## I. `beforefilter` / app-owned filtering

- [x] event is fired before normal filtering (`beforefilter.spec.js`).
- [x] `event.query` and detail query match (`beforefilter.spec.js`).
- [x] preventDefault stops built-in load/filter (`beforefilter.spec.js`).
- [x] handler can asynchronously call `setResults().applyFilter()` (`beforefilter.spec.js` canceled-handler pattern).
- [x] manual apply does not recursively fire beforefilter (`beforefilter.spec.js`).
- [x] focus remains in search input during result replacement (`beforefilter.spec.js`).

This maps to the Open UI direction and also covers the focus-stability concern from result-cache implementations.

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

Prior-art load coverage addresses preload/loading/no-results and query churn; our AbortSignal design is deliberately stricter about stale-response races.

## K. Creation / tags

- [x] blank/whitespace does not create (`features.spec.js`).
- [x] createFilter false hides/prevents create (covered by `features.spec.js` "createFilter returning false").
- [x] case-insensitive existing label does not accidentally duplicate when policy says existing result wins (`features.spec.js`).
- [x] same label/different existing values remain selectable as separate identities (`features.spec.js`).
- [x] `create: true` creates `{value:text,label:text}` (covered by the `features.spec.js` create suite).
- [x] async create can return different server ID/label (covered by the async-create parity tests).
- [x] async create abort/error behavior (covered by the `createerror` tests).
- [x] beforecreate cancellation (covered by `features.spec.js`).
- [x] maxItems blocks new selection/create but still allows removal (covered by `features.spec.js`).
- [x] created item updates native select and native events (covered by the async-create event sequence).
- [ ] selected created item survives sync as expected.
- [ ] persistence/removal policy for temporary created options is explicitly decided.

Prior-art tag coverage addresses trim/null, duplicate matching, tag insertion and cleanup, and created-option persistence behavior.

## L. Tokenization / paste (P0 parity)

- [x] one separator (`features.spec.js` separator consumption + `splitTokens` unit tests).
- [x] multiple separators (`splitTokens` longest-match unit tests).
- [x] paste multiple tokens creates/selects each valid token (sequential separator paste, `features.spec.js`).
- [x] invalid token/createFilter false does not corrupt remaining term (`features.spec.js`; source fix: `#handleTokenInput` now always writes the computed `rest` back so a mid-batch refusal keeps the unconsumed tail editable).
- [x] duplicate token handled once according to value policy (`features.spec.js`).
- [x] maxItems stops at limit cleanly (`features.spec.js` re-evaluates `maxItems` between tokens).
- [x] custom tokenizer can preserve quoted separator text (`tokenize` seam + `rest` handling, `features.spec.js`).
- [x] composition/IME input is not tokenized mid-composition (`features.spec.js`).

Tokenizer coverage must include the “a refused token must not cut the remaining term” and quoted-token cases.

## M. Clear / remove / guards

- [x] clear single (covered by the `source-adapters.spec.js` required-validity clear test).
- [x] clear multiple (`guards.clear` confirmation path, `features.spec.js`).
- [x] beforeclear cancellation (`features.spec.js`).
- [x] beforeremove cancellation (`features.spec.js`).
- [x] clear does not remove disabled selections unless policy explicitly allows it (`features.spec.js` `mixedclear` case).
- [x] external clear button can call API without DOM hacks (`features.spec.js`, fixture-bound `#ext-clear`).
- [x] async confirmation design gets dedicated tests once finalized (guards `add`/`remove`/`clear` refusals and rejections, `features.spec.js`).

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

A prior-art regression physically reorders selected `<option>`s; our tests deliberately prove we **do not need to** mutate catalogue order.

## O. Optgroups

- [x] headers appear only when group has visible results.
- [x] disabled optgroup makes descendants unselectable.
- [x] filtering removes empty headers.
- [x] remote group values render without requiring native optgroups until selected (`group-transient.spec.js`: transient `group` renders a `.cb-group` header; selecting materializes the native optgroup).
- [x] group renderer is safe (`group-transient.spec.js`: a Node return is used, a string return stays text — hostile strings covered by `xss.spec.js`).

## P. DOM sync / dynamic updates

- [x] add unselected native option → selection unchanged.
- [x] add selected native option → enhanced selection updates.
- [x] remove unselected option → selection unchanged (`source-adapters.spec.js` external-sync sibling).
- [x] remove selected option → selection updates according to native browser behavior.
- [x] replace many options → one batched UI refresh if MutationObserver is implemented.
- [x] update disabled/required/read-only after init → refresh/sync reflects it.
- [x] syncing while search focused preserves focus/query unless contract says otherwise.

These mirror the concrete DOM-change regression scenarios captured in REFERENCES.md.

## Q. Forms / validation

- [x] required empty single invalid.
- [x] selecting real option makes required valid.
- [x] clearing makes it invalid again.
- [x] form `checkValidity()` tracks source, not generated input fiction.
- [x] invalid directs focus to interaction input.
- [x] form reset restores initial selections/input value/chips.
- [x] source input `pattern` remains authoritative for free-form mode (`source-adapters.spec.js` `#pat` case).
- [x] FormData contains source `name` once/multiple as expected (source-order assertion in `order.spec.js`).
- [x] generated search inputs never appear in FormData (`source-adapters.spec.js`: literal `FormData` enumeration matches the form's named controls, and every `.cb-input` is nameless).
- [x] ordered mode serializes intended order (`order.spec.js` ordered FormData with repeated entries).

Prior-art validation coverage: required-state transitions and input-pattern validation.

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

Prior-art security corpora cover original values, group labels, option labels/values and custom templates; match that coverage at minimum.

## T. Layout/browser regressions

- [x] picker anchors to whole control, not residual inline input width after chips (`layout.spec.js`).
- [x] picker flips when viewport lacks block-end space (`layout.spec.js` bottom-anchored control).
- [x] input group/floating label/table/modal/overflow containers do not clip picker (`layout.spec.js` + `popover-dialog.spec.js` for modal/overflow).
- [x] no global scroll/resize positioning listeners (`layout.spec.js`: the open picker stays attached to its anchor after a page scroll).
- [x] long no-results/loading state has no horizontal scrollbar (`layout.spec.js` long-message cases).
- [x] multiple chips wrap/grow without changing picker anchor width incorrectly (`layout.spec.js` wrapped-chips case).
- [x] RTL logical placement/text (`rtl.spec.js` + RTL chip/remove layout in `css-polish.spec.js`).
- [x] RTL: chips flow right-to-left, picker flips and has no horizontal overflow, physical keyboard navigation is stable.
- [x] reduced motion: no transition/animation runs in the picker (CSS has none; asserted under `prefers-reduced-motion: reduce` in `visual.spec.js`).
- [x] forced-colors/high contrast: picker rows and chips stay distinguishable and visible (`visual.spec.js`; engines without the `forced-colors` media query are skipped).
- [x] zoom: at 200% zoom the picker stays anchored, internally contained and within the document (`visual.spec.js`).

These scenarios ensure top-layer + Anchor Positioning handles difficult layout contexts without container-specific positioning code.

## U. Performance sanity

No virtualization target, but avoid pathological work:

- [x] init dozens of controls without repeated layout reads (`init.spec.js`: 36 controls enhance and dispose with zero page errors; layout-read instrumentation stays qualitative).
- [x] 4k local options: one source mutation batch should not produce thousands of refreshes (batching proven with the `observeSource` debounce).
- [ ] filtering avoids unnecessary DOM reconstruction when future profiling justifies optimization.
- [x] remote searches do not grow native select catalogue indefinitely (`remote.spec.js` transient-results test).

A prior-art regression batches 4000 option mutations into one selection update; use it as a batching sanity reference, not a virtualization requirement.

---

# Starter release gate

Before calling the implementation “v1-ready”, all P0 cases above must be automated except the explicitly manual AT matrix. The suite runs on current Chromium, Firefox and WebKit (Playwright projects; `bun run test:browser:all` / `check:all` for the non-Chromium engines, `test:browser` stays Chromium-only for fast local loops), and forced-fallback tests run in every engine.
