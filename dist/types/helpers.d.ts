/**
 * Pure helpers shared by the Combobox engine.
 *
 * Free of DOM/engine state and unit-tested directly as ESM. The global build
 * (dist/combobox.js) inlines them through its single side-effect entry,
 * src/define.js; nothing in src/ ever touches window/globalThis.
 *
 * Separator contract:
 * - separator values are full strings, not a character class (`",|;"` means
 *   comma, pipe and semicolon are all independent separators);
 * - the `|`-delimited form is the `<combo-box separators="…">` attribute
 *   encoding, so a literal `|` cannot be expressed as an attribute separator;
 * - matching prefers the longest separator at any position.
 */
export type ComboboxItem = Record<string, any> & {
    value: string;
    label: string;
    disabled?: boolean;
    selected?: boolean;
    group?: string;
    option?: HTMLOptionElement | null;
    data?: Record<string, string | undefined>;
    title?: string;
};
export type ItemFields = {
    labelField?: string;
    valueField?: string;
};
export type Token = {
    text: string;
    /**
     * The separator that terminated the token
     */
    sep: string;
};
export type SplitResult = {
    /**
     * Completed tokens
     */
    done: Token[];
    /**
     * Trailing unterminated text that must stay in the input
     */
    rest: string;
};
/**
 * @param {*} value
 * @returns {string}
 */
export declare function normalize(value: any): string;
/**
 * Convert any input to a canonical `{ value, label }`.
 *
 * @param {*} raw
 * @param {ItemFields | null} [fields]
 * @returns {ComboboxItem | null}
 */
export declare function toItem(raw: any, fields?: ItemFields | null): ComboboxItem | null;
/**
 * Parse the pipe-delimited separator attribute into an array of full
 * separator strings. `null`/empty values yield no separators.
 *
 * @param {string | string[] | null | undefined} raw
 * @returns {string[]}
 */
export declare function parseSeparators(raw: string | string[] | null | undefined): string[];
/**
 * Split `input` by the longest matching separators.
 * Returns `{ done: [{ text, sep }], rest }`: `done` holds complete tokens
 * (each terminated by a separator); `rest` is the trailing unterminated
 * text (the incomplete token that must stay in the input).
 *
 * @param {string | null | undefined} input
 * @param {string | string[] | null | undefined} separators
 * @returns {SplitResult}
 */
export declare function splitTokens(input: string | null | undefined, separators: string | string[] | null | undefined): SplitResult;
/**
 * Rank items by a score function with a stable tiebreak on the original
 * relative order. `score(item, index) => number | false | null`:
 * - `false` and `null` exclude the item (no confidence / explicit exclusion);
 * - `0` is a valid score and keeps the item, ranked last for its tie group.
 *
 * The `index` argument is the position in the input list at scoring time,
 * mirroring how the engine feeds filtered items to the user's scorer.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T, index: number) => number | false | null} score
 * @returns {T[]}
 */
export declare function rankByScore<T>(items: T[], score: (item: T, index: number) => number | false | null): T[];
/**
 * Reconcile the remembered selection order against the currently selected
 * values. Outcome: every selected value that appears in `order` first in the
 * remembered sequence, then any selected value unknown to `order` appended in
 * native `values` order. A remembered value that is no longer selected is
 * never kept. `values` is treated as the source of truth for membership.
 *
 * @template T
 * @param {T[]} values
 * @param {T[]} order
 * @returns {T[]}
 */
export declare function reconcileSelected<T>(values: T[], order: T[]): T[];
/**
 * Move `identity` within `list` to `index` (clamped to valid bounds). Returns
 * `{ order, from, to }` when a real move happens (a fresh array, the input is
 * never mutated), or `null` when the identity is unknown or already at the
 * target position. `from`/`to` are the pre-move positions.
 *
 * Match is strict identity (SameValueZero), so the list may hold strings or
 * option-element references alike — callers never need string coercion.
 *
 * @template T
 * @param {T[]} list
 * @param {T} identity
 * @param {number} index
 * @returns {{ order: T[], from: number, to: number } | null}
 */
export declare function moveValueInOrder<T>(list: T[], identity: T, index: number): {
    order: T[];
    from: number;
    to: number;
} | null;
/**
 * Split a comma-delimited attribute value into a trimmed, non-empty list.
 * `"label, email, "` → `["label", "email"]`; empty input → `[]`.
 *
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
export declare function parseList(raw: string | null | undefined): string[];
/**
 * Boolean `<combo-box>` attribute semantics: absent → `undefined` (so the
 * caller can omit the option and keep the DEFAULTS value), present → `true`
 * unless the authored value is exactly the string `"false"`.
 *
 * @param {Element} element
 * @param {string} name
 * @returns {boolean | undefined}
 */
export declare function booleanAttribute(element: Element, name: string): boolean | undefined;
/**
 * Parse a count-like `<combo-box>` attribute. `null` and non-integer values
 * (e.g. `"banana"` or `"2.5"`) yield `undefined` so the caller can omit the
 * option and let the DEFAULTS value apply instead of spreading `NaN`.
 *
 * @param {string | null | undefined} raw
 * @returns {number | undefined}
 */
export declare function parseInteger(raw: string | null | undefined): number | undefined;
/**
 * Very light subsequence fuzzy match, used by `match: "fuzzy"`.
 *
 * Contract: both `str` and `lookup` must already be normalized (case/accent
 * folding happens in the caller, in `normalize()`) — fuzzyMatch does no
 * normalization of its own. A whitespace-only lookup matches everything; a
 * plain substring still wins via the fast `includes` path; otherwise every
 * non-space character of the lookup must appear in order. The scan advances by
 * `char.length` (not `1`) so a surrogate-pair character is consumed whole.
 *
 * @param {string} str
 * @param {*} lookup
 * @returns {boolean}
 */
export declare function fuzzyMatch(str: string, lookup: any): boolean;
//# sourceMappingURL=helpers.d.ts.map