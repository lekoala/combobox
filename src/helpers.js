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

/**
 * Canonical combobox item. `value`/`label` are the serialized payload; the
 * remaining keys mirror source metadata the engine reads back. Applications
 * may hang their own payload on items (label/value fields are honored by the
 * engine, a `data-*` mapping is not).
 * @typedef {Record<string, any> & {
 *   value: string,
 *   label: string,
 *   disabled?: boolean,
 *   selected?: boolean,
 *   group?: string,
 *   option?: HTMLOptionElement | null,
 *   data?: Record<string, string | undefined>,
 *   title?: string,
 * }} ComboboxItem
 */

/**
 * Field mapping used to convert plain data objects into canonical items.
 * @typedef {Object} ItemFields
 * @property {string} [labelField]
 * @property {string} [valueField]
 */

/**
 * A completed separator-delimited token.
 * @typedef {Object} Token
 * @property {string} text
 * @property {string} sep The separator that terminated the token
 */

/**
 * Result of a tokenization pass.
 * @typedef {Object} SplitResult
 * @property {Token[]} done Completed tokens
 * @property {string} rest Trailing unterminated text that must stay in the input
 */

/**
 * @param {object} object
 * @param {string} key
 * @returns {boolean}
 */
export function hasOwn(object, key) {
  return Object.hasOwn(object, key);
}

/**
 * @param {*} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {*} value
 * @returns {string}
 */
export function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

/**
 * Convert any input to a canonical `{ value, label }`.
 *
 * @param {*} raw
 * @param {ItemFields | null} [fields]
 * @returns {ComboboxItem | null}
 */
export function toItem(raw, fields = null) {
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "number") {
    return { value: String(raw), label: String(raw) };
  }

  // Real option elements and already-canonical objects are authoritative;
  // labelField/valueField only map plain data objects.
  if (fields && (fields.labelField || fields.valueField) && !hasOwn(raw, "value") && !hasOwn(raw, "label")) {
    const value = (fields.valueField && raw[fields.valueField]) ?? raw.id ?? raw.label ?? "";
    const label = (fields.labelField && raw[fields.labelField]) ?? raw.text ?? raw.value ?? raw.id ?? "";
    return { ...raw, value: String(value ?? ""), label: String(label ?? "") };
  } else {
    const value = raw.value ?? raw.id ?? raw.label ?? "";
    const label = raw.label ?? raw.text ?? raw.value ?? raw.id ?? "";
    return { ...raw, value: String(value ?? ""), label: String(label ?? "") };
  }
}

/**
 * Parse the pipe-delimited separator attribute into an array of full
 * separator strings. `null`/empty values yield no separators.
 *
 * @param {string | string[] | null | undefined} raw
 * @returns {string[]}
 */
export function parseSeparators(raw) {
  if (Array.isArray(raw)) {
    return raw.map(String).filter((separator) => separator.length > 0);
  }
  if (raw == null) return [];
  return String(raw)
    .split("|")
    .filter((separator) => separator.length > 0);
}

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
export function splitTokens(input, separators) {
  const result = /** @type {SplitResult} */ ({
    done: /** @type {Token[]} */ ([]),
    rest: String(input ?? ""),
  });
  if (!result.rest) return result;

  const kinds = parseSeparators(separators).sort((a, b) => b.length - a.length);
  if (!kinds.length) return result;

  const pattern = new RegExp(`(${kinds.map(escapeRegExp).join("|")})`, "g");
  const parts = result.rest.split(pattern);

  let buffer = "";
  const done = /** @type {Token[]} */ ([]);
  for (const part of parts) {
    if (kinds.includes(part)) {
      if (buffer) done.push({ text: buffer, sep: part });
      buffer = "";
    } else {
      buffer += part;
    }
  }

  result.done = done;
  result.rest = buffer;
  return result;
}

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
export function rankByScore(items, score) {
  return items
    .map((item, index) => ({ item, index, score: score(item, index) }))
    .filter((entry) => entry.score !== false && entry.score !== null)
    .sort((a, b) => Number(b.score) - Number(a.score) || a.index - b.index)
    .map((entry) => entry.item);
}

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
export function reconcileSelected(values, order) {
  const remaining = new Set(values);
  const result = [];
  for (const value of order) {
    if (remaining.has(value)) {
      result.push(value);
      remaining.delete(value);
    }
  }
  result.push(...remaining);
  return result;
}

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
export function moveValueInOrder(list, identity, index) {
  const order = [...list];
  const from = order.indexOf(identity);
  if (from < 0) return null;
  const to = Math.max(0, Math.min(Number(index), order.length - 1));
  if (from === to) return null;
  order.splice(to, 0, ...order.splice(from, 1));
  return { order, from, to };
}

/**
 * Split a comma-delimited attribute value into a trimmed, non-empty list.
 * `"label, email, "` → `["label", "email"]`; empty input → `[]`.
 *
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
export function parseList(raw) {
  if (raw == null) return [];
  return String(raw)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Boolean `<combo-box>` attribute semantics: absent → `undefined` (so the
 * caller can omit the option and keep the DEFAULTS value), present → `true`
 * unless the authored value is exactly the string `"false"`.
 *
 * @param {Element} element
 * @param {string} name
 * @returns {boolean | undefined}
 */
export function booleanAttribute(element, name) {
  if (!element.hasAttribute(name)) return undefined;
  return element.getAttribute(name) !== "false";
}

/**
 * Parse a count-like `<combo-box>` attribute. `null` and non-integer values
 * (e.g. `"banana"` or `"2.5"`) yield `undefined` so the caller can omit the
 * option and let the DEFAULTS value apply instead of spreading `NaN`.
 *
 * @param {string | null | undefined} raw
 * @returns {number | undefined}
 */
export function parseInteger(raw) {
  if (raw == null) return undefined;
  const number = Number(raw);
  return Number.isInteger(number) ? number : undefined;
}

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
export function fuzzyMatch(str, lookup) {
  const wanted = String(lookup ?? "");
  if (!wanted.trim()) return true;
  if (str.includes(wanted)) return true;

  let pos = 0;
  for (const char of wanted) {
    if (char === " ") continue;
    const index = str.indexOf(char, pos);
    if (index === -1) return false;
    pos = index + char.length;
  }
  return true;
}
