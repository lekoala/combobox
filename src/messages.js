/**
 * Generated UI text, centralized for i18n. This module is DOM-free so the
 * catalog can be imported and unit-tested without a browser; the engine's
 * `Combobox.getDefaultMessages()` / `setDefaultMessages()` statics delegate to
 * it, and the shipped `src/locales/*` modules apply their translations through
 * `setDefaultMessages` on import.
 */

/**
 * Screen-reader / UI status messages. Defaults are merged so the label
 * producers (`create`, `position`, `remove`) are always functions; the plain
 * status strings (`add`, `noResults`, `loading`, `loadError`) are literal
 * text rendered by `setContent` (rich DOM rows use the `render.*` hooks
 * instead).
 * @typedef {Object} Messages
 * @property {string} [add] Fallback Add-control label
 * @property {string} [noResults]
 * @property {string} [loading]
 * @property {string} [loadError]
 * @property {(query: string, context?: import("./combobox.js").ComboboxContext) => string} [create]
 * @property {(label: string, context?: import("./combobox.js").ComboboxContext) => string} [remove]
 *   Remove-button accessible label for a chip.
 * @property {(label: string, position: number, total: number, context?: import("./combobox.js").ComboboxContext) => string} [position]
 */

/** @type {Messages} */
const DEFAULT_MESSAGES = {
  add: "Add",
  noResults: "No results",
  loading: "Loading…",
  loadError: "Failed to load results",
  create: (query) => `Create “${query}”`,
  remove: (label) => `Remove ${label}`,
  position: (label, position, total) => `${label} position ${position} of ${total}`,
};

/**
 * Read the current default UI messages. Returns a shallow copy; mutating
 * the result does not affect the engine.
 * @returns {Messages}
 */
export function getDefaultMessages() {
  return { ...DEFAULT_MESSAGES };
}

/**
 * Merge application or locale-provided UI text into the default messages.
 * Called by the shipped `locales/*` modules on import. Only comboboxes
 * created *after* this call see the new text: instances resolve their
 * messages as a snapshot at construction time. Per-instance `messages`
 * options always take precedence over these defaults. Missing keys keep
 * their current translation, and producer keys (`create`, `position`,
 * `remove`) stay functions.
 * @param {Partial<Messages>} messages
 * @returns {void}
 */
export function setDefaultMessages(messages) {
  Object.assign(DEFAULT_MESSAGES, messages);
}

export { DEFAULT_MESSAGES };
