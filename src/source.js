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

import { normalize } from "./helpers.js";

/**
 * Discriminate a source to a `<select>`, throwing when the invariant is
 * violated (an unchecked cast would silently lie to the checker).
 * @param {import("./combobox.js").Combobox} combobox
 * @returns {HTMLSelectElement}
 */
export function selectSourceOf(combobox) {
  if (!(combobox.source instanceof HTMLSelectElement)) {
    throw new TypeError("Expected a select-backed combobox");
  }
  return combobox.source;
}

/**
 * Read the native catalogue as canonical items: the select's
 * `<option>`/`<optgroup>` set, or the (possibly detached) `<datalist>` for an
 * input-backed combobox. Empty values are dropped unless `allowEmptyOption`
 * admits them.
 * @param {import("./combobox.js").Combobox} combobox
 * @returns {import("./helpers.js").ComboboxItem[]}
 */
export function readSourceItems(combobox) {
  const { source, isSelect, options, datalist } = combobox;
  if (isSelect) {
    return Array.from(selectSourceOf(combobox).options)
      .filter((option) => option.value || options.allowEmptyOption)
      .map((option) => ({
        value: option.value,
        label: option.textContent.trim(),
        disabled:
          option.disabled ||
          (option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.disabled : false),
        selected: option.selected,
        group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : "",
        option,
        data: { ...option.dataset },
      }));
  }

  if (!datalist) return [];
  return Array.from(datalist.options).map((option) => ({
    value: option.value,
    label: option.label || option.value,
    disabled: option.disabled,
    selected: source.value === option.value,
    group: option.dataset.group || "",
    option,
    data: { ...option.dataset },
  }));
}

/**
 * Resolve a bare value to any native option, selected or not. Identity is the
 * element, never the string, so duplicates stay distinct.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {*} value
 * @returns {HTMLOptionElement | null}
 */
export function findOptionByValue(combobox, value) {
  if (!combobox.isSelect) return null;
  const select = selectSourceOf(combobox);
  return Array.from(select.options).find((option) => option.value === String(value)) || null;
}

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
export function findSelectableOption(combobox, value) {
  if (!combobox.isSelect) return null;
  const wanted = String(value);
  return (
    Array.from(selectSourceOf(combobox).options).find(
      (option) =>
        option.value === wanted && !option.disabled && (combobox.isMultiple && option.selected) === false,
    ) || null
  );
}

/**
 * Match a create/token term to an existing native option by normalized value
 * **or** label. Both the enhanced picker and the native fallback funnel
 * through here, so typing a label never materializes a duplicate option.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {string} label
 * @returns {import("./helpers.js").ComboboxItem | null}
 */
export function findCreateMatch(combobox, label) {
  const lookup = normalize(label);
  for (const item of readSourceItems(combobox)) {
    if (normalize(item.value) === lookup || normalize(item.label) === lookup) return item;
  }
  return null;
}

/**
 * Map data objects to canonical items when label/value fields are set.
 * @param {import("./combobox.js").Combobox} combobox
 * @returns {import("./helpers.js").ItemFields | null}
 */
export function fieldsFor(combobox) {
  const { labelField, valueField } = combobox.options;
  return labelField || valueField ? { labelField, valueField } : null;
}

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
export function replaceCatalogue(combobox, normalized, { preserveSelected = combobox.isSelect } = {}) {
  const { isSelect, isMultiple, options, datalist } = combobox;

  if (isSelect) {
    const select = selectSourceOf(combobox);
    /** @type {import("./helpers.js").ComboboxItem[]} */
    const preserved = preserveSelected
      ? Array.from(select.selectedOptions).map((option) => ({
          value: option.value,
          label: option.textContent.trim(),
          selected: true,
          disabled: option.disabled,
          group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : "",
        }))
      : [];

    const emptyOption = Array.from(select.options).find((option) => !option.value);
    select.replaceChildren();
    if (emptyOption && !isMultiple) select.append(emptyOption);

    const catalog = [...preserved, ...normalized];

    const groups = new Map();
    for (const item of catalog) {
      // An empty value is a legitimate option only when allowEmptyOption
      // admits it; otherwise it would shadow the collection's real entries.
      if (!item.value && !options.allowEmptyOption) continue;
      const option = new Option(item.label, item.value, Boolean(item.selected), Boolean(item.selected));
      option.disabled = Boolean(item.disabled);
      if (item.data) Object.assign(option.dataset, item.data);

      if (item.group) {
        let group = groups.get(item.group);
        if (!group) {
          group = document.createElement("optgroup");
          group.label = item.group;
          groups.set(item.group, group);
          select.append(group);
        }
        group.append(option);
      } else {
        select.append(option);
      }
    }
    return;
  }

  if (!datalist) return;
  datalist.replaceChildren();
  for (const item of normalized) {
    const option = document.createElement("option");
    option.value = item.value;
    if (item.label !== item.value) option.label = item.label;
    if (item.data) Object.assign(option.dataset, item.data);
    datalist.append(option);
  }
}

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
export function appendCatalogOption(combobox, item, { selected = false } = {}) {
  const source = selectSourceOf(combobox);
  const option =
    item.option instanceof HTMLOptionElement
      ? item.option
      : new Option(item.label, item.value, false, selected);
  if (!(item.option instanceof HTMLOptionElement)) {
    option.disabled = Boolean(item.disabled);
    if (item.data) Object.assign(option.dataset, item.data);
    if (item.group) {
      let group = /** @type {HTMLOptGroupElement | undefined} */ (
        Array.from(source.children).find(
          (node) => node instanceof HTMLOptGroupElement && node.label === item.group,
        )
      );
      if (!group) {
        group = document.createElement("optgroup");
        group.label = item.group;
        source.append(group);
      }
      group.append(option);
    } else {
      source.add(option);
    }
  }
  if (selected && !option.selected) option.selected = true;
  return option;
}
