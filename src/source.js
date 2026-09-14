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
 * Whether a native option is ineligible: its own `disabled` flag or a
 * disabled parent `<optgroup>`. Single source of truth reused by catalogue
 * reads, value resolution and selection commits.
 * @param {HTMLOptionElement} option
 * @returns {boolean}
 */
export function isOptionDisabled(option) {
  return (
    option.disabled ||
    (option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.disabled : false)
  );
}

/**
 * Canonical conversion of one native `<option>`: the element is the identity,
 * `option.label` is the native display label (never `textContent`), and
 * `data-*` is application metadata exposed via `item.data` only.
 * @param {HTMLOptionElement} option
 * @returns {import("./helpers.js").ComboboxItem}
 */
export function optionToItem(option) {
  return {
    value: option.value,
    label: option.label,
    // An empty title carries no meaning and is not materialized.
    title: option.title || undefined,
    disabled: isOptionDisabled(option),
    selected: option.selected,
    group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : "",
    option,
    data: { ...option.dataset },
  };
}
/**
 * Read the native catalogue as canonical items: the select's
 * `<option>`/`<optgroup>` set, or the `<datalist>` for an
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
      .map((option) => optionToItem(option));
  }

  if (!datalist) return [];
  return Array.from(datalist.options).map((option) => ({
    value: option.value,
    label: option.label || option.value,
    disabled: option.disabled,
    selected: source.value === option.value,
    group: "",
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
        option.value === wanted &&
        !isOptionDisabled(option) &&
        (combobox.isMultiple && option.selected) === false,
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
 * `<option>`/`<optgroup>` set, keeping the currently selected option *nodes*
 * themselves when `preserveSelected` (defaults to select-backed) and
 * re-appending a single-select empty placeholder. Keeping the nodes preserves
 * option identity (references held by `remove()`/`move()`/`selectionOrder`
 * stay valid), `data-*` metadata and the authored `defaultSelected` reset
 * baseline — a dynamic selection never becomes the form-reset default. No
 * value-based dedupe: catalogue identity is the `<option>` element, so
 * repeated payload values map to their own options.
 * For an input combobox the `<datalist>` is rebuilt from the payload.
 * @param {import("./combobox.js").Combobox} combobox
 * @param {import("./helpers.js").ComboboxItem[]} normalized
 * @param {{ preserveSelected?: boolean }} [options]
 * @returns {void}
 */
export function replaceCatalogue(combobox, normalized, { preserveSelected = combobox.isSelect } = {}) {
  const { isSelect, isMultiple, options, datalist } = combobox;

  if (isSelect) {
    const select = selectSourceOf(combobox);
    // Preserve the selected nodes themselves (identity, dataset, title,
    // disabled state and defaultSelected all survive). Group labels and the
    // disabled state are read before the rebuild detaches everything, so
    // preserved nodes land back under an equivalent group.
    const preserved = preserveSelected ? Array.from(select.selectedOptions) : [];
    const preservedSet = new Set(preserved);
    /** @type {import("./helpers.js").ComboboxItem[]} */
    const preservedItems = preserved.map((option) => ({
      value: option.value,
      label: option.label,
      selected: option.selected,
      disabled: isOptionDisabled(option),
      group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : "",
      option,
      data: { ...option.dataset },
    }));
    // A disabled optgroup disables its options natively; record the state so
    // rebuilt groups keep it.
    const groupDisabled = new Map();
    for (const group of select.querySelectorAll("optgroup")) groupDisabled.set(group.label, group.disabled);

    const emptyOption = Array.from(select.options).find((option) => !option.value);
    select.replaceChildren();

    // Adopt one preserved node per selected element, then fresh nodes for the
    // new catalogue. Normalized `selected` flags select fresh nodes only;
    // preserved nodes keep their live `selected` state untouched.
    /** @type {import("./helpers.js").ComboboxItem[]} */
    const catalog = [...preservedItems, ...normalized];

    const groups = new Map();
    /**
     * @param {HTMLOptionElement} option
     * @param {string} groupLabel
     */
    const appendOption = (option, groupLabel) => {
      if (groupLabel) {
        let group = groups.get(groupLabel);
        if (!group) {
          group = document.createElement("optgroup");
          group.label = groupLabel;
          if (groupDisabled.get(groupLabel)) group.disabled = true;
          groups.set(groupLabel, group);
          select.append(group);
        }
        group.append(option);
      } else {
        select.append(option);
      }
    };

    if (emptyOption && !isMultiple && !preservedSet.has(emptyOption)) appendOption(emptyOption, "");
    for (const item of catalog) {
      if (item.option instanceof HTMLOptionElement) {
        appendOption(item.option, item.group || "");
        continue;
      }
      // An empty value is a legitimate option only when allowEmptyOption
      // admits it; otherwise it would shadow the collection's real entries.
      if (!item.value && !options.allowEmptyOption) continue;
      const option = new Option(item.label, item.value, Boolean(item.selected), Boolean(item.selected));
      option.disabled = Boolean(item.disabled);
      if (item.title) option.title = item.title;
      if (item.data) Object.assign(option.dataset, item.data);
      appendOption(option, item.group || "");
    }
    // Drop remembered order entries whose nodes left the catalogue; newly
    // selected fresh nodes join in catalogue order.
    combobox.selectionOrder = combobox.selectionOrder.filter((option) => preservedSet.has(option));
    for (const option of select.selectedOptions) {
      if (!combobox.selectionOrder.includes(option)) combobox.selectionOrder.push(option);
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
    if (item.title) option.title = item.title;
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
