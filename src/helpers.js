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

  root.ComboboxHelpers = { normalize, toItem, parseSeparators, splitTokens };
})(typeof window !== "undefined" ? window : globalThis);
