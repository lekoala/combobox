/**
 * Transient-result and filtering decisions for the Combobox engine.
 *
 * Module-level functions that take the Combobox instance explicitly, keeping
 * `combobox.js` as the orchestrator. They only read instance config/state and
 * return decisions — rendering, active-option bookkeeping and picker visibility
 * stay with the class because they are entangled with `activeIndex`, focus and
 * the popover.
 */

import { matchesField, rankByScore } from "./helpers.js";

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
export function matchesItem(combobox, item, query) {
  if (!query) return true;

  const input = /** @type {HTMLInputElement} */ (combobox.input);
  if (typeof combobox.options.match === "function") {
    return combobox.options.match(item, query, {
      combobox,
      source: combobox.source,
      input,
    });
  }

  const fields = Array.isArray(combobox.options.searchFields)
    ? combobox.options.searchFields
    : combobox.options.searchFields
      ? [combobox.options.searchFields]
      : [];
  const values = fields.map((field) => {
    if (field in item) return String(item[field] ?? "");
    return String(item.data?.[field] ?? "");
  });
  return values.some((value) => matchesField(value, query, combobox.options.match));
}

/**
 * Whether the current query should trigger the remote `load` callback.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {string} query
 * @returns {boolean}
 */
export function shouldLoadRemote(combobox, query) {
  const input = /** @type {HTMLInputElement} */ (combobox.input);
  if (
    typeof combobox.options.shouldLoad === "function" &&
    !combobox.options.shouldLoad(query, { combobox, source: combobox.source, input })
  ) {
    return false;
  }
  return (
    typeof combobox.options.load === "function" &&
    query.length >= Number(combobox.options.minChars || 0) &&
    (query.length > 0 || combobox.options.loadOnEmpty)
  );
}

/**
 * Run the local filtering pipeline (match → `filter` → `score` → `sort`) over
 * the candidate items for `query` and return the ordered result store. The
 * caller assigns `filteredItems` and owns rendering/active-option handling.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {import("./helpers.js").ComboboxItem[]} items
 * @param {string} query
 * @returns {import("./helpers.js").ComboboxItem[]}
 */
export function computeFilteredItems(combobox, items, query) {
  const input = /** @type {HTMLInputElement} */ (combobox.input);
  let visible = items.filter((item) => {
    if (combobox.isMultiple && item.selected) return false;
    return matchesItem(combobox, item, query);
  });

  const context = { combobox, source: combobox.source, input };

  if (typeof combobox.options.filter === "function") {
    visible = visible.filter((item) => combobox.options.filter(item, query, context));
  }

  if (typeof combobox.options.score === "function") {
    visible = rankByScore(visible, (item, _index) => combobox.options.score(item, query, context));
  }

  if (typeof combobox.options.sort === "function") {
    visible.sort((a, b) => combobox.options.sort(a, b, query, context));
  }

  return visible;
}

/**
 * `maxOptions` is a rendering cap only: the result store (`filteredItems`) may
 * be large, but at most `maxOptions` options are ever rendered/navigated.
 * `0` means no cap.
 * @param {import("./combobox.js").Combobox} combobox
 * @returns {import("./helpers.js").ComboboxItem[]}
 */
export function visibleItemsFor(combobox) {
  return combobox.options.maxOptions > 0
    ? combobox.filteredItems.slice(0, combobox.options.maxOptions)
    : combobox.filteredItems;
}
