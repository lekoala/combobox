import {
  fuzzyMatch,
  moveValueInOrder,
  normalize,
  rankByScore,
  reconcileSelected,
  splitTokens,
  toItem,
} from "./helpers.js";

const instances = new WeakMap();
let uid = 0;
let openCombobox = null;

// Generated UI text, centralized for i18n. `render` is the DOM-representation
// seam and stays separate; behavior options are above it.
const DEFAULT_MESSAGES = {
  noResults: "No results",
  loading: "Loading…",
  loadError: "Failed to load results",
  create: (query) => `Create “${query}”`,
  position: (label, position, total) => `${label} position ${position} of ${total}`,
};

const DEFAULTS = {
  create: false,
  allowEmptyOption: false,
  placeholder: "Search…",
  messages: DEFAULT_MESSAGES,
  match: "includes", // Open UI-aligned: includes | startswith | fuzzy | pattern | function
  searchFields: ["label"],
  minChars: 0,
  load: null,
  loadOnEmpty: false,
  shouldLoad: null,
  debounce: 200,
  createFilter: null,
  maxItems: 0, // 0 = unlimited: cap on selected values, never on rendering
  maxOptions: 0, // 0 = unlimited: cap on rendered options only
  separators: [],
  tokenize: null, // custom seam: (value, ctx) => { tokens: string[], rest?: string }
  closeOnSelect: undefined, // default: single closes, multiple stays open
  createOnBlur: false,
  autoselectFirst: false,
  tabSelect: false, // when true, Tab commits the active option like Enter
  labelField: undefined,
  valueField: undefined,
  guards: {}, // async add/remove/clear guards
  selectionOrder: "source", // source | selected
  observeSource: false, // opt-in MutationObserver -> debounced sync()
  sort: null,
  score: null,
  filter: null,
  render: {},
};

function supportsModernCombobox() {
  return (
    typeof HTMLElement.prototype.showPopover === "function" &&
    typeof HTMLElement.prototype.hidePopover === "function" &&
    CSS.supports("position-area: bottom") &&
    CSS.supports("inline-size: anchor-size(width)") &&
    CSS.supports("position-try: flip-block")
  );
}

function hasOwn(object, key) {
  return Object.hasOwn(object, key);
}

