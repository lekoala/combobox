export { ComboBoxElement, defineCombobox } from "./combo-box.js";
export { Combobox, default } from "./combobox.js";
export {
  booleanAttribute,
  fuzzyMatch,
  moveValueInOrder,
  normalize,
  parseInteger,
  parseList,
  parseSeparators,
  rankByScore,
  reconcileSelected,
  splitTokens,
  toItem,
} from "./helpers.js";

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
