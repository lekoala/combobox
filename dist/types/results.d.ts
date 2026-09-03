/**
 * Transient-result and filtering decisions for the Combobox engine.
 *
 * Module-level functions that take the Combobox instance explicitly, keeping
 * `combobox.js` as the orchestrator. They only read instance config/state and
 * return decisions — rendering, active-option bookkeeping and picker visibility
 * stay with the class because they are entangled with `activeIndex`, focus and
 * the popover.
 */
/**
 * Decision helper: an empty query is "no textual search", so the matcher
 * (including a custom match) has nothing to decide — everything passes the
 * match stage (`filter` admissibility still applies independently).
 * For any other query, the strategy is applied **per `searchField` value**:
 * `matchesField` owns every strategy and receives exactly one value, so a
 * match can never cross field boundaries.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {import("./helpers.js").ComboboxItem} item
 * @param {string} query
 * @returns {boolean}
 */
export declare function matchesItem(combobox: import("./combobox.js").Combobox, item: import("./helpers.js").ComboboxItem, query: string): boolean;
/**
 * Whether the current query should trigger the remote `load` callback.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {string} query
 * @returns {boolean}
 */
export declare function shouldLoadRemote(combobox: import("./combobox.js").Combobox, query: string): boolean;
/**
 * Run the local filtering pipeline (match → `filter` → `score` → `sort`) over
 * the candidate items for `query` and return the ordered result store. The
 * caller assigns `filteredItems` and owns rendering/active-option handling.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {import("./helpers.js").ComboboxItem[]} items
 * @param {string} query
 * @returns {import("./helpers.js").ComboboxItem[]}
 */
export declare function computeFilteredItems(combobox: import("./combobox.js").Combobox, items: import("./helpers.js").ComboboxItem[], query: string): import("./helpers.js").ComboboxItem[];
/**
 * `maxOptions` is a rendering cap only: the result store (`filteredItems`) may
 * be large, but at most `maxOptions` options are ever rendered/navigated.
 * `0` means no cap.
 * @param {import("./combobox.js").Combobox} combobox
 * @returns {import("./helpers.js").ComboboxItem[]}
 */
export declare function visibleItemsFor(combobox: import("./combobox.js").Combobox): import("./helpers.js").ComboboxItem[];
//# sourceMappingURL=results.d.ts.map