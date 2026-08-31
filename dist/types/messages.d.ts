/**
 * Generated UI text, centralized for i18n. This module is DOM-free so the
 * catalog can be imported and unit-tested without a browser; the engine's
 * `Combobox.getDefaultMessages()` / `setDefaultMessages()` statics delegate to
 * it, and the shipped `src/locales/*` modules apply their translations through
 * `setDefaultMessages` on import.
 */
export type Messages = {
    noResults?: string;
    loading?: string;
    loadError?: string;
    create?: (query: string, context?: import("./combobox.js").ComboboxContext) => string;
    position?: (label: string, position: number, total: number, context?: import("./combobox.js").ComboboxContext) => string;
};
/**
 * Screen-reader / UI status messages. Defaults are merged so the label
 * producers (`create`, `position`) are always functions; the plain status
 * strings (`noResults`, `loading`, `loadError`) are literal text rendered by
 * `setContent` (rich DOM rows use the `render.*` hooks instead).
 * @typedef {Object} Messages
 * @property {string} [noResults]
 * @property {string} [loading]
 * @property {string} [loadError]
 * @property {(query: string, context?: import("./combobox.js").ComboboxContext) => string} [create]
 * @property {(label: string, position: number, total: number, context?: import("./combobox.js").ComboboxContext) => string} [position]
 */
/** @type {Messages} */
declare const DEFAULT_MESSAGES: Messages;
/**
 * Read the current default UI messages. Returns a shallow copy; mutating
 * the result does not affect the engine.
 * @returns {Messages}
 */
export declare function getDefaultMessages(): Messages;
/**
 * Merge application or locale-provided UI text into the default messages.
 * Called by the shipped `locales/*` modules on import. Only comboboxes
 * created *after* this call see the new text: instances resolve their
 * messages as a snapshot at construction time. Per-instance `messages`
 * options always take precedence over these defaults. Missing keys keep
 * their current translation, and producer keys (`create`, `position`) stay
 * functions.
 * @param {Partial<Messages>} messages
 * @returns {void}
 */
export declare function setDefaultMessages(messages: Partial<Messages>): void;
export { DEFAULT_MESSAGES };
//# sourceMappingURL=messages.d.ts.map