function emit(target, type, detail = {}, { cancelable = false } = {}) {
  const event = new CustomEvent(type, {
    bubbles: true,
    cancelable,
    detail,
  });

  // Open UI's proposed beforefilter exposes event.query directly. Mirror that
  // now while retaining CustomEvent.detail for ordinary library consumers.
  if (hasOwn(detail, "query")) {
    Object.defineProperty(event, "query", {
      configurable: true,
      enumerable: true,
      value: detail.query,
    });
  }

  target.dispatchEvent(event);
  return event;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function setContent(element, content) {
  element.replaceChildren();
  if (content instanceof Node) {
    element.append(content);
  } else if (content !== null && content !== undefined) {
    // Strings are text by default. Rich HTML should be returned as DOM Nodes,
    // which keeps the default renderer safe without a global allowHtml mode.
    element.textContent = String(content);
  }
}

/**
 * Snapshot a set of attributes on an element we do not own so `dispose()` can
 * restore the authored state exactly. The returned object has a `restore()`
 * method: attributes that were absent are removed, those that had a value are
 * written back. This makes upgrade/dispose symmetry impossible to forget.
 */
function captureAttributes(element, names) {
  const original = new Map(names.map((name) => [name, element.getAttribute(name)]));
  return {
    restore() {
      for (const [name, value] of original) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    },
  };
}

// Every attribute the engine may touch on an input it does not own (the source
// input for input+datalist, or an authored filter input). Snapshot before
// mutation, restore on dispose().
const INPUT_ATTRS = [
  "list",
  "name",
  "type",
  "autocomplete",
  "spellcheck",
  "placeholder",
  "hidden",
  "tabindex",
  "role",
  "aria-autocomplete",
  "aria-expanded",
  "aria-controls",
  "aria-activedescendant",
  "aria-invalid",
  "aria-label",
  "aria-labelledby",
  "aria-required",
  "aria-describedby",
];

/**
 * Native-first combobox / filterable-select skeleton.
 *
 * The source element is always the form-value owner:
 * - <input list>: the original input owns arbitrary text.
 * - <select>: the original select owns one constrained value.
 * - <select multiple>: selected <option>s own multiple values.
 *
 * The modern select filter input is a separate, unnamed interaction control.
 * It may be generated, or supplied explicitly through a liaison attribute on
 * the input itself: <input filter="select-id" hidden>.
 */
export class Combobox {
  static supported = supportsModernCombobox();

  /**
   * Discover and enhance combobox sources. This is a discovery/creation API
   * only: an element that already has an instance is returned as-is and never
   * reconfigured with new options (idempotence is unambiguous).
   *
   * Valid shapes:
   *   init("selector") / init("selector", options)
   *   init(root, "selector") / init(root, "selector", options)
   *   init([element, ...], options) / init(nodeList, options)
   *
   * Discovery is always explicit: a string root is a CSS selector, an
   * Element/Document root is a scope for the selector, and any other iterable
   * is a list of source elements. An element root without a selector and a bare
   * init() discover nothing (there is no implicit `data-*` marker). Unsupported
   * elements inside collections are ignored without invalidating the call.
   * Returns the array of Combobox instances.
   */
  static init(rootOrSelector = document, selectorOrOptions = null, maybeOptions = {}) {
    const targets = [];
    let options = {};

    const isNode = (value) => value instanceof Node;
    const isPlainObject = (value) => value !== null && typeof value === "object" && !isNode(value);

    if (typeof rootOrSelector === "string") {
      targets.push(...document.querySelectorAll(rootOrSelector));
      options = isPlainObject(selectorOrOptions) ? selectorOrOptions : {};
    } else if (isNode(rootOrSelector)) {
      const root = rootOrSelector;
      if (typeof selectorOrOptions === "string") {
        targets.push(...root.querySelectorAll(selectorOrOptions));
        options = maybeOptions;
      } else {
        // An element root needs an explicit selector; options alone do not pick
        // targets. This keeps `data-*` discovery out of the API.
        options = isPlainObject(selectorOrOptions) ? selectorOrOptions : {};
      }
    } else {
      targets.push(...Array.from(rootOrSelector ?? []));
      options = isPlainObject(selectorOrOptions) ? selectorOrOptions : {};
    }

    const instances = [];
    for (const element of targets) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) continue;
      const instance = Combobox.getOrCreateInstance(element, options);
      if (instance && !instances.includes(instance)) instances.push(instance);
    }
    return instances;
  }

  static getInstance(element) {
    return instances.get(element) ?? null;
  }

  static getOrCreateInstance(element, options = {}) {
    return Combobox.getInstance(element) ?? new Combobox(element, options);
  }

  constructor(element, options = {}) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      throw new TypeError("Combobox expects an input or select element");
    }

    this.source = element;
    this.isSelect = element instanceof HTMLSelectElement;
    this.isMultiple = this.isSelect && element.multiple;
    this.abortController = new AbortController();
    this.loadController = null;
    this.activeIndex = -1;
    this.filteredItems = [];
    // Remote/custom results are deliberately transient. The native select is
    // the selection/value owner, not a cache for every server result.
    this.results = null;
    // For a <select>, option identity is the HTMLOptionElement itself; a
    // duplicate `value` does not collapse identities. `selectionOrder` holds
    // option references (in source order initially), `value` is payload only.
    this.selectionOrder = this.isSelect ? Array.from(element.selectedOptions) : [];
    this._chipOptions = new WeakMap();
    this.searchGeneration = 0;
    this.nextCursor = null;
    this.loading = false;
    this.loadError = null;
    this.query = "";
    this.id = ++uid;
    this.mode = options.mode === "fallback" || !Combobox.supported ? "fallback" : "enhanced";
    this.anchorName = `--combobox-${this.id}`;
    this.suppressReopen = false;
    this.composing = false;
    this._sourceObserver = null;
    this._sourceSyncTimer = null;

    this.explicitOptions = options;
    this.options = {
      ...DEFAULTS,
      ...options,
      messages: {
        ...DEFAULT_MESSAGES,
        ...(options.messages || {}),
      },
      render: {
        ...DEFAULTS.render,
        ...(options.render || {}),
      },
    };

    this.original = {
      // explicit filter input
      filterInputPlaceholder: null,
      // detached datalist position marker
      datalistPlaceholder: null,
      // <label> elements whose id the engine invented for aria-labelledby
      inventedLabels: [],
    };
    // Attribute snapshots so dispose() restores anything the engine touched.
    this.sourceSnapshot = null;
    this.inputSnapshot = null;

    this.datalist = null;
    this.boundLabels = [];
    this.ownsInput = false;
    this.fallbackControl = null;

    if (this.mode === "fallback") {
      this.#initFallback();
    } else {
      // Registration is transactional: an element whose init throws (e.g. a
      // broken datalist) must not stay associated with a half-built instance.
      try {
        if (this.isSelect) this.#enhanceSelect();
        else this.#enhanceInput();

        this.#createPopover();
        this.#bind();
        this.refresh();
        this.#watchSource();
      } catch (error) {
        this.dispose();
        throw error;
      }
    }

    instances.set(element, this);
  }

  /* ---------------------------------------------------------------------- */
  /* Progressive fallback                                                  */
  /* ---------------------------------------------------------------------- */

  #initFallback() {
    // Native input+datalist and native selects already work. The only cheap
    // enhancement worth retaining is creation: keep the native multiple
    // select visible and add an unnamed text input + Add button.
    if (!this.isSelect || !this.options.create) return;

    const control = document.createElement("div");
    control.className = "cb-fallback-create";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "cb-fallback-input";
    input.placeholder = this.options.placeholder;
    input.autocomplete = "off";
    input.setAttribute("aria-label", this.options.placeholder);
    // Deliberately no name: the select remains the only successful control.

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cb-fallback-add";
    button.textContent = "Add";

    const add = async () => {
      const label = input.value.trim();
      if (!this.#canCreate(label)) return;
      await this.#createFallbackOption(label);
      input.value = "";
      input.focus();
    };

    button.addEventListener("click", add, { signal: this.abortController.signal });
    input.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          add();
        }
      },
      { signal: this.abortController.signal },
    );

    control.append(input, button);
    this.source.after(control);
    this.fallbackControl = control;
  }

  async #createFallbackOption(label) {
    const guard = await this.#runGuard("add", { label });
    if (!guard.ok) return null;

    const before = emit(
      this.source,
      "combobox:beforecreate",
      { combobox: this, label },
      { cancelable: true },
    );
    if (before.defaultPrevented) return null;

    let created = { value: label, label };
    try {
      if (typeof this.options.create === "function") {
        const result = await this.options.create(label, {
          signal: this.abortController.signal,
          combobox: this,
          source: this.source,
          fallback: true,
        });
        if (!result) return null;
        created = toItem(result, this.#fields());
      }

      let option = this.#findOption(created.value);
      if (!option) {
        option = new Option(created.label, created.value, true, true);
        if (created.data) Object.assign(option.dataset, created.data);
        this.source.add(option);
      } else {
        option.selected = true;
      }
      this.#rememberSelection(option);
      this.#dispatchNativeValueEvents();
      emit(this.source, "combobox:create", { combobox: this, item: { ...created, option, selected: true } });
      return option;
    } catch (error) {
      if (error?.name !== "AbortError") {
        emit(this.source, "combobox:createerror", { combobox: this, label, error });
      }
      return null;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Source adapters                                                        */
  /* ---------------------------------------------------------------------- */

  #enhanceInput() {
    const listId = this.source.getAttribute("list");
    if (!listId) throw new TypeError("Input combobox expects an input with a datalist");

    this.datalist = document.getElementById(listId);
    if (!(this.datalist instanceof HTMLDataListElement)) {
      throw new TypeError(`No datalist found for #${listId}`);
    }

    this.inputSnapshot = captureAttributes(this.source, INPUT_ATTRS);

    // In enhanced mode the datalist is a data source only. Detach it so the UA
    // picker can never flash/race our popover. dispose() restores it exactly.
    this.source.removeAttribute("list");
    this.source.autocomplete = "off";
    this.original.datalistPlaceholder = document.createComment(`combobox-datalist-${this.id}`);
    this.datalist.before(this.original.datalistPlaceholder);
    this.datalist.remove();

    this.input = this.source;
    this.input.classList.add("cb-text-control");
    this.input.style.setProperty("anchor-name", this.anchorName);
  }

  #enhanceSelect() {
    this.source.classList.add("cb-source-hidden");
    this.sourceSnapshot = captureAttributes(this.source, ["aria-hidden", "tabindex"]);
    this.source.tabIndex = -1;
    this.source.setAttribute("aria-hidden", "true");

    this.control = document.createElement("div");
    this.control.className = `cb-control ${this.isMultiple ? "cb-control-multiple" : "cb-control-single"}`;
    this.control.style.setProperty("anchor-name", this.anchorName);

    this.chips = document.createElement("span");
    this.chips.className = "cb-chips";
    this.control.append(this.chips);

    this.input = this.#resolveFilterInput();
    this.input.classList.add("cb-input");
    this.input.type = "text";
    this.input.autocomplete = "off";
    this.input.spellcheck = false;
    this.input.removeAttribute("name");

    if (!this.input.placeholder) this.input.placeholder = this.options.placeholder;

    this.#copyAccessibleName();
    this.control.append(this.input);
    this.source.after(this.control);
  }

  #resolveFilterInput() {
    let input = null;
    // An author-supplied filter input is declared with a liaison attribute on
    // the input itself: <input filter="select-id">. Configuration stays on
    // <combo-box> attributes or JS — the source select never carries data-*.
    if (this.source.id) {
      input = document.querySelector(`input[filter="${CSS.escape(this.source.id)}"]`);
    }

    if (input instanceof HTMLInputElement) {
      this.inputSnapshot = captureAttributes(input, INPUT_ATTRS);
      this.original.filterInputPlaceholder = document.createComment(`combobox-filter-input-${this.id}`);
      input.before(this.original.filterInputPlaceholder);
      input.hidden = false;
      return input;
    }

    this.ownsInput = true;
    // An owned control is disposed with the wrapper: there is nothing to restore.
    this.inputSnapshot = null;
    return document.createElement("input");
  }

  #copyAccessibleName() {
    const labels = [];
    if (this.source.id) {
      labels.push(...document.querySelectorAll(`label[for="${CSS.escape(this.source.id)}"]`));
    }
    // A label wrapping the select (no `for`) still names it accessibly. Clicks
    // are already redirected to the filter input by the focus forwarding on the
    // hidden select; here we propagate the name itself.
    const wrapped = this.source.closest("label");
    if (wrapped) labels.push(wrapped);

    const seen = new Set();
    this.boundLabels = labels.filter((label) => {
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });

    const labelIds = this.boundLabels.map((label, index) => {
      if (!label.id) {
        label.id = `combobox-label-${this.id}-${index}`;
        this.original.inventedLabels.push({ label, id: label.id });
      }
      return label.id;
    });
    if (labelIds.length) this.input.setAttribute("aria-labelledby", labelIds.join(" "));

    if (!this.input.hasAttribute("aria-labelledby") && this.source.getAttribute("aria-label")) {
      this.input.setAttribute("aria-label", this.source.getAttribute("aria-label"));
    }
    if (this.source.required) this.input.setAttribute("aria-required", "true");
    if (this.source.getAttribute("aria-describedby")) {
      this.input.setAttribute("aria-describedby", this.source.getAttribute("aria-describedby"));
    }
  }

  #sourceItems() {
    if (this.isSelect) {
      return Array.from(this.source.options)
        .filter((option) => option.value || this.options.allowEmptyOption)
        .map((option) => ({
          value: option.value,
          label: option.textContent.trim(),
          disabled: option.disabled || option.parentElement?.disabled === true,
          selected: option.selected,
          group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : "",
          option,
          data: { ...option.dataset },
        }));
    }

    return Array.from(this.datalist.options).map((option) => ({
      value: option.value,
      label: option.label || option.value,
      disabled: option.disabled,
      selected: this.source.value === option.value,
      group: option.dataset.group || "",
      option,
      data: { ...option.dataset },
    }));
  }

  #items() {
    if (!this.results) return this.#sourceItems();

    if (!this.isSelect) return this.results;

    return this.results.map((item) => {
      // Option identity is the element, never the value string, so transient
      // items resolve their selected state through their exact option. A plain
      // value falls back to the first matching source option.
      const option = item.option || this.#findOption(item.value);
      return { ...item, selected: option?.selected ?? false, option };
    });
  }

  /** Map data objects to canonical items when label/value fields are set. */
  #fields() {
    const { labelField, valueField } = this.options;
    return labelField || valueField ? { labelField, valueField } : null;
  }

  // maxOptions is a rendering cap only: the result store (filteredItems) may
  // be large, but at most maxOptions options are ever rendered/navigated.
  get visibleItems() {
    return this.options.maxOptions > 0
      ? this.filteredItems.slice(0, this.options.maxOptions)
      : this.filteredItems;
  }

  /** Set transient picker results without turning the select into a remote cache. */
  setResults(items) {
    this.results = Array.from(items || [], (item) => toItem(item, this.#fields())).filter(Boolean);
    return this;
  }

  clearResults() {
    this.results = null;
    // A failed load is scoped to the newest search: any later local query,
    // successful load or explicit clear drops the stale error row.
    this.loadError = null;
    return this;
  }

  #findOption(value) {
    if (!this.isSelect) return null;
    return Array.from(this.source.options).find((option) => option.value === String(value)) || null;
  }

  /**
   * Resolve a plain value to the option a fresh selection should land on: the
   * first non-disabled match, skipping already-selected options in multiple
   * mode (each native option is selected at most once; identical values on
   * distinct options are distinct choices). Single-select returns the first
   * non-disabled match regardless of the current selection.
   */
  #findSelectableOption(value) {
    if (!this.isSelect) return null;
    const wanted = String(value);
    return (
      Array.from(this.source.options).find(
        (option) =>
          option.value === wanted && !option.disabled && (this.isMultiple && option.selected) === false,
      ) || null
    );
  }

  /** Match a token to an existing native option by value or label. */
  #findCreateMatch(label) {
    const lookup = normalize(label);
    for (const item of this.#sourceItems()) {
      if (normalize(item.value) === lookup || normalize(item.label) === lookup) return item;
    }
    return null;
  }

  /** Replace the native catalogue explicitly. Prefer setResults() for remote search. */
  setOptions(items, { preserveSelected = this.isSelect } = {}) {
    const normalized = Array.from(items || [], (item) => toItem(item, this.#fields())).filter(Boolean);

    if (this.isSelect) {
      const preserved = preserveSelected
        ? Array.from(this.source.selectedOptions).map((option) => ({
            value: option.value,
            label: option.textContent.trim(),
            selected: true,
            disabled: option.disabled,
            group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : "",
          }))
        : [];

      const emptyOption = Array.from(this.source.options).find((option) => !option.value);
      this.source.replaceChildren();
      if (emptyOption && !this.isMultiple) this.source.append(emptyOption);

      // No value-based dedupe: catalogue identity is the <option> element, so
      // repeated values in the payload map to their own options.
      const catalog = [...preserved, ...normalized];

      const groups = new Map();
      for (const item of catalog) {
        if (!item.value) continue;
        const option = new Option(item.label, item.value, Boolean(item.selected), Boolean(item.selected));
        option.disabled = Boolean(item.disabled);
        if (item.data) Object.assign(option.dataset, item.data);

        if (item.group) {
          let group = groups.get(item.group);
          if (!group) {
            group = document.createElement("optgroup");
            group.label = item.group;
            groups.set(item.group, group);
            this.source.append(group);
          }
          group.append(option);
        } else {
          this.source.append(option);
        }
      }
    } else {
      this.datalist.replaceChildren();
      for (const item of normalized) {
        const option = document.createElement("option");
        option.value = item.value;
        if (item.label !== item.value) option.label = item.label;
        if (item.data) Object.assign(option.dataset, item.data);
        this.datalist.append(option);
      }
    }

    this.clearResults();
    if (this.mode === "enhanced") this.refresh();
    this.#markEngineMutation();
    return this;
  }

  /** Explicit sync point for external DOM mutations. */
  sync() {
    // External source mutations invalidate transient results unless the caller
    // explicitly sets them again. This keeps catalogue and result-store roles clear.
    this.clearResults();
    this.refresh();
    return this;
  }

  /**
   * Engine-driven native mutations are never observed. The engine drops the
   * observer (discarding queued records and any pending debounced sync) right
   * before it re-renders from the native source, and reconnects on the next
   * microtask. A refresh after an engine mutation re-reads the source anyway,
   * so any external change that landed in the same window is still reflected.
   */
  #markEngineMutation() {
    if (this._sourceSyncTimer) {
      clearTimeout(this._sourceSyncTimer);
      this._sourceSyncTimer = null;
    }
    this._sourceObserver?.disconnect();
    this._sourceObserver = null;
    queueMicrotask(() => {
      if (instances.get(this.source) === this && this.options.observeSource && this.mode === "enhanced") {
        this.#watchSource();
      }
    });
  }

  /**
   * Opt-in automatic source sync. `observeSource` watches the native catalogue
   * (select's <option>/<optgroup> structure and selected/disabled/required/
   * readonly state; the detached datalist's <option> set for inputs) and calls
   * `sync()` once per debounced batch. `multiple` is deliberately not observed:
   * the value model is fixed at init time.
   */
  #watchSource() {
    if (!this.options.observeSource || this._sourceObserver) return;

    const config = this.isSelect
      ? {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["selected", "disabled", "required", "readonly"],
        }
      : {
          childList: true,
          attributes: true,
          attributeFilter: ["value", "disabled", "label"],
        };

    this._sourceObserver = new MutationObserver(() => this.#scheduleSourceSync());
    // For input+datalist the datalist is detached in enhanced mode; a
    // MutationObserver can observe a detached node just fine.
    this._sourceObserver.observe(this.isSelect ? this.source : this.datalist, config);
  }

  #scheduleSourceSync() {
    clearTimeout(this._sourceSyncTimer);
    this._sourceSyncTimer = setTimeout(() => {
      this._sourceSyncTimer = null;
      if (instances.get(this.source) !== this) return;
      this.sync();
    }, 50);
  }

  /* ---------------------------------------------------------------------- */
  /* Picker / interaction                                                   */
  /* ---------------------------------------------------------------------- */

  #createPopover() {
    this.popover = document.createElement("div");
    this.popover.className = "cb-popover";
    this.popover.popover = "manual";
    this.popover.style.setProperty("position-anchor", this.anchorName);

    this.listbox = document.createElement("div");
    this.listbox.className = "cb-listbox";
    this.listbox.role = "listbox";
    this.listbox.id = `combobox-listbox-${this.id}`;
    if (this.isMultiple) this.listbox.setAttribute("aria-multiselectable", "true");

    this.status = document.createElement("div");
    this.status.className = "cb-status";
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");

    this.popover.append(this.listbox, this.status);
    // Popover renders in the top layer, but a modal <dialog> makes everything
    // outside it (including a body-level popover) inert. Stay a descendant of
    // an ancestor dialog so the picker stays interactive inside showModal().
    const dialog = this.source.closest("dialog");
    (dialog || document.body).append(this.popover);

    // The popover renders in the top layer, outside the control's subtree, so
    // it cannot inherit the control's typography. Adopt the interaction
    // input's resolved font to avoid falling back to the page-level font.
    this.popover.style.font = getComputedStyle(this.input).font;

    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-expanded", "false");
    this.input.setAttribute("aria-controls", this.listbox.id);
  }

  #bind() {
    const signal = this.abortController.signal;

    // Persistent listeners go through #handleEvent so no per-render closure is
    // ever added. #renderList/#renderChips stay listener-free.
    this.input.addEventListener("focus", this, { signal });
    this.input.addEventListener("input", this, { signal });
    this.input.addEventListener("compositionstart", this, { signal });
    this.input.addEventListener("compositionend", this, { signal });
    this.input.addEventListener("keydown", this, { signal });
    this.input.addEventListener("blur", this, { signal });

    this.listbox.addEventListener("pointerdown", (event) => event.preventDefault(), { signal });
    this.listbox.addEventListener("pointermove", this, { signal });
    this.listbox.addEventListener("click", this, { signal });

    if (this.chips) {
      this.chips.addEventListener("keydown", this, { signal });
      this.chips.addEventListener("click", this, { signal });
    }

    this.control?.addEventListener("click", this, { signal });

    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.isOpen()) return;
        const path = event.composedPath();
        const control = this.isSelect ? this.control : this.input;
        if (path.includes(control) || path.includes(this.popover)) return;
        this.hide();
      },
      { capture: true, signal },
    );

    this.popover.addEventListener(
      "toggle",
      (event) => {
        const open = event.newState === "open";
        this.input.setAttribute("aria-expanded", String(open));
        emit(this.source, open ? "combobox:open" : "combobox:close", { combobox: this });
        if (!open) {
          this.#setActive(-1);
          if (this.isSelect && !this.isMultiple) this.#syncSingleLabel();
        }
      },
      { signal },
    );

    if (this.isSelect) {
      this.source.addEventListener("change", () => this.refresh(), { signal });
      this.source.addEventListener("focus", () => this.input.focus(), { signal });
      for (const label of this.boundLabels) {
        label.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            this.input.focus();
          },
          { signal },
        );
      }
      this.source.form?.addEventListener("reset", () => queueMicrotask(() => this.refresh()), { signal });
      if (
        this.isMultiple &&
        this.options.selectionOrder === "selected" &&
        this.source.name &&
        this.source.form
      ) {
        this.source.form.addEventListener(
          "formdata",
          (event) => {
            event.formData.delete(this.source.name);
            for (const value of this.getSelectedValues()) event.formData.append(this.source.name, value);
          },
          { signal },
        );
      }
      this.source.addEventListener(
        "invalid",
        (event) => {
          event.preventDefault();
          this.input.setAttribute("aria-invalid", "true");
          this.input.focus();
        },
        { signal },
      );
    }
  }

  /** Single entry point for all listeners bound with `this` as the handler. */
  handleEvent(event) {
    if (event.currentTarget === this.input) return this.#onInputEvent(event);
    if (event.currentTarget === this.control) return this.#onControlEvent(event);
    if (event.currentTarget === this.listbox) return this.#onListboxEvent(event);
    if (event.currentTarget === this.chips) return this.#onChipsEvent(event);
  }

  #onInputEvent(event) {
    switch (event.type) {
      case "focus": {
        if (this.isSelect && !this.isMultiple && this.source.selectedOptions.length) this.input.select();
        const query = this.isSelect && !this.isMultiple ? "" : this.input.value;
        this.search(query, { show: true, reason: "focus" });
        return;
      }
      case "input": {
        // Separator tokens are consumed as they complete (typing or paste).
        // IME composition feeds search but never tokenizes/creates.
        if (this.isMultiple && !event.isComposing && this.#separatorsActive()) {
          void this.#handleTokenInput();
          return;
        }
        this.search(this.input.value, { show: true, reason: "input" });
        return;
      }
      case "compositionstart":
        this.composing = true;
        return;
      case "compositionend":
        this.composing = false;
        return;
      case "keydown":
        return this.#onInputKeyDown(event);
      case "blur":
        return this.#onInputBlur(event);
    }
  }

  #onControlEvent(event) {
    if (event.target.closest("button")) return;
    this.input.focus();
  }

  #onListboxEvent(event) {
    if (event.type === "pointermove") {
      const option = event.target.closest(".cb-option[data-index]");
      if (option) this.#setActive(Number(option.dataset.index));
      return;
    }
    if (event.type === "click") {
      const option = event.target.closest(".cb-option");
      if (!option) return;
      if (option.classList.contains("cb-create")) {
        const query = this.input.value.trim();
        if (query) void this.#createItem(query);
        return;
      }
      const item = this.visibleItems[Number(option.dataset.index)];
      if (item) this.#selectItem(item);
    }
  }

  #onChipsEvent(event) {
    if (event.type === "click") {
      const remove = event.target.closest(".cb-chip-remove");
      if (!remove) return;
      const chip = remove.closest(".cb-chip");
      if (!chip) return;
      // The chip's exact option is authoritative (duplicate values share a
      // data-value but never an option). data-value is only a fallback.
      const option = this._chipOptions.get(chip);
      void this.remove(option ?? chip.dataset.value).then((removed) => {
        if (removed) this.input.focus();
      });
      return;
    }
    if (event.type === "keydown") {
      const chip = event.target.closest(".cb-chip");
      if (!chip) return;
      const option = this._chipOptions.get(chip);
      const item = option
        ? this.getSelectedItems().find((entry) => entry.option === option) || {
            value: option.value,
            label: option.textContent.trim(),
            option,
          }
        : { value: chip.dataset.value, label: chip.dataset.value };
      this.#onChipKeyDown(event, item);
    }
  }

  #onInputBlur() {
    queueMicrotask(async () => {
      const active = document.activeElement;
      // Blur caused by internal interaction (picker click, adornment,
      // chip removal, clear) never closes and never blur-creates.
      const stillInside =
        active === this.input ||
        (this.popover?.contains(active) ?? false) ||
        (this.control && active && this.control.contains(active));
      if (this.isOpen() && stillInside) return;

      if (this.isOpen() || this.options.createOnBlur) {
        if (this.isSelect && this.isMultiple && this.options.createOnBlur && !this.composing) {
          const value = this.input.value;
          this.suppressReopen = true;
          try {
            if (this.#separatorsActive()) {
              const result = await this.#processTokens(value, { final: true });
              if (result?.consumed) this.input.value = result.rest;
            } else if (value.trim()) {
              this.input.value = "";
              await this.#createItem(value.trim());
            }
          } finally {
            this.suppressReopen = false;
          }
          this.refresh();
        }
        if (!this.isMultiple) this.#syncSingleLabel();
        this.hide();
      }
    });
  }

  #onInputKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!this.isOpen()) this.search(this.input.value, { show: true, reason: "keyboard" });
      this.#moveActive(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!this.isOpen()) this.search(this.input.value, { show: true, reason: "keyboard" });
      this.#moveActive(-1);
      return;
    }

    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      if (!this.isOpen()) this.search(this.input.value, { show: true, reason: "keyboard" });
      const down = event.key === "PageDown";
      const base = this.activeIndex < 0 ? (down ? -1 : 0) : this.activeIndex;
      const distance = base + (down ? this.#pageSize() : -this.#pageSize());
      this.#setActive(this.#nearestSelectable(distance, down ? 1 : -1));
      return;
    }

    if (event.key === "Enter" && this.isOpen()) {
      // IME composition owns the key: returning first never steals Enter from a
      // composing input, and never preventDefault()s it.
      if (event.isComposing || this.composing) return;
      event.preventDefault();
      if (this.isMultiple && this.#separatorsActive()) {
        void this.#commitEnterTokens();
        return;
      }
      const active = this.visibleItems[this.activeIndex];
      if (active) this.#selectItem(active);
      else if (this.#canCreate(this.input.value)) void this.#createItem(this.input.value.trim());
      return;
    }

    // tabSelect deals with an open picker, not with the open state itself.
    // preventDefault() only fires when a commit is actually possible; otherwise
    // Tab keeps its native focus-traversal behavior. IME composition is never a
    // commit (this.composing mirrors the blur handler) and always falls through
    // to native Tab. An open top-layer popover traps sequential focus in some
    // engines (Firefox keeps focus inside an open manual popover), so whenever
    // Tab does not commit it still closes the picker before letting traversal
    // proceed — without ever preventDefault()ing.
    if (event.key === "Tab" && this.isOpen()) {
      if (this.options.tabSelect) {
        if (event.isComposing || this.composing) return;
        if (this.isMultiple && this.#separatorsActive() && this.input.value.trim()) {
          event.preventDefault();
          void this.#commitEnterTokens();
          return;
        }
        const active = this.visibleItems[this.activeIndex];
        if (active) {
          event.preventDefault();
          this.#selectItem(active);
          return;
        }
        if (this.#canCreate(this.input.value)) {
          event.preventDefault();
          void this.#createItem(this.input.value.trim());
          return;
        }
        this.hide();
        return;
      }
      this.hide();
      return;
    }

    if (event.key === "Escape" && this.isOpen()) {
      event.preventDefault();
      this.hide();
      return;
    }

    if (event.key === "ArrowLeft" && this.isMultiple && !this.input.value) {
      const chips = Array.from(this.chips?.querySelectorAll(".cb-chip") || []);
      if (chips.length) {
        event.preventDefault();
        chips[chips.length - 1].focus();
        return;
      }
    }

    if (
      event.key === "Backspace" &&
      this.isMultiple &&
      !this.input.value &&
      this.source.selectedOptions.length
    ) {
      const selected = this.#selectedOptionsInOrder();
      const last = selected[selected.length - 1];
      if (last && !last.disabled) void this.remove(last);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Filtering / loading                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * Run the normal filtering pipeline: beforefilter -> optional load -> filter.
   */
  async search(query = "", { show = false, reason = "api" } = {}) {
    if (this.mode !== "enhanced") return;

    const generation = ++this.searchGeneration;
    this.query = String(query ?? "");

    const before = emit(
      this.input,
      "beforefilter",
      {
        query: this.query,
        combobox: this,
        source: this.source,
        reason,
      },
      { cancelable: true },
    );

    // Open UI semantics: cancel beforefilter and script fully owns filtering.
    if (before.defaultPrevented) return;

    if (this.#shouldLoad(this.query)) {
      await this.#load(this.query, { debounce: reason === "input" });
      if (generation !== this.searchGeneration) return;
    } else {
      // A local query should not keep stale remote results around.
      if (typeof this.options.load === "function") this.clearResults();
    }

    this.#applyFilter(this.query);
    emit(this.input, "filter", {
      query: this.query,
      combobox: this,
      items: this.filteredItems,
      source: this.source,
    });

    if (show) this.show();
  }

  /**
   * Apply the local filter directly, without re-firing beforefilter or load.
   * This is the escape hatch intended for a canceled beforefilter handler:
   *   event.preventDefault();
   *   combobox.setResults(results).applyFilter(event.query, { show: true });
   */
  applyFilter(query = this.input?.value ?? "", { show = false } = {}) {
    if (this.mode !== "enhanced") return this;
    this.query = String(query ?? "");
    this.#applyFilter(this.query);
    emit(this.input, "filter", {
      query: this.query,
      combobox: this,
      items: this.filteredItems,
      source: this.source,
      manual: true,
    });
    if (show) this.show();
    return this;
  }

  #shouldLoad(query) {
    if (
      typeof this.options.shouldLoad === "function" &&
      !this.options.shouldLoad(query, { combobox: this, source: this.source, input: this.input })
    ) {
      return false;
    }
    return (
      typeof this.options.load === "function" &&
      query.length >= Number(this.options.minChars || 0) &&
      (query.length > 0 || this.options.loadOnEmpty)
    );
  }

  async #load(query, { cursor = null, append = false, debounce = false } = {}) {
    this.loadController?.abort();
    this.loadController = new AbortController();
    const signal = this.loadController.signal;
    this.loadError = null;

    if (debounce && Number(this.options.debounce) > 0) {
      try {
        await wait(Number(this.options.debounce), signal);
      } catch {
        return;
      }
    }

    const before = emit(
      this.source,
      "combobox:beforeload",
      {
        query,
        cursor,
        combobox: this,
        signal,
      },
      { cancelable: true },
    );
    if (before.defaultPrevented) return;

    this.loading = true;
    this.#renderLoading();
    this.show();

    try {
      const result = await this.options.load(query, {
        signal,
        cursor,
        combobox: this,
        source: this.source,
        input: this.input,
      });
      if (signal.aborted) return;

      const items = Array.isArray(result) ? result : result?.items;
      if (items) {
        const merged = append && this.results ? [...this.results, ...items] : items;
        this.setResults(merged);
      }
      // Keep the cursor contract open for future paged loading without
      // implementing virtual/infinite scrolling in the core.
      this.nextCursor = Array.isArray(result) ? null : (result?.cursor ?? null);

      emit(this.source, "combobox:load", {
        query,
        combobox: this,
        result,
      });
    } catch (error) {
      if (signal.aborted || error?.name === "AbortError") return;
      // The error row mirrors loading: it replaces the list for this query and
      // is cleared by the next successful load or local search. Long-lived
      // selection lives on the native source and is untouched by a failed load.
      this.loadError = error;
      emit(this.source, "combobox:loaderror", {
        query,
        combobox: this,
        error,
      });
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  #applyFilter(query) {
    const items = this.#items();
    const lookup = normalize(query);

    let visible = items.filter((item) => {
      if (this.isMultiple && item.selected) return false;
      return this.#matches(item, query, lookup);
    });

    if (typeof this.options.filter === "function") {
      visible = visible.filter((item) => this.options.filter(item, query, { combobox: this }));
    }

    if (typeof this.options.score === "function") {
      visible = rankByScore(visible, (item, _index) => this.options.score(item, query, { combobox: this }));
    }

    if (typeof this.options.sort === "function") {
      visible.sort((a, b) => this.options.sort(a, b, query, { combobox: this }));
    }

    this.filteredItems = visible;

    // Mirror the proposed :filtered state on the actual source option so the
    // migration path to the platform primitive is explicit.
    const visibleOptions = new Set(visible.map((item) => item.option));
    for (const item of items) {
      item.option?.toggleAttribute("data-filtered", !visibleOptions.has(item.option));
    }

    this.#renderList();
    this.#setActive(
      this.options.autoselectFirst ? this.visibleItems.findIndex((item) => !item.disabled) : -1,
    );
  }

  #matches(item, query, lookup) {
    if (!query) return true;

    if (typeof this.options.match === "function") {
      return this.options.match(item, query, { combobox: this });
    }

    const fields = Array.isArray(this.options.searchFields)
      ? this.options.searchFields
      : [this.options.searchFields];
    const values = fields.map((field) => {
      if (field in item) return item[field];
      return item.data?.[field] ?? "";
    });
    const text = normalize(values.join(" "));
    switch (String(this.options.match).toLowerCase()) {
      case "startswith":
        return values.some((value) => normalize(value).startsWith(lookup));
      case "fuzzy":
        // Lightweight subsequence match over the already-normalized text. It
        // never re-ranks: original catalogue order is preserved.
        return fuzzyMatch(text, lookup);
      case "pattern":
        try {
          const pattern = new RegExp(query, "i");
          return values.some((value) => pattern.test(String(value ?? "")));
        } catch {
          return false;
        }
      default:
        return text.includes(lookup);
    }
  }

  #canCreate(label) {
    const value = String(label ?? "").trim();
    if (!this.isSelect || !this.options.create || !value) return false;
    if (
      this.options.maxItems > 0 &&
      this.isMultiple &&
      this.source.selectedOptions.length >= this.options.maxItems
    )
      return false;
    if (typeof this.options.createFilter === "function") {
      return (
        this.options.createFilter(value, { combobox: this, source: this.source, input: this.input }) !== false
      );
    }
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Rendering                                                              */
  /* ---------------------------------------------------------------------- */

  #renderList() {
    this.listbox.replaceChildren();
    this.status.textContent = "";

    if (this.loading) {
      this.#renderLoading();
      return;
    }

    if (this.loadError) {
      this.#renderError();
      return;
    }

    let previousGroup = null;
    for (const [index, item] of this.visibleItems.entries()) {
      if (item.group && item.group !== previousGroup) {
        const group = document.createElement("div");
        group.className = "cb-group";
        group.setAttribute("role", "presentation");
        setContent(group, this.options.render.group?.(item.group, { combobox: this }) ?? item.group);
        this.listbox.append(group);
        previousGroup = item.group;
      }

      const option = document.createElement("div");
      option.className = "cb-option";
      option.id = `combobox-option-${this.id}-${index}`;
      option.role = "option";
      option.tabIndex = -1;
      option.dataset.index = String(index);
      option.setAttribute("aria-selected", String(Boolean(item.selected)));
      // Preserve native <option title="…"> tooltips on the row.
      if (item.option?.title || item.title) option.title = item.option?.title || item.title;
      if (item.disabled) {
        option.setAttribute("aria-disabled", "true");
      }

      const rendered = this.options.render.option?.(item, {
        query: this.query,
        selected: item.selected,
        combobox: this,
      });
      const label = document.createElement("span");
      label.className = "cb-option-label";
      setContent(label, rendered ?? item.label);
      option.append(label);
      this.listbox.append(option);
    }

    if (!this.filteredItems.length) {
      if (this.#canCreate(this.input.value)) {
        const create = document.createElement("div");
        create.className = "cb-option cb-create";
        create.tabIndex = -1;
        create.role = "option";
        const query = this.input.value.trim();
        const rendered = this.options.render.create?.(query, { combobox: this });
        const createLabel = document.createElement("span");
        createLabel.className = "cb-option-label";
        setContent(createLabel, rendered ?? this.options.messages.create(query));
        create.append(createLabel);
        this.listbox.append(create);
      } else {
        const empty = document.createElement("div");
        empty.className = "cb-empty";
        const rendered = this.options.render.noResults?.(this.query, { combobox: this });
        setContent(empty, rendered ?? this.options.messages.noResults);
        this.listbox.append(empty);
        this.status.textContent = this.options.messages.noResults;
      }
    }
  }

  #renderLoading() {
    this.listbox.replaceChildren();
    // A loading/error row replaces the option list, so no row may stay active:
    // the previous aria-activedescendant would point at removed DOM.
    this.#setActive(-1);
    const loading = document.createElement("div");
    loading.className = "cb-empty cb-loading";
    const rendered = this.options.render.loading?.(this.query, { combobox: this });
    setContent(loading, rendered ?? this.options.messages.loading);
    this.listbox.append(loading);
    this.status.textContent = this.options.messages.loading;
  }

  #renderError() {
    this.listbox.replaceChildren();
    this.#setActive(-1);
    const error = document.createElement("div");
    error.className = "cb-empty cb-error";
    const rendered = this.options.render.error?.(this.query, { error: this.loadError, combobox: this });
    setContent(error, rendered ?? this.options.messages.loadError);
    this.listbox.append(error);
    this.status.textContent = this.options.messages.loadError;
  }

  #renderChips() {
    this.chips.replaceChildren();

    for (const option of this.#selectedOptionsInOrder()) {
      // An empty value is not a real selection unless allowEmptyOption is on;
      // the old-demo placeholder pattern (<option value="" selected disabled
      // hidden>) is never a chip.
      const placeholder = option.disabled && option.hidden;
      if (!option.value && (!this.options.allowEmptyOption || placeholder)) continue;

      const item = {
        value: option.value,
        label: option.textContent.trim(),
        selected: true,
        disabled: option.disabled,
        option,
        data: { ...option.dataset },
      };

      const chip = document.createElement("span");
      chip.className = "cb-chip";
      chip.tabIndex = -1;
      chip.dataset.value = item.value;
      // data-value is for inspection/debug only; the authoritative identity is
      // the option link kept in the #chipOptions WeakMap.
      this._chipOptions.set(chip, option);
      if (option.title) chip.title = option.title;

      const label = document.createElement("span");
      label.className = "cb-chip-label";
      const rendered = this.options.render.item?.(item, { combobox: this });
      setContent(label, rendered ?? item.label);
      chip.append(label);

      if (!option.disabled && !this.source.disabled) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "cb-chip-remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove ${item.label}`);
        chip.append(remove);
      }

      this.chips.append(chip);
    }
  }

  #selectedOptionsInOrder() {
    const selected = Array.from(this.source.selectedOptions);
    if (this.options.selectionOrder !== "selected") return selected;

    // Reconcile the remembered order against the actual selection. Options no
    // longer selected are dropped; options selected by external DOM mutations
    // and absent from the remembered order are appended in native order. Set
    // membership is object identity, so duplicate values stay distinct.
    return reconcileSelected(selected, this.selectionOrder);
  }

  #rememberSelection(option) {
    if (!this.selectionOrder.includes(option)) this.selectionOrder.push(option);
  }

  #forgetSelection(option) {
    const index = this.selectionOrder.indexOf(option);
    if (index >= 0) this.selectionOrder.splice(index, 1);
  }

  #onChipKeyDown(event, item) {
    const chips = Array.from(this.chips.querySelectorAll(".cb-chip"));
    const current = event.target.closest(".cb-chip");
    const index = chips.indexOf(current);

    // Ordered-mode keyboard reorder: Alt+Arrow/Home/End reorders a focused chip
    // without changing navigation keys. The gesture is consumed only when a real
    // move is possible; otherwise it falls through untouched (mirroring the
    // tabSelect "preventDefault only when a commit is possible" rule).
    if (event.altKey && index >= 0 && this.options.selectionOrder === "selected") {
      const target =
        event.key === "ArrowLeft"
          ? index - 1
          : event.key === "ArrowRight"
            ? index + 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? chips.length - 1
                : index;
      if (target !== index && target >= 0 && target < chips.length) {
        event.preventDefault();
        this.#reorderChip(item, target);
        return;
      }
    }

    if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
      let next = index;
      if (event.key === "ArrowLeft") next = Math.max(0, index - 1);
      if (event.key === "ArrowRight") next = index + 1;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = chips.length - 1;
      if (next >= chips.length) this.input.focus();
      else chips[next]?.focus();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      void this.remove(item.option ?? item.value).then((removed) => {
        if (!removed) return;
        queueMicrotask(() => {
          const remaining = Array.from(this.chips.querySelectorAll(".cb-chip"));
          remaining[Math.min(index, remaining.length - 1)]?.focus();
          if (!remaining.length) this.input.focus();
        });
      });
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.input.focus();
    }
  }

  /** Move a focused chip to an absolute position, keep it focused and announce. */
  #reorderChip(item, target) {
    const identity = item.option ?? item.value;
    if (!this.move(identity, target)) return;
    const chips = Array.from(this.chips.querySelectorAll(".cb-chip"));
    const chip = item.option
      ? chips.find((candidate) => this._chipOptions.get(candidate) === item.option)
      : chips.find((candidate) => candidate.dataset.value === item.value);
    chip?.focus();
    this.status.textContent = this.options.messages.position(
      item.label,
      chips.indexOf(chip) + 1,
      chips.length,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Selection / creation                                                   */
  /* ---------------------------------------------------------------------- */

  #moveActive(delta) {
    const visible = this.visibleItems;
    if (!visible.length) return;

    let next = this.activeIndex < 0 ? (delta > 0 ? -1 : 0) : this.activeIndex;
    for (let checked = 0; checked < visible.length; checked++) {
      next = (next + delta + visible.length) % visible.length;
      if (!visible[next].disabled) {
        this.#setActive(next);
        return;
      }
    }
  }

  /** Nearest selectable row at/after (`direction > 0`) or at/before an index, or -1. */
  #nearestSelectable(from, direction) {
    const visible = this.visibleItems;
    const len = visible.length;
    if (!len) return -1;
    from = Math.max(0, Math.min(from, len - 1));
    for (let i = from; i >= 0 && i < len; i += direction) {
      if (!visible[i]?.disabled) return i;
    }
    if (direction > 0) {
      for (let i = from - 1; i >= 0; i--) if (!visible[i]?.disabled) return i;
    } else {
      for (let i = from + 1; i < len; i++) if (!visible[i]?.disabled) return i;
    }
    return -1;
  }

  /** Rendered page height in selectable rows, used by PageUp/PageDown. */
  #pageSize() {
    const first = this.listbox.querySelector(".cb-option");
    if (!first) return 1;
    const row = first.offsetHeight || 48;
    const view = this.popover.clientHeight || 0;
    return Math.max(1, Math.floor(view / row));
  }

  #setActive(index) {
    if (index >= this.visibleItems.length) index = -1;
    this.activeIndex = index;

    for (const item of this.#sourceItems()) item.option?.removeAttribute("data-active-option");

    for (const option of this.listbox.querySelectorAll(".cb-option[data-index]")) {
      const active = Number(option.dataset.index) === index;
      option.toggleAttribute("data-active", active);
      if (active) {
        this.input.setAttribute("aria-activedescendant", option.id);
        this.visibleItems[index]?.option?.setAttribute("data-active-option", "");
        option.scrollIntoView({ block: "nearest" });
      }
    }

    if (index < 0) this.input.removeAttribute("aria-activedescendant");
  }

  #selectItem(item, { materialize = true } = {}) {
    if (item.disabled) return false;

    let option = null;
    if (this.isSelect) {
      // Option identity is authoritative: an exact item.option always wins over
      // a value lookup, so the third `value="2"` row a user picks never
      // collapses into the first one. A plain value resolves to the first
      // selectable match (unselected in multiple mode); materialization only
      // creates a native option when the value is genuinely absent.
      option =
        item.option instanceof HTMLOptionElement ? item.option : this.#findSelectableOption(item.value);
      // Materialize without preselection: the exact option is marked selected
      // below, so the unchanged check above can never short-circuit a real pick.
      if (!option && materialize) option = this.addOption(item);
      if (!option || option.disabled) return false;

      const unchanged = this.isMultiple ? option.selected : this.source.selectedOptions[0] === option;
      if (unchanged) {
        if (!this.isMultiple) this.hide();
        return false;
      }
      if (
        this.isMultiple &&
        this.options.maxItems > 0 &&
        this.source.selectedOptions.length >= this.options.maxItems
      ) {
        return false;
      }
      item = { ...item, option, selected: true };
    } else if (this.source.value === item.value) {
      this.hide();
      return false;
    }

    const before = emit(
      this.source,
      "combobox:beforeselect",
      {
        combobox: this,
        item,
      },
      { cancelable: true },
    );
    if (before.defaultPrevented) return false;

    if (this.isSelect) {
      if (this.isMultiple) {
        option.selected = true;
        this.#rememberSelection(option);
        this.input.value = "";
        this.#commit();
        if (this.suppressReopen) this.refresh();
        else if (this.#closeOnSelect()) this.hide();
        else this.search("", { show: true, reason: "select" });
      } else {
        // Select the exact option rather than assigning source.value, so a
        // duplicate value keeps its own label and selectedIndex.
        option.selected = true;
        this.selectionOrder = [option];
        this.input.value = item.label;
        this.#commit();
        if (this.#closeOnSelect()) this.hide();
      }
    } else {
      this.source.value = item.value;
      this.#dispatchNativeValueEvents();
      this.hide();
    }

    emit(this.source, "combobox:select", { combobox: this, item });
    this.#markEngineMutation();
    return true;
  }

  async #createItem(label) {
    if (!this.#canCreate(label)) return null;

    const existing = this.#findCreateMatch(label);
    if (existing) {
      this.#selectItem(existing);
      return existing.option ?? null;
    }

    // guards.add is about creating a brand-new item; existing matches are
    // selected above without running it.
    const guard = await this.#runGuard("add", { label });
    if (!guard.ok) return null;

    const before = emit(
      this.source,
      "combobox:beforecreate",
      {
        combobox: this,
        label,
      },
      { cancelable: true },
    );
    if (before.defaultPrevented) return null;

    let created = { value: label, label };
    if (typeof this.options.create === "function") {
      this.loading = true;
      this.#renderLoading();
      try {
        const result = await this.options.create(label, {
          signal: this.abortController.signal,
          combobox: this,
          source: this.source,
          input: this.input,
        });
        if (!result) return null;
        created = toItem(result, this.#fields());
      } catch (error) {
        if (error?.name !== "AbortError")
          emit(this.source, "combobox:createerror", { combobox: this, label, error });
        return null;
      } finally {
        this.loading = false;
      }
    }

    const option = this.addOption(created, { selected: true });
    this.#rememberSelection(option);
    this.input.value = "";
    this.#commit();

    emit(this.source, "combobox:create", {
      combobox: this,
      item: { ...created, option, selected: true },
    });

    if (this.isMultiple) {
      if (this.suppressReopen) this.refresh();
      else if (this.#closeOnSelect()) this.hide();
      else this.search("", { show: true, reason: "create" });
    } else {
      this.hide();
    }
    this.#markEngineMutation();
    return option;
  }

  /**
   * Run an async guard. `false` is a voluntary refusal (no mutation, no
   * error). A rejected promise is an application error: a generic
   * `combobox:guarderror` event is emitted and the operation is blocked.
   */
  async #runGuard(name, payload) {
    const guard = this.options.guards?.[name];
    if (typeof guard !== "function") return { ok: true };
    try {
      const result = await guard(payload, {
        combobox: this,
        source: this.source,
        input: this.input,
        signal: this.abortController.signal,
      });
      return { ok: result !== false, refused: result === false };
    } catch (error) {
      emit(this.source, "combobox:guarderror", { combobox: this, guard: name, error });
      return { ok: false, refused: false, error };
    }
  }

  #closeOnSelect() {
    return this.options.closeOnSelect ?? !this.isMultiple;
  }

  #separatorsActive() {
    return this.isMultiple && Array.isArray(this.options.separators) && this.options.separators.length > 0;
  }

  /**
   * Resolve the input value into token entries. Honors the optional `tokenize`
   * seam: `tokenize(value, ctx) => { tokens: string[], rest?: string }`.
   * `tokens` are complete tokens to consume; `rest` is the trailing
   * incomplete text that must keep living in the input (defaults to `""`).
   */
  #resolveTokens(value, final = false) {
    const custom = this.options.tokenize;
    if (typeof custom === "function") {
      const result = custom(value, { combobox: this, source: this.source, input: this.input });
      const tokens = result && Array.isArray(result.tokens) ? result.tokens : [];
      const entries = tokens.map((text) => ({ text: String(text), sep: "" }));
      return { entries, rest: final ? "" : String(result?.rest ?? "") };
    }

    const { done, rest } = splitTokens(value, this.options.separators);
    const entries = final && rest.trim() ? [...done, { text: rest.trim(), sep: "" }] : done;
    return { entries, rest: final ? "" : rest };
  }

  /**
   * Consume completed tokens sequentially. Never Promise.all a batch: each
   * token runs existing -> guard -> create -> select in order, re-evaluating
   * maxItems between tokens. On refusal/error/maxItems the unprocessed
   * remainder stays in the input; a trailing incomplete token stays too.
   */
  async #processTokens(value, { final = false } = {}) {
    if (!this.#separatorsActive()) return null;

    const { entries, rest } = this.#resolveTokens(value, final);
    if (!entries.length) return { consumed: false, rest };

    let consumedLength = 0;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (this.options.maxItems > 0 && this.source.selectedOptions.length >= this.options.maxItems) {
        return { consumed: false, rest: value.slice(consumedLength) };
      }
      if (!(await this.#applyToken(entry.text))) {
        return { consumed: false, rest: value.slice(consumedLength) };
      }
      consumedLength += entry.text.length + entry.sep.length;
    }
    return { consumed: true, rest: final ? "" : rest };
  }

  /** Apply one token: existing option wins, otherwise guarded creation. */
  async #applyToken(text) {
    const term = String(text ?? "").trim();
    if (!term) return true;

    const existing = this.#findCreateMatch(term);
    if (existing) {
      this.#selectItem(existing);
      return true;
    }
    if (!this.#canCreate(term)) return false;
    const created = await this.#createItem(term);
    return created !== null;
  }

  async #handleTokenInput() {
    const result = await this.#processTokens(this.input.value);
    if (result?.consumed) this.input.value = result.rest;
    this.search(this.input.value, { show: true, reason: "input" });
  }

  async #commitEnterTokens() {
    const result = await this.#processTokens(this.input.value, { final: true });
    if (result?.consumed) {
      this.input.value = result.rest;
      this.search("", { show: true, reason: "create" });
    }
  }

  #dispatchNativeValueEvents() {
    this.source.dispatchEvent(new Event("input", { bubbles: true }));
    this.source.dispatchEvent(new Event("change", { bubbles: true }));
  }

  #commit() {
    this.source.removeAttribute("aria-invalid");
    this.input?.removeAttribute("aria-invalid");
    this.#dispatchNativeValueEvents();
  }

  /* ---------------------------------------------------------------------- */
  /* Public state                                                           */
  /* ---------------------------------------------------------------------- */

  addOption(rawItem, { selected = false } = {}) {
    if (!this.isSelect) throw new TypeError("addOption() is only available for select-backed comboboxes");
    const item = toItem(rawItem, this.#fields());
    if (!item?.value) throw new TypeError("Option requires a value");

    // Each catalogue entry is its own identity: an existing value never
    // short-circuits a fresh option, so two distinct {value: "2"} entries stay
    // distinct choices. An explicit item.option is adopted as-is instead.
    const option =
      item.option instanceof HTMLOptionElement
        ? item.option
        : new Option(item.label, item.value, selected, selected);
    if (!(item.option instanceof HTMLOptionElement)) {
      option.disabled = Boolean(item.disabled);
      if (item.data) Object.assign(option.dataset, item.data);
      if (item.group) {
        let group = Array.from(this.source.children).find(
          (node) => node instanceof HTMLOptGroupElement && node.label === item.group,
        );
        if (!group) {
          group = document.createElement("optgroup");
          group.label = item.group;
          this.source.append(group);
        }
        group.append(option);
      } else {
        this.source.add(option);
      }
    }
    if (selected && !option.selected) option.selected = true;
    if (selected) this.#rememberSelection(option);
    return option;
  }

  select(itemOrValue) {
    const isObject = typeof itemOrValue === "object" && itemOrValue !== null;

    if (this.mode === "fallback" && this.isSelect) {
      const item = isObject
        ? toItem(itemOrValue, this.#fields())
        : { value: String(itemOrValue), label: String(itemOrValue) };
      const option =
        (this.isMultiple ? this.#findSelectableOption(item.value) : null) || this.#findOption(item.value);
      if (!option) {
        if (!isObject) return false;
        const created = this.addOption(item, { selected: true });
        this.#dispatchNativeValueEvents();
        return created !== null;
      }
      if (option.disabled) return false;
      const unchanged = this.isMultiple ? option.selected : this.source.value === option.value;
      if (unchanged) return false;
      if (!this.isMultiple) {
        for (const other of this.source.options) other.selected = false;
      }
      option.selected = true;
      this.#rememberSelection(option);
      this.#dispatchNativeValueEvents();
      return true;
    }

    if (isObject) {
      const item = toItem(itemOrValue, this.#fields());
      // An exact <option> passed to select() keeps its identity, so a
      // duplicate value is never resolved back to the first occurrence.
      if (itemOrValue instanceof HTMLOptionElement) item.option = itemOrValue;
      return this.#selectItem(item, { materialize: true });
    }

    // A bare string means "select an existing catalogue value": no implicit
    // creation, and each call resolves to the next selectable occurrence (see
    // #findSelectableOption), so select("2") x3 picks three distinct options.
    const value = String(itemOrValue);
    const found =
      this.#items().find((candidate) => candidate.value === value) ||
      this.#sourceItems().find((candidate) => candidate.value === value);
    if (!found) return false;
    return this.#selectItem({ value: found.value, label: found.label }, { materialize: false });
  }

  async remove(valueOrOption) {
    if (!this.isSelect) return false;
    // An exact option is authoritative (the chip a user clicked); a bare value
    // resolves to the first selected occurrence in the current order.
    const option =
      valueOrOption instanceof HTMLOptionElement
        ? valueOrOption
        : this.#selectedOptionsInOrder().find((entry) => entry.value === String(valueOrOption));
    if (!option?.selected || option.disabled) return false;
    const item = {
      value: option.value,
      label: option.textContent.trim(),
      option,
      selected: true,
      data: { ...option.dataset },
    };
    const guard = await this.#runGuard("remove", { item });
    if (!guard.ok) return false;
    const before = emit(this.source, "combobox:beforeremove", { combobox: this, item }, { cancelable: true });
    if (before.defaultPrevented) return false;
    option.selected = false;
    this.#forgetSelection(option);
    this.#commit();
    emit(this.source, "combobox:remove", { combobox: this, item });
    this.refresh();
    this.#markEngineMutation();
    return true;
  }

  async clear() {
    if (!this.isSelect) {
      if (!this.source.value) return false;
      const guard = await this.#runGuard("clear", {});
      if (!guard.ok) return false;
      const before = emit(this.source, "combobox:beforeclear", { combobox: this }, { cancelable: true });
      if (before.defaultPrevented) return false;
      this.source.value = "";
      this.#dispatchNativeValueEvents();
      emit(this.source, "combobox:clear", { combobox: this });
      return true;
    }

    const selected = Array.from(this.source.selectedOptions).filter((option) => !option.disabled);
    if (!selected.length) return false;
    const guard = await this.#runGuard("clear", {});
    if (!guard.ok) return false;
    const before = emit(this.source, "combobox:beforeclear", { combobox: this }, { cancelable: true });
    if (before.defaultPrevented) return false;
    for (const option of selected) option.selected = false;
    this.selectionOrder = this.selectionOrder.filter((option) => option.selected);
    this.#commit();
    emit(this.source, "combobox:clear", { combobox: this });
    this.refresh();
    this.#markEngineMutation();
    return true;
  }

  getSelectedValues() {
    if (!this.isSelect) return [this.source.value].filter(Boolean);
    return this.#selectedOptionsInOrder().map((option) => option.value);
  }

  getSelectedItems() {
    if (!this.isSelect)
      return [{ value: this.source.value, label: this.source.value }].filter((item) => item.value);
    return this.#selectedOptionsInOrder().map((option) => ({
      value: option.value,
      label: option.textContent.trim(),
      option,
      data: { ...option.dataset },
    }));
  }

  move(itemOrValue, index) {
    if (!this.isMultiple || this.options.selectionOrder !== "selected") return false;
    // An exact option moves that identity (duplicate values stay distinct); a
    // bare value moves the first selected occurrence in the ordered model.
    const option =
      itemOrValue instanceof HTMLOptionElement
        ? itemOrValue
        : this.selectionOrder.find((entry) => entry.value === String(itemOrValue));
    if (!option?.selected) return false;

    const moved = moveValueInOrder(this.selectionOrder, option, index);
    if (!moved) return false;
    const { order: nextOrder, from, to } = moved;

    const before = emit(
      this.source,
      "combobox:beforereorder",
      { combobox: this, value: option.value, from, to },
      { cancelable: true },
    );
    if (before.defaultPrevented) return false;
    this.selectionOrder = nextOrder;
    this.#renderChips();
    emit(this.source, "combobox:reorder", {
      combobox: this,
      value: option.value,
      from,
      to,
      values: this.getSelectedValues(),
    });
    return true;
  }

  async loadMore() {
    if (!this.nextCursor || typeof this.options.load !== "function") return false;
    const cursor = this.nextCursor;
    await this.#load(this.query, { cursor, append: true, debounce: false });
    this.#applyFilter(this.query);
    return true;
  }

  refresh() {
    if (this.mode !== "enhanced") return this;

    if (this.isSelect) {
      this.input.disabled = this.source.disabled;
      this.input.readOnly = this.source.hasAttribute("readonly");
      for (const option of this.source.selectedOptions) this.#rememberSelection(option);
      if (this.source.required) this.input.setAttribute("aria-required", "true");
      else this.input.removeAttribute("aria-required");
      if (this.isMultiple) this.#renderChips();
      else this.#syncSingleLabel();
    }

    this.#applyFilter(this.isSelect && !this.isMultiple ? "" : this.input.value);
    return this;
  }

  #syncSingleLabel() {
    const selected = this.source.selectedOptions[0];
    this.input.value = selected?.value ? selected.textContent.trim() : "";
  }

  show() {
    if (this.mode !== "enhanced" || this.isOpen()) return false;
    if (openCombobox && openCombobox !== this) {
      openCombobox.hide();
      if (openCombobox?.isOpen()) return false;
    }
    const before = emit(this.source, "combobox:beforeopen", { combobox: this }, { cancelable: true });
    if (before.defaultPrevented) return false;

    try {
      this.popover.showPopover({ source: this.input });
    } catch {
      this.popover.showPopover();
    }
    openCombobox = this;
    return true;
  }

  hide() {
    if (this.mode !== "enhanced" || !this.isOpen()) return false;
    const before = emit(this.source, "combobox:beforeclose", { combobox: this }, { cancelable: true });
    if (before.defaultPrevented) return false;
    this.popover.hidePopover();
    if (openCombobox === this) openCombobox = null;
    return true;
  }

  isOpen() {
    return this.mode === "enhanced" && this.popover.matches(":popover-open");
  }

  dispose() {
    instances.delete(this.source);
    this.loadController?.abort();
    this.abortController.abort();
    this._sourceObserver?.disconnect();
    this._sourceObserver = null;
    if (this._sourceSyncTimer) {
      clearTimeout(this._sourceSyncTimer);
      this._sourceSyncTimer = null;
    }

    if (this.mode === "fallback") {
      this.fallbackControl?.remove();
      return;
    }

    if (openCombobox === this) openCombobox = null;
    this.popover?.remove();

    // Cleanup only touches real source options. An init that failed before the
    // datalist resolved (input without a valid `list`) never produced mirror
    // state, and #sourceItems would crash on the null datalist.
    if (this.isSelect || this.datalist instanceof HTMLDataListElement) {
      for (const item of this.#sourceItems()) {
        item.option?.removeAttribute("data-filtered");
        item.option?.removeAttribute("data-active-option");
      }
    }

    // <label> ids invented by #copyAccessibleName are stripped again unless the
    // application has since reused them.
    for (const { label, id } of this.original.inventedLabels) {
      if (label.id === id) label.removeAttribute("id");
    }

    // Restore every attribute the engine touched on elements it does not own.
    if (this.isSelect) {
      this.control?.remove();
      this.source.classList.remove("cb-source-hidden");
      this.sourceSnapshot?.restore();

      // A placeholder that was consumed by a previous dispose() has no parent.
      // Restoring must also work when the whole wrapper subtree is detached.
      if (!this.ownsInput && this.input && this.original.filterInputPlaceholder?.parentNode) {
        this.original.filterInputPlaceholder.replaceWith(this.input);
      }
      this.input?.classList.remove("cb-input");
      this.inputSnapshot?.restore();
    } else {
      this.source.classList.remove("cb-text-control");
      this.source.style.removeProperty("anchor-name");
      // A placeholder that was consumed by a previous dispose() has no parent.
      // Restoring must also work when the whole wrapper subtree is detached.
      if (this.original.datalistPlaceholder?.parentNode) {
        this.original.datalistPlaceholder.replaceWith(this.datalist);
      }
      this.inputSnapshot?.restore();
    }
  }
}

// TODO / platform migration notes:
// - When Open UI's native `search`, `beforefilter`, `:filtered`, and
//   `:active-option` primitives ship broadly, the matching state above can be
//   progressively delegated to the browser without changing the public API.
// - When filterable-select settles on a declarative input/select relationship,
//   #resolveFilterInput() is the adapter boundary to map to it.
// - If native customizable select multiple becomes interoperable, chips can
//   remain script-owned while the picker/listbox implementation shrinks.

export default Combobox;
