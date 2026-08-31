export { ComboBoxElement, defineCombobox } from "./combo-box.js";
export { Combobox, default } from "./combobox.js";
export { booleanAttribute, fuzzyMatch, moveValueInOrder, normalize, parseInteger, parseList, parseSeparators, rankByScore, reconcileSelected, splitTokens, toItem, } from "./helpers.js";
export type ComboboxOptions = import("./combobox.js").ComboboxOptions;
export type ComboboxItem = import("./helpers.js").ComboboxItem;
export type ComboboxSource = HTMLInputElement | HTMLSelectElement;
export type LoadContext = import("./combobox.js").LoadContext;
/**
 * Public configuration for a Combobox instance.
 * @typedef {import("./combobox.js").ComboboxOptions} ComboboxOptions
 */
/**
 * Canonical combobox item (value/label payload plus optional metadata).
 * @typedef {import("./helpers.js").ComboboxItem} ComboboxItem
 */
/**
 * A selectable source for a combobox: a free-form input+datalist or a select.
 * @typedef {HTMLInputElement | HTMLSelectElement} ComboboxSource
 */
/**
 * Context passed to the async load callback.
 * @typedef {import("./combobox.js").LoadContext} LoadContext
 */
//# sourceMappingURL=index.d.ts.map