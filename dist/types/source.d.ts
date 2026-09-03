/**
 * Native catalogue/source operations for the Combobox engine.
 *
 * Module-level functions that take the Combobox instance explicitly, so
 * `combobox.js` stays the orchestrator without exposing a private-method
 * surface. They touch only the instance's public state (source, isSelect,
 * isMultiple, options, datalist) and native DOM; anything that needs the
 * picker, selection model, observers or renderers stays on the class.
 *
 * These are DOM routines, not engine rules: no state lifecycle, events or
 * refresh decisions live here — the caller owns those.
 */
/**
 * Discriminate a source to a `<select>`, throwing when the invariant is
 * violated (an unchecked cast would silently lie to the checker).
 * @param {import("./combobox.js").Combobox} combobox
 * @returns {HTMLSelectElement}
 */
export declare function selectSourceOf(combobox: import("./combobox.js").Combobox): HTMLSelectElement;
/**
 * Read the native catalogue as canonical items: the select's
 * `<option>`/`<optgroup>` set, or the (possibly detached) `<datalist>` for an
 * input-backed combobox. Empty values are dropped unless `allowEmptyOption`
 * admits them.
 * @param {import("./combobox.js").Combobox} combobox
 * @returns {import("./helpers.js").ComboboxItem[]}
 */
export declare function readSourceItems(combobox: import("./combobox.js").Combobox): import("./helpers.js").ComboboxItem[];
/**
 * Resolve a bare value to any native option, selected or not. Identity is the
 * element, never the string, so duplicates stay distinct.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {*} value
 * @returns {HTMLOptionElement | null}
 */
export declare function findOptionByValue(combobox: import("./combobox.js").Combobox, value: any): HTMLOptionElement | null;
/**
 * Resolve a bare value to the option a fresh selection should land on: the
 * first non-disabled match, skipping already-selected options in multiple mode
 * (each native option is selected at most once; identical values on distinct
 * options are distinct choices). Single-select returns the first non-disabled
 * match regardless of the current selection.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {*} value
 * @returns {HTMLOptionElement | null}
 */
export declare function findSelectableOption(combobox: import("./combobox.js").Combobox, value: any): HTMLOptionElement | null;
/**
 * Match a create/token term to an existing native option by normalized value
 * **or** label. Both the enhanced picker and the native fallback funnel
 * through here, so typing a label never materializes a duplicate option.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {string} label
 * @returns {import("./helpers.js").ComboboxItem | null}
 */
export declare function findCreateMatch(combobox: import("./combobox.js").Combobox, label: string): import("./helpers.js").ComboboxItem | null;
/**
 * Map data objects to canonical items when label/value fields are set.
 * @param {import("./combobox.js").Combobox} combobox
 * @returns {import("./helpers.js").ItemFields | null}
 */
export declare function fieldsFor(combobox: import("./combobox.js").Combobox): import("./helpers.js").ItemFields | null;
/**
 * Replace the native catalogue. For a select this rebuilds the
 * `<option>`/`<optgroup>` set, keeping the currently selected options first
 * when `preserveSelected` (defaults to select-backed) and re-appending a
 * single-select empty placeholder. No value-based dedupe: catalogue identity is
 * the `<option>` element, so repeated payload values map to their own options.
 * For an input combobox the detached `<datalist>` is rebuilt from the payload.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {import("./helpers.js").ComboboxItem[]} normalized
 * @param {{ preserveSelected?: boolean }} [options]
 * @returns {void}
 */
export declare function replaceCatalogue(combobox: import("./combobox.js").Combobox, normalized: import("./helpers.js").ComboboxItem[], { preserveSelected }?: {
    preserveSelected?: boolean;
}): void;
/**
 * Materialize one catalogue option on its native select. Each catalogue entry
 * is its own identity: an existing value never short-circuits a fresh option,
 * so two distinct `{ value: "2" }` entries stay distinct choices. An explicit
 * `item.option` is adopted as-is instead. `selected` is live state only —
 * `defaultSelected` belongs to authored markup (or an explicit catalogue
 * replacement), otherwise a dynamic selection would silently rewrite
 * `form.reset()`'s baseline.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {import("./helpers.js").ComboboxItem} item
 * @param {{ selected?: boolean }} [options]
 * @returns {HTMLOptionElement}
 */
export declare function appendCatalogOption(combobox: import("./combobox.js").Combobox, item: import("./helpers.js").ComboboxItem, { selected }?: {
    selected?: boolean;
}): HTMLOptionElement;
//# sourceMappingURL=source.d.ts.map