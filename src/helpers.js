/**
 * Pure helpers shared by the Combobox engine.
 *
 * Loaded as a classic script BEFORE src/combobox.js. Exposes a single global
 * `ComboboxHelpers` namespace so the engine stays a plain global script. The
 * functions are free of DOM/engine state and are unit-tested directly.
 *
 * Separator contract:
 * - separator values are full strings, not a character class (`",|;"` means
 *   comma, pipe and semicolon are all independent separators);
 * - the `|`-delimited form is the legacy `data-separator`/attribute encoding,
 *   so a literal `|` cannot be expressed as an attribute separator;
 * - matching prefers the longest separator at any position.
 */
((root) => {
  function hasOwn(object, key) {
    return Object.hasOwn(object, key);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  }

  /** Convert any input to a canonical `{ value, label }`. */
  function toItem(raw, fields = null) {
    if (raw == null) return null;
    if (typeof raw === "string" || typeof raw === "number") {
      return { value: String(raw), label: String(raw) };
    }

    // Real option elements and already-canonical objects are authoritative;
    // labelField/valueField only map plain data objects.
    const mapped =
      fields && (fields.labelField || fields.valueField) && !hasOwn(raw, "value") && !hasOwn(raw, "label");

    const value = mapped
      ? (raw[fields.valueField] ?? raw.id ?? raw.label ?? "")
      : (raw.value ?? raw.id ?? raw.label ?? "");
    const label = mapped
      ? (raw[fields.labelField] ?? raw.text ?? raw.value ?? raw.id ?? "")
      : (raw.label ?? raw.text ?? raw.value ?? raw.id ?? "");

    return { ...raw, value: String(value ?? ""), label: String(label ?? "") };
  }

  /**
   * Parse the pipe-delimited separator attribute into an array of full
   * separator strings. `null`/empty values yield no separators.
   */
  function parseSeparators(raw) {
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
   */
  function splitTokens(input, separators) {
    const result = { done: [], rest: String(input ?? "") };
    if (!result.rest) return result;

    const kinds = parseSeparators(separators).sort((a, b) => b.length - a.length);
    if (!kinds.length) return result;

    const pattern = new RegExp(`(${kinds.map(escapeRegExp).join("|")})`, "g");
    const parts = result.rest.split(pattern);

    let buffer = "";
    const done = [];
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
   */
  function rankByScore(items, score) {
    return items
      .map((item, index) => ({ item, index, score: score(item, index) }))
      .filter((entry) => entry.score !== false && entry.score !== null)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.item);
  }

  /**
   * Reconcile the remembered selection order against the currently selected
   * values. Outcome: every selected value that appears in `order` first in the
   * remembered sequence, then any selected value unknown to `order` appended in
   * native `values` order. A remembered value that is no longer selected is
   * never kept. `values` is treated as the source of truth for membership.
   */
  function reconcileSelected(values, order) {
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
   * Move `value` within `list` to `index` (clamped to valid bounds). Returns
   * `{ order, from, to }` when a real move happens (a fresh array, the input is
   * never mutated), or `null` when the value is unknown or already at the
   * target position. `from`/`to` are the pre-move positions.
   */
  function moveValueInOrder(list, value, index) {
    const order = [...list];
    const from = order.indexOf(String(value));
    if (from < 0) return null;
    const to = Math.max(0, Math.min(Number(index), order.length - 1));
    if (from === to) return null;
    order.splice(to, 0, ...order.splice(from, 1));
    return { order, from, to };
  }

  root.ComboboxHelpers = {
    normalize,
    toItem,
    parseSeparators,
    splitTokens,
    rankByScore,
    reconcileSelected,
    moveValueInOrder,
  };
})(typeof window !== "undefined" ? window : globalThis);
