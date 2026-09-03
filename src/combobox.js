import { autoUpdate, reposition } from "@lekoala/floating";
import {
  hasOwn,
  matchesField,
  moveValueInOrder,
  normalize,
  rankByScore,
  reconcileSelected,
  splitTokens,
  toItem,
} from "./helpers.js";
import { DEFAULT_MESSAGES, getDefaultMessages, setDefaultMessages } from "./messages.js";

/* ---------------------------------------------------------------------- */
/* Public type contracts                                                  */
/* ---------------------------------------------------------------------- */

/**
 * A selectable source: a free-form `<input list>` or a `<select>`.
 * @typedef {HTMLInputElement | HTMLSelectElement} ComboboxSource
 */

/**
 * Matching/search strategy for a combobox.
 * @typedef {"includes" | "startswith" | "fuzzy" | "pattern"} MatchStrategy
 */

/**
 * Context passed to filtering, matching, scoring and sorting hooks, plus the
 * async load/create callbacks.
 * @typedef {Object} ComboboxContext
 * @property {Combobox} combobox
 * @property {ComboboxSource} source
 * @property {HTMLInputElement} input The live search/filter input
 */

/**
 * Load context for the async `load` callback.
 * @typedef {Object} LoadContext
 * @property {AbortSignal} signal
 * @property {string | null} cursor
 * @property {Combobox} combobox
 * @property {ComboboxSource} source
 * @property {HTMLInputElement} input
 */

/**
 * Result of an async load: either a bare item list or `{ items, cursor }` for
 * paged/append-only loading.
 * @typedef {{ items: import("./helpers.js").ComboboxItem[], cursor: string | null } | import("./helpers.js").ComboboxItem[]} LoadResult
 */

/**
 * async load callback.
 * @typedef {(query: string, context: LoadContext) => Promise<LoadResult>} LoadCallback
 */

/**
 * Context passed to the create and guards callbacks.
 * @typedef {Object} CreateContext
 * @property {AbortSignal} signal
 * @property {Combobox} combobox
 * @property {ComboboxSource} source
 * @property {HTMLInputElement} input
 * @property {boolean} [fallback] True when running on the native fallback path
 */

/**
 * async create callback.
 * @typedef {(label: string, context: CreateContext) => Promise<any>} CreateCallback
 */

/**
 * Guard callback for `add`/`remove`/`clear`. A resolved `false` refuses the
 * change; any other resolved value allows it. A thrown/rejected value is
 * surfaced as an application error (guards distinguish `false` from rejection).
 * @typedef {(payload: any, context: CreateContext) => Promise<boolean | void> | boolean | void} GuardCallback
 */

/**
 * Custom tokenizer seam: `tokens` are complete consumed values; `rest` is the
 * trailing incomplete text that must keep living in the input.
 * @typedef {(value: string, context: ComboboxContext) => { tokens: string[], rest?: string }} TokenizeCallback
 */

/**
 * Render context for the `render.*` hooks.
 * @typedef {Object} RenderContext
 * @property {Combobox} combobox
 * @property {string} [query]
 * @property {boolean} [selected]
 * @property {*} [error]
 */

/**
 * A renderer returns a DOM Node for rich content (strings render as text).
 * Item renderers (`option`, `item`, `group`) receive the item; the row
 * renderers (`create`, `noResults`, `loading`, `error`) receive the query or
 * the load error instead.
 * @typedef {(item: import("./helpers.js").ComboboxItem, context: RenderContext) => Node | string | null | undefined} ItemRenderer
 * @typedef {(query: string, context: RenderContext) => Node | string | null | undefined} TextRenderer
 * @typedef {(query: string, context: RenderContext & { error: any }) => Node | string | null | undefined} ErrorRenderer
 */

/** @type {WeakMap<ComboboxSource, Combobox>} */
const instances = new WeakMap();
let uid = 0;
/** @type {Combobox | null} */
let openCombobox = null;

// Generated UI text lives in messages.js (`render` is the DOM-representation
// seam and stays separate; behavior options are above it).
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
  anchor: null,
};

function supportsModernCombobox() {
  return (
    typeof HTMLElement.prototype.showPopover === "function" &&
    typeof HTMLElement.prototype.hidePopover === "function"
  );
}

/**
 * @param {EventTarget} target
 * @param {string} type
 * @param {Record<string, any>} [detail]
 * @param {{ cancelable?: boolean }} [options]
 * @returns {CustomEvent}
 */
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

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
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

/**
 * @param {HTMLElement} element
 * @param {Node | string | null | undefined} content
 */
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

/** Stable, font-independent icon for generated remove buttons. */
function createRemoveIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M4 4l12 12m0-12L4 16");
  svg.append(path);
  return svg;
}

/**
 * Snapshot a set of attributes on an element we do not own so `dispose()` can
 * restore the authored state exactly. The returned object has a `restore()`
 * method: attributes that were absent are removed, those that had a value are
 * written back. This makes upgrade/dispose symmetry impossible to forget.
 *
 * @param {Element} element
 * @param {string[]} names
 * @returns {AttributeSnapshot}
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
  "style",
];

/**
 * Optional bookkeeping snapshot of one element's attributes so `dispose()` can
 * restore the authored state exactly.
 * @typedef {Object} AttributeSnapshot
 * @property {() => void} restore Restore the captured attributes (removes what
 *   was absent, rewrites what had a value)
 */

/**
 * UI status messages (noResults/loading/loadError text, create/position label
 * producers). See messages.js for the canonical catalog and the locale
 * registry.
 * @typedef {import("./messages.js").Messages} Messages
 */

/**
 * Optional DOM-representation hooks. `option`/`group`/`item`/`create`/
 * `noResults`/`loading`/`error` render the respective rows; a returned DOM
 * Node is inserted for rich content, anything else (strings) is text.
 * @typedef {Object} RenderMap
 * @property {ItemRenderer} [option]
 * @property {TextRenderer} [group]
 * @property {ItemRenderer} [item]
 * @property {TextRenderer} [create]
 * @property {TextRenderer} [noResults]
 * @property {TextRenderer} [loading]
 * @property {ErrorRenderer} [error]
 */

/**
 * Async guards keyed by lifecycle phase. `false` is a voluntary refusal that
 * mutates nothing; a rejected promise is an application error surfaced via
 * `combobox:guarderror`.
 * @typedef {Object} GuardMap
 * @property {GuardCallback} [add]
 * @property {GuardCallback} [remove]
 * @property {GuardCallback} [clear]
 */

/**
 * Combobox configuration. All properties are optional; the engine deep-merges
 * with its defaults. Callbacks are the JavaScript-only surface.
 * @typedef {Object} ComboboxOptions
 * @property {MatchStrategy | ((item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => boolean)} [match]
 * @property {string | string[]} [searchFields]
 * @property {number} [minChars]
 * @property {boolean} [allowEmptyOption]
 * @property {string} [placeholder]
 * @property {Messages} [messages]
 * @property {LoadCallback} [load]
 * @property {boolean} [loadOnEmpty]
 * @property {(query: string, context: ComboboxContext) => boolean} [shouldLoad]
 * @property {number} [debounce]
 * @property {(value: string, context: ComboboxContext) => boolean} [createFilter]
 * @property {boolean | CreateCallback} [create]
 * @property {number} [maxItems]
 * @property {number} [maxOptions]
 * @property {string[]} [separators]
 * @property {TokenizeCallback} [tokenize]
 * @property {boolean} [closeOnSelect]
 * @property {boolean} [createOnBlur]
 * @property {boolean} [autoselectFirst]
 * @property {boolean} [tabSelect]
 * @property {string} [labelField]
 * @property {string} [valueField]
 * @property {GuardMap} [guards]
 * @property {"source" | "selected"} [selectionOrder]
 * @property {boolean} [observeSource]
 * @property {RenderMap} [render]
 * @property {HTMLElement} [anchor] Consumer-authored positioning/control region
 * @property {(a: import("./helpers.js").ComboboxItem, b: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => number} [sort]
 * @property {(item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => number | false | null} [score]
 * @property {(item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => boolean} [filter]
 */

/**
 * Internal options after the defaults merge. Every defaulted field is present
 * and readable without optional-chaining; the nullable seams (`load`, `create`
 * and friends) stay nullable and are always guarded by `typeof === "function"`.
 * @typedef {ComboboxOptions & {
 *   match: MatchStrategy | ((item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => boolean),
 *   searchFields: string | string[],
 *   minChars: number,
 *   allowEmptyOption: boolean,
 *   placeholder: string,
 *   messages: Messages,
 *   loadOnEmpty: boolean,
 *   debounce: number,
 *   maxItems: number,
 *   maxOptions: number,
 *   separators: string[],
 *   createOnBlur: boolean,
 *   autoselectFirst: boolean,
 *   tabSelect: boolean,
 *   guards: GuardMap,
 *   selectionOrder: "source" | "selected",
 *   observeSource: boolean,
 *   render: RenderMap,
 *   load: LoadCallback | null,
 *   create: boolean | CreateCallback,
 *   createFilter: ((value: string, context: ComboboxContext) => boolean) | null,
 *   shouldLoad: ((query: string, context: ComboboxContext) => boolean) | null,
 *   tokenize: TokenizeCallback | null,
 *   sort: ((a: import("./helpers.js").ComboboxItem, b: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => number) | null,
 *   score: ((item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => number | false | null) | null,
 *   filter: ((item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => boolean) | null,
 *   anchor: HTMLElement | null,
 * }} ResolvedOptions
 */

/**
 * State produced by the two initialisation branches (select vs input+datalist).
 * Both return every property so the constructor receives a uniform view; the
 * null-able entries are genuinely branch- or mode-conditional.
 * @typedef {Object} ViewState
 * @property {HTMLElement | null} control Wrapper control (select-only; null for
 *   an input whose source input is itself the control)
 * @property {HTMLInputElement} input
 * @property {HTMLElement | null} chips Only meaningful for a select
 * @property {HTMLDataListElement | null} datalist Only meaningful for an input
 * @property {AttributeSnapshot | null} inputSnapshot
 * @property {AttributeSnapshot | null} sourceSnapshot
 */

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
 * the input itself: <input data-filter-for="select-id" hidden>.
 */
export class Combobox {
  static supported = supportsModernCombobox();

  /**
   * Read the current default UI messages. Returns a shallow copy; mutating
   * the result does not affect the engine.
   * @returns {Messages}
   */
  static getDefaultMessages() {
    return getDefaultMessages();
  }

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
  static setDefaultMessages(messages) {
    setDefaultMessages(messages);
  }

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
   *
   * @param {string | ParentNode | Iterable<EventTarget> | null | undefined} rootOrSelector
   * @param {string | ComboboxOptions | null | undefined} selectorOrOptions
   * @param {ComboboxOptions} maybeOptions
   * @returns {Combobox[]}
   */
  static init(rootOrSelector = document, selectorOrOptions = null, maybeOptions = {}) {
    /** @type {ComboboxSource[]} */
    const targets = [];
    /** @type {ComboboxOptions} */
    let options = {};

    /**
     * A root either is a Node (scope for a selector) or a collection of sources.
     * @param {unknown} value
     * @returns {value is Node}
     */
    const isNode = (value) => value instanceof Node;
    /**
     * Accept only plain option objects (not selectors, elements or arrays).
     * @param {unknown} value
     * @returns {ComboboxOptions}
     */
    const picks = (value) =>
      value !== null && typeof value === "object" && !isNode(value) && !Array.isArray(value)
        ? /** @type {ComboboxOptions} */ (value)
        : {};

    if (typeof rootOrSelector === "string") {
      targets.push(.../** @type {Iterable<ComboboxSource>} */ (document.querySelectorAll(rootOrSelector)));
      options = picks(selectorOrOptions);
    } else if (isNode(rootOrSelector)) {
      const root = /** @type {ParentNode} */ (rootOrSelector);
      if (typeof selectorOrOptions === "string") {
        targets.push(.../** @type {Iterable<ComboboxSource>} */ (root.querySelectorAll(selectorOrOptions)));
        options = maybeOptions;
      } else {
        // An element root needs an explicit selector; options alone do not pick
        // targets. This keeps `data-*` discovery out of the API.
        options = picks(selectorOrOptions);
      }
    } else {
      targets.push(.../** @type {Iterable<ComboboxSource>} */ (Array.from(rootOrSelector ?? [])));
      options = picks(selectorOrOptions);
    }

    /** @type {Combobox[]} */
    const instances = [];
    for (const element of targets) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) continue;
      const instance = Combobox.getOrCreateInstance(element, options);
      if (instance && !instances.includes(instance)) instances.push(instance);
    }
    return instances;
  }

  /**
   * @param {ComboboxSource} element
   * @returns {Combobox | null}
   */
  static getInstance(element) {
    return instances.get(element) ?? null;
  }

  /**
   * @param {ComboboxSource} element
   * @param {ComboboxOptions} options
   * @returns {Combobox}
   */
  static getOrCreateInstance(element, options = {}) {
    return Combobox.getInstance(element) ?? new Combobox(element, options);
  }

  /**
   * @param {ComboboxSource} element
   * @param {ComboboxOptions} options
   */
  constructor(element, options = {}) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      throw new TypeError("Combobox expects an input or select element");
    }

    /** @type {ComboboxSource} */
    this.source = element;
    this.isSelect = element instanceof HTMLSelectElement;
    this.isMultiple = this.isSelect && element.multiple;
    this.abortController = new AbortController();
    /** @type {AbortController | null} */
    this.loadController = null;
    this.activeIndex = -1;
    /** @type {import("./helpers.js").ComboboxItem[]} */
    this.filteredItems = [];
    // Remote/custom results are deliberately transient. The native select is
    // the selection/value owner, not a cache for every server result.
    /** @type {import("./helpers.js").ComboboxItem[] | null} */
    this.results = null;
    // For a <select>, option identity is the HTMLOptionElement itself; a
    // duplicate `value` does not collapse identities. `selectionOrder` holds
    // option references (in source order initially), `value` is payload only.
    /** @type {HTMLOptionElement[]} */
    this.selectionOrder = this.isSelect ? Array.from(this.#selectSource().selectedOptions) : [];
    /** @type {WeakMap<HTMLElement, HTMLOptionElement>} */
    this._chipOptions = new WeakMap();
    this.searchGeneration = 0;
    /** @type {string | null} */
    this.nextCursor = null;
    this.loading = false;
    /** @type {*} */
    this.loadError = null;
    this.query = "";
    this.id = ++uid;
    this.mode =
      /** @type {ComboboxOptions & { mode?: "fallback" }} */ (options).mode === "fallback" ||
      !Combobox.supported
        ? "fallback"
        : "enhanced";
    this.suppressReopen = false;
    this.composing = false;
    /** @type {MutationObserver | null} */
    this._sourceObserver = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._sourceSyncTimer = null;

    /** @type {ComboboxOptions} */
    this.explicitOptions = options;
    /** @type {ResolvedOptions} */
    this.options = /** @type {ResolvedOptions} */ ({
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
    });

    this.original = {
      // explicit filter input
      /** @type {Comment | null} */
      filterInputPlaceholder: null,
      // detached datalist position marker
      /** @type {Comment | null} */
      datalistPlaceholder: null,
      // <label> elements whose id the engine invented for aria-labelledby
      /** @type {Array<{ label: HTMLLabelElement, id: string }>} */
      inventedLabels: [],
    };
    /** @type {HTMLLabelElement[]} */
    this.boundLabels = [];
    this.ownsInput = false;
    /** @type {HTMLElement | null} */
    this.fallbackControl = null;

    /** @type {HTMLElement | null} */
    this.control = null;
    /** @type {HTMLElement | null} */
    this.anchor = null;
    /** @type {(() => void) | null} */
    this.stopAutoUpdate = null;
    /** @type {HTMLInputElement | null} */
    this.input = null;
    /** @type {HTMLElement | null} */
    this.chips = null;
    /** @type {HTMLDataListElement | null} */
    this.datalist = null;
    /** @type {AttributeSnapshot | null} */
    this.inputSnapshot = null;
    /** @type {AttributeSnapshot | null} */
    this.sourceSnapshot = null;
    /** @type {HTMLElement | null} */
    this.popover = null;
    /** @type {HTMLElement | null} */
    this.listbox = null;
    /** @type {HTMLElement | null} */
    this.status = null;

    if (this.mode === "fallback") {
      this.#initFallback();
    } else {
      // Registration is transactional: an element whose init throws (e.g. a
      // broken datalist) must not stay associated with a half-built instance.
      try {
        const view =
          element instanceof HTMLSelectElement ? this.#enhanceSelect(element) : this.#enhanceInput(element);
        this.control = view.control;
        this.input = view.input;
        this.chips = view.chips;
        this.datalist = view.datalist;
        this.inputSnapshot = view.inputSnapshot;
        this.sourceSnapshot = view.sourceSnapshot;

        const requestedAnchor = this.options.anchor;
        this.anchor = requestedAnchor instanceof HTMLElement ? requestedAnchor : view.control || view.input;

        const picker = this.#createPicker();
        this.popover = picker.popover;
        this.listbox = picker.listbox;
        this.status = picker.status;

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

  /**
   * Discriminate the source to a `<select>`. A select-backed combobox is the
   * only context that calls the select-only operations, so this throws when
   * the invariant is violated rather than casting (an unchecked cast would
   * silently lie to the checker).
   * @returns {HTMLSelectElement}
   */
  #selectSource() {
    if (!(this.source instanceof HTMLSelectElement)) {
      throw new TypeError("Expected a select-backed combobox");
    }
    return this.source;
  }

  /**
   * The interaction input. Only enhanced instances call this, and enhanced
   * construction always creates the input — an absent input is an invariant
   * violation, not a normal runtime condition.
   * @returns {HTMLInputElement}
   */
  #inputEl() {
    return /** @type {HTMLInputElement} */ (this.input);
  }

  /**
   * The popover picker root. Enhanced instances always have one.
   * @returns {HTMLElement}
   */
  #popoverEl() {
    return /** @type {HTMLElement} */ (this.popover);
  }

  /**
   * The listbox container. Enhanced instances always have one.
   * @returns {HTMLElement}
   */
  #listEl() {
    return /** @type {HTMLElement} */ (this.listbox);
  }

  /**
   * The live status region. Enhanced instances always have one.
   * @returns {HTMLElement}
   */
  #statusEl() {
    return /** @type {HTMLElement} */ (this.status);
  }

  /**
   * The chips container. Only select-backed enhanced instances have chips.
   * @returns {HTMLElement | null}
   */
  #chipsEl() {
    return this.chips;
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
    input.placeholder = this.options.placeholder ?? "";
    input.autocomplete = "off";
    input.setAttribute("aria-label", this.options.placeholder ?? "");
    // Deliberately no name: the select remains the only successful control.

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cb-fallback-add";
    button.textContent = "Add";

    const add = async () => {
      const label = input.value.trim();
      if (!this.#canCreate(label)) return;
      await this.#createFallbackOption(label, input);
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

  /**
   * Native-fallback creation: run the guard/create pipeline and materialize the
   * option on the visible select.
   * @param {string} label
   * @param {HTMLInputElement} input The fallback Add control
   * @returns {Promise<HTMLOptionElement | null>}
   */
  async #createFallbackOption(label, input) {
    const guard = await this.#runGuard("add", { label });
    if (!guard.ok) return null;

    const before = emit(
      this.source,
      "combobox:beforecreate",
      { combobox: this, label },
      { cancelable: true },
    );
    if (before.defaultPrevented) return null;

    /** @type {import("./helpers.js").ComboboxItem} */
    let created = { value: label, label };
    try {
      if (typeof this.options.create === "function") {
        const result = await this.options.create(label, {
          signal: this.abortController.signal,
          combobox: this,
          source: this.source,
          input,
          fallback: true,
        });
        if (!result) return null;
        created = /** @type {import("./helpers.js").ComboboxItem} */ (toItem(result, this.#fields()));
      }

      let option = this.#findOption(created.value);
      if (!option) {
        // Creation changes live form state, never the form-reset baseline.
        option = new Option(created.label, created.value, false, true);
        if (created.data) Object.assign(option.dataset, created.data);
        this.#selectSource().add(option);
      } else {
        option.selected = true;
      }
      this.#rememberSelection(option);
      this.#dispatchNativeValueEvents();
      emit(this.source, "combobox:create", { combobox: this, item: { ...created, option, selected: true } });
      return option;
    } catch (/** @type {any} */ error) {
      if (error?.name !== "AbortError") {
        emit(this.source, "combobox:createerror", { combobox: this, label, error });
      }
      return null;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Source adapters                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Prepare the input+datalist view. The input is its own control (there is no
   * wrapper), so `control` is null and `input` is the source itself.
   * @param {HTMLInputElement} source
   * @returns {ViewState}
   */
  #enhanceInput(source) {
    const listId = source.getAttribute("list");
    if (!listId) throw new TypeError("Input combobox expects an input with a datalist");

    const datalist = document.getElementById(listId);
    if (!(datalist instanceof HTMLDataListElement)) {
      throw new TypeError(`No datalist found for #${listId}`);
    }

    const inputSnapshot = captureAttributes(source, INPUT_ATTRS);

    // In enhanced mode the datalist is a data source only. Detach it so the UA
    // picker can never flash/race our popover. dispose() restores it exactly.
    source.removeAttribute("list");
    source.autocomplete = "off";
    const datalistPlaceholder = document.createComment(`combobox-datalist-${this.id}`);
    this.original.datalistPlaceholder = datalistPlaceholder;
    datalist.before(datalistPlaceholder);
    datalist.remove();

    source.classList.add("cb-text-control");
    return {
      control: null,
      input: source,
      chips: null,
      datalist,
      inputSnapshot,
      sourceSnapshot: null,
    };
  }

  /**
   * Prepare the select view: a wrapper control holding chips and the filter
   * input, plus a snapshot of the untouched source attributes.
   * @param {HTMLSelectElement} source
   * @returns {ViewState}
   */
  #enhanceSelect(source) {
    source.classList.add("cb-source-hidden");
    const sourceSnapshot = captureAttributes(source, ["aria-hidden", "tabindex"]);
    source.tabIndex = -1;
    source.setAttribute("aria-hidden", "true");

    const control = document.createElement("div");
    control.className = `cb-control ${this.isMultiple ? "cb-control-multiple" : "cb-control-single"}`;
    const chips = document.createElement("span");
    chips.className = "cb-chips";
    control.append(chips);

    const { input, inputSnapshot } = this.#resolveFilterInput();
    input.classList.add("cb-input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.removeAttribute("name");

    if (!input.placeholder) input.placeholder = this.options.placeholder ?? "";

    this.#copyAccessibleName(input);
    control.append(input);
    source.after(control);

    return {
      control,
      input,
      chips,
      datalist: null,
      inputSnapshot,
      sourceSnapshot,
    };
  }

  /**
   * Resolve the interaction filter input, preferring an author-supplied one
   * declared via `<input data-filter-for="select-id">`. Returns the input together with
   * the snapshot needed by dispose() to restore the authored state.
   * @returns {{ input: HTMLInputElement, inputSnapshot: AttributeSnapshot | null }}
   */
  #resolveFilterInput() {
    let input = null;
    // An author-supplied filter input is declared with a liaison attribute on
    // the input itself: <input data-filter-for="select-id">. Configuration stays
    // on <combo-box> attributes or JS — the source select never carries data-*.
    if (this.source.id) {
      input = document.querySelector(`input[data-filter-for="${CSS.escape(this.source.id)}"]`);
    }

    if (input instanceof HTMLInputElement) {
      const inputSnapshot = captureAttributes(input, INPUT_ATTRS);
      const filterInputPlaceholder = document.createComment(`combobox-filter-input-${this.id}`);
      this.original.filterInputPlaceholder = filterInputPlaceholder;
      input.before(filterInputPlaceholder);
      input.hidden = false;
      return { input, inputSnapshot };
    }

    this.ownsInput = true;
    // An owned control is disposed with the wrapper: there is nothing to restore.
    return { input: document.createElement("input"), inputSnapshot: null };
  }

  /**
   * Copy the source select's accessible name/description/required state onto
   * the interaction input. Must run before the input is attached to the
   * control so aria-labelledby/aria-describedby reference live labels.
   * @param {HTMLInputElement} input
   */
  #copyAccessibleName(input) {
    // The source's own aria-labelledby (e.g. a grid naming its filter select
    // after the column header) is the authoritative accessible name — an
    // association that no <label> traversal can rediscover. Only when it is
    // absent do we fall back to derived labels, then aria-label.
    const labelledBy = this.source.getAttribute("aria-labelledby");
    if (labelledBy) {
      input.setAttribute("aria-labelledby", labelledBy);
    } else {
      this.#copyLabeledNames(input);
    }

    const ariaLabel = this.source.getAttribute("aria-label");
    if (!input.hasAttribute("aria-labelledby") && ariaLabel) {
      input.setAttribute("aria-label", ariaLabel);
    }
    if (this.source.required) input.setAttribute("aria-required", "true");
    const describedBy = this.source.getAttribute("aria-describedby");
    if (describedBy) {
      input.setAttribute("aria-describedby", describedBy);
    }
  }

  /**
   * Derive the accessible name from <label> associations: explicit
   * `label[for=source]` links plus a wrapping label. Invented ids are recorded
   * so dispose() can strip them again.
   * @param {HTMLInputElement} input
   */
  #copyLabeledNames(input) {
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
    this.boundLabels = /** @type {HTMLLabelElement[]} */ (
      labels.filter((label) => {
        if (seen.has(label)) return false;
        seen.add(label);
        return true;
      })
    );

    const labelIds = this.boundLabels.map((label, index) => {
      if (!label.id) {
        label.id = `combobox-label-${this.id}-${index}`;
        this.original.inventedLabels.push({ label, id: label.id });
      }
      return label.id;
    });
    if (labelIds.length) input.setAttribute("aria-labelledby", labelIds.join(" "));
  }

  #sourceItems() {
    if (this.isSelect) {
      return Array.from(this.#selectSource().options)
        .filter((option) => option.value || this.options.allowEmptyOption)
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

    if (!this.datalist) return [];
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
  /**
   * @param {Array<any>} items
   * @returns {this}
   */
  setResults(items) {
    this.results = Array.from(items || [], (item) => toItem(item, this.#fields())).filter(
      (item) => item !== null,
    );
    return this;
  }

  clearResults() {
    this.results = null;
    // A failed load is scoped to the newest search: any later local query,
    // successful load or explicit clear drops the stale error row.
    this.loadError = null;
    return this;
  }

  /**
   * @param {*} value
   * @returns {HTMLOptionElement | null}
   */
  #findOption(value) {
    if (!this.isSelect) return null;
    const select = this.#selectSource();
    return Array.from(select.options).find((option) => option.value === String(value)) || null;
  }

  /**
   * Resolve a plain value to the option a fresh selection should land on: the
   * first non-disabled match, skipping already-selected options in multiple
   * mode (each native option is selected at most once; identical values on
   * distinct options are distinct choices). Single-select returns the first
   * non-disabled match regardless of the current selection.
   * @param {*} value
   * @returns {HTMLOptionElement | null}
   */
  #findSelectableOption(value) {
    if (!this.isSelect) return null;
    const wanted = String(value);
    return (
      Array.from(this.#selectSource().options).find(
        (option) =>
          option.value === wanted && !option.disabled && (this.isMultiple && option.selected) === false,
      ) || null
    );
  }

  /** Match a token to an existing native option by value or label. */
  /**
   * @param {string} label
   * @returns {import("./helpers.js").ComboboxItem | null}
   */
  #findCreateMatch(label) {
    const lookup = normalize(label);
    for (const item of this.#sourceItems()) {
      if (normalize(item.value) === lookup || normalize(item.label) === lookup) return item;
    }
    return null;
  }

  /** Replace the native catalogue explicitly. Prefer setResults() for remote search. */
  /**
   * @param {Array<any>} items
   * @param {{ preserveSelected?: boolean }} [options]
   * @returns {this}
   */
  setOptions(items, { preserveSelected = this.isSelect } = {}) {
    const normalized = Array.from(items || [], (item) => toItem(item, this.#fields())).filter(
      (item) => item !== null,
    );

    if (this.isSelect) {
      const select = this.#selectSource();
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
      if (emptyOption && !this.isMultiple) select.append(emptyOption);

      // No value-based dedupe: catalogue identity is the <option> element, so
      // repeated values in the payload map to their own options.
      const catalog = [...preserved, ...normalized];

      const groups = new Map();
      for (const item of catalog) {
        // An empty value is a legitimate option only when allowEmptyOption
        // admits it; otherwise it would shadow the collection's real entries.
        if (!item.value && !this.options.allowEmptyOption) continue;
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
    } else {
      if (!this.datalist) return this;
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
    const target = this.isSelect ? this.source : this.datalist;
    if (target) this._sourceObserver.observe(target, config);
  }

  #scheduleSourceSync() {
    if (this._sourceSyncTimer) clearTimeout(this._sourceSyncTimer);
    this._sourceSyncTimer = setTimeout(() => {
      this._sourceSyncTimer = null;
      if (instances.get(this.source) !== this) return;
      this.sync();
    }, 50);
  }

  /* ---------------------------------------------------------------------- */
  /* Picker / interaction                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * Build the popover picker (top layer) plus its listbox and live status
   * region. The popover is appended to the nearest ancestor dialog (or body)
   * so a modal <dialog> does not make it inert.
   * @returns {{ popover: HTMLElement, listbox: HTMLElement, status: HTMLElement }}
   */
  #createPicker() {
    const popover = document.createElement("div");
    popover.className = "cb-popover";
    popover.popover = "manual";

    const listbox = document.createElement("div");
    listbox.className = "cb-listbox";
    listbox.role = "listbox";
    listbox.id = `combobox-listbox-${this.id}`;
    if (this.isMultiple) listbox.setAttribute("aria-multiselectable", "true");

    const status = document.createElement("div");
    status.className = "cb-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    popover.append(listbox, status);
    // Popover renders in the top layer, but a modal <dialog> makes everything
    // outside it (including a body-level popover) inert. Stay a descendant of
    // an ancestor dialog so the picker stays interactive inside showModal().
    const dialog = this.source.closest("dialog");
    (dialog || document.body).append(popover);

    // The popover renders in the top layer, outside the control's subtree, so
    // it cannot inherit the control's typography. Adopt the interaction
    // input's resolved font to avoid falling back to the page-level font.
    popover.style.font = getComputedStyle(this.#inputEl()).font;

    this.#inputEl().setAttribute("role", "combobox");
    this.#inputEl().setAttribute("aria-autocomplete", "list");
    this.#inputEl().setAttribute("aria-expanded", "false");
    this.#inputEl().setAttribute("aria-controls", listbox.id);

    return { popover, listbox, status };
  }

  /**
   * Position the open picker from the whole visual control. The floating
   * engine writes viewport coordinates; Popover supplies the top layer.
   * @returns {boolean}
   */
  #positionPicker() {
    const anchor = this.anchor || this.control || this.#inputEl();
    const popover = this.#popoverEl();
    const width = anchor.getBoundingClientRect().width;
    popover.style.inlineSize = `${width}px`;
    return reposition(anchor, popover, {
      placement: "bottom-start",
      distance: 4,
      flip: true,
      shift: true,
    });
  }

  /** Start tracking geometry while the top-layer picker is open. */
  #startAutoUpdate() {
    this.stopAutoUpdate?.();
    const anchor = this.anchor || this.control || this.#inputEl();
    this.stopAutoUpdate = autoUpdate(anchor, this.#popoverEl(), () => {
      this.#positionPicker();
    });
  }

  #bind() {
    const signal = this.abortController.signal;

    // Persistent listeners go through #handleEvent so no per-render closure is
    // ever added. #renderList/#renderChips stay listener-free.
    this.#inputEl().addEventListener("focus", this, { signal });
    this.#inputEl().addEventListener("input", this, { signal });
    this.#inputEl().addEventListener("compositionstart", this, { signal });
    this.#inputEl().addEventListener("compositionend", this, { signal });
    this.#inputEl().addEventListener("keydown", this, { signal });
    this.#inputEl().addEventListener("blur", this, { signal });

    this.#listEl().addEventListener("pointerdown", (event) => event.preventDefault(), { signal });
    this.#listEl().addEventListener("pointermove", this, { signal });
    this.#listEl().addEventListener("click", this, { signal });

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
        const control = this.anchor || this.control || this.#inputEl();
        if (path.includes(control) || path.includes(this.#popoverEl())) return;
        this.hide();
      },
      { capture: true, signal },
    );

    this.#popoverEl().addEventListener(
      "toggle",
      (event) => {
        const open = event.newState === "open";
        this.#inputEl().setAttribute("aria-expanded", String(open));
        emit(this.source, open ? "combobox:open" : "combobox:close", { combobox: this });
        if (!open) {
          this.stopAutoUpdate?.();
          this.stopAutoUpdate = null;
          this.#setActive(-1);
          if (this.isSelect && !this.isMultiple) this.#syncSingleLabel();
        } else {
          this.#positionPicker();
          this.#startAutoUpdate();
        }
      },
      { signal },
    );

    if (this.isSelect) {
      this.source.addEventListener("change", () => this.refresh(), { signal });
      this.source.addEventListener("focus", () => this.#inputEl().focus(), { signal });
      for (const label of this.boundLabels) {
        label.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            this.#inputEl().focus();
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
          this.#inputEl().setAttribute("aria-invalid", "true");
          this.#inputEl().focus();
        },
        { signal },
      );
    }
  }

  /** Single entry point for all listeners bound with `this` as the handler. */
  /**
   * @param {Event} event
   */
  handleEvent(event) {
    if (event.currentTarget === this.#inputEl()) return this.#onInputEvent(event);
    if (event.currentTarget === this.control) return this.#onControlEvent(event);
    if (event.currentTarget === this.#listEl()) return this.#onListboxEvent(event);
    if (event.currentTarget === this.chips) return this.#onChipsEvent(event);
  }

  /**
   * @param {Event} event
   */
  #onInputEvent(event) {
    switch (event.type) {
      case "focus": {
        if (this.isSelect && !this.isMultiple && this.#selectSource().selectedOptions.length)
          this.#inputEl().select();
        const query = this.isSelect && !this.isMultiple ? "" : this.#inputEl().value;
        this.search(query, { show: true, reason: "focus" });
        return;
      }
      case "input": {
        // Separator tokens are consumed as they complete (typing or paste).
        // IME composition feeds search but never tokenizes/creates.
        const inputEvent = /** @type {InputEvent} */ (event);
        if (this.isMultiple && !inputEvent.isComposing && this.#separatorsActive()) {
          void this.#handleTokenInput();
          return;
        }
        this.search(this.#inputEl().value, { show: true, reason: "input" });
        return;
      }
      case "compositionstart":
        this.composing = true;
        return;
      case "compositionend":
        this.composing = false;
        return;
      case "keydown":
        return this.#onInputKeyDown(/** @type {KeyboardEvent} */ (event));
      case "blur":
        return this.#onInputBlur();
    }
  }

  /**
   * @param {Event} event
   */
  #onControlEvent(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest("button")) return;
    this.#inputEl().focus();
  }

  /**
   * @param {Event} event
   */
  #onListboxEvent(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    if (event.type === "pointermove") {
      const option = target.closest(".cb-option[data-index]");
      if (option) this.#setActive(Number(/** @type {HTMLElement} */ (option).dataset.index));
      return;
    }
    if (event.type === "click") {
      const option = target.closest(".cb-option");
      if (!option) return;
      if (option.classList.contains("cb-create")) {
        const query = this.#inputEl().value.trim();
        if (query) void this.#createItem(query);
        return;
      }
      const item = this.visibleItems[Number(/** @type {HTMLElement} */ (option).dataset.index)];
      if (item) this.#selectItem(item);
    }
  }

  /**
   * @param {Event} event
   */
  #onChipsEvent(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    if (event.type === "click") {
      const remove = target.closest(".cb-chip-remove");
      if (!remove) return;
      const chip = /** @type {HTMLElement} */ (remove.closest(".cb-chip"));
      if (!chip) return;
      // The chip's exact option is authoritative (duplicate values share a
      // data-value but never an option). data-value is only a fallback.
      const option = this._chipOptions.get(chip);
      void this.remove(option ?? chip.dataset.value ?? "").then((removed) => {
        if (removed) this.#inputEl().focus();
      });
      return;
    }
    if (event.type === "keydown") {
      const chip = /** @type {HTMLElement} */ (target.closest(".cb-chip"));
      if (!chip) return;
      const option = this._chipOptions.get(chip);
      const item = option
        ? this.getSelectedItems().find((entry) => entry.option === option) || {
            value: option.value,
            label: option.textContent.trim(),
            option,
          }
        : { value: chip.dataset.value ?? "", label: chip.dataset.value ?? "" };
      this.#onChipKeyDown(/** @type {KeyboardEvent} */ (event), item);
    }
  }

  #onInputBlur() {
    queueMicrotask(async () => {
      const active = document.activeElement;
      // Blur caused by internal interaction (picker click, adornment,
      // chip removal, clear) never closes and never blur-creates.
      const stillInside =
        active === this.#inputEl() ||
        (this.#popoverEl()?.contains(active) ?? false) ||
        (this.anchor && active && this.anchor.contains(active)) ||
        (this.control && active && this.control.contains(active));
      if (this.isOpen() && stillInside) return;

      if (this.isOpen() || this.options.createOnBlur) {
        if (this.isSelect && this.isMultiple && this.options.createOnBlur && !this.composing) {
          const value = this.#inputEl().value;
          this.suppressReopen = true;
          try {
            if (this.#separatorsActive()) {
              const result = await this.#processTokens(value, { final: true });
              if (result?.consumed) this.#inputEl().value = result.rest;
            } else if (value.trim()) {
              this.#inputEl().value = "";
              await this.#createItem(value.trim());
            }
          } finally {
            this.suppressReopen = false;
          }
          this.refresh();
        }
        if (this.isSelect && !this.isMultiple) this.#syncSingleLabel();
        this.hide();
      }
    });
  }

  /**
   * @param {KeyboardEvent} event
   */
  #onInputKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!this.isOpen()) this.search(this.#inputEl().value, { show: true, reason: "keyboard" });
      this.#moveActive(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!this.isOpen()) this.search(this.#inputEl().value, { show: true, reason: "keyboard" });
      this.#moveActive(-1);
      return;
    }

    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      if (!this.isOpen()) this.search(this.#inputEl().value, { show: true, reason: "keyboard" });
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
      else if (this.#canCreate(this.#inputEl().value)) void this.#createItem(this.#inputEl().value.trim());
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
        if (this.isMultiple && this.#separatorsActive() && this.#inputEl().value.trim()) {
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
        if (this.#canCreate(this.#inputEl().value)) {
          event.preventDefault();
          void this.#createItem(this.#inputEl().value.trim());
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

    if (event.key === "ArrowLeft" && this.isMultiple && !this.#inputEl().value) {
      const chips = Array.from(this.chips?.querySelectorAll(".cb-chip") || []);
      if (chips.length) {
        event.preventDefault();
        /** @type {HTMLElement} */ (chips[chips.length - 1]).focus();
        return;
      }
    }

    if (
      event.key === "Backspace" &&
      this.isMultiple &&
      !this.#inputEl().value &&
      this.#selectSource().selectedOptions.length
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
   * @param {string} [query]
   * @param {{ show?: boolean, reason?: string }} [options]
   */
  async search(query = "", { show = false, reason = "api" } = {}) {
    if (this.mode !== "enhanced") return;

    const generation = ++this.searchGeneration;
    this.query = String(query ?? "");

    const before = emit(
      this.#inputEl(),
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
    emit(this.#inputEl(), "filter", {
      query: this.query,
      combobox: this,
      items: this.filteredItems,
      source: this.source,
    });

    if (show) this.show();
  }

  /**
   * Update the visible interaction text and run the normal search pipeline.
   * Unlike search(), this keeps the DOM input and `query` in sync. Programmatic
   * assignment follows the platform and does not dispatch native input/change
   * events.
   * @param {*} value
   * @param {{ show?: boolean, reason?: string }} [options]
   * @returns {Promise<void>}
   */
  setQuery(value, { show = true, reason = "api" } = {}) {
    const query = String(value ?? "");
    if (this.mode === "fallback") {
      this.query = query;
      if (!this.isSelect) this.source.value = query;
      return Promise.resolve();
    }

    this.#inputEl().value = query;
    return this.search(query, { show, reason });
  }

  /**
   * Clear the visible interaction text and run the normal search pipeline.
   * The picker is not opened when it was closed unless `{ show: true }` is
   * requested explicitly.
   * @param {{ show?: boolean, reason?: string }} [options]
   * @returns {Promise<void>}
   */
  clearQuery({ show = false, reason = "api" } = {}) {
    return this.setQuery("", { show, reason });
  }

  /**
   * Apply the local filter directly, without re-firing beforefilter or load.
   * This is the escape hatch intended for a canceled beforefilter handler:
   *   event.preventDefault();
   *   combobox.setResults(results).applyFilter(event.query, { show: true });
   * @param {string} [query]
   * @param {{ show?: boolean }} [options]
   * @returns {this | undefined}
   */
  applyFilter(query = "", { show = false } = {}) {
    if (this.mode !== "enhanced") return this;
    this.query = String(query ?? "");
    this.#applyFilter(this.query);
    emit(this.#inputEl(), "filter", {
      query: this.query,
      combobox: this,
      items: this.filteredItems,
      source: this.source,
      manual: true,
    });
    if (show) this.show();
    return this;
  }

  /**
   * @param {string} query
   * @returns {boolean}
   */
  #shouldLoad(query) {
    if (
      typeof this.options.shouldLoad === "function" &&
      !this.options.shouldLoad(query, { combobox: this, source: this.source, input: this.#inputEl() })
    ) {
      return false;
    }
    return (
      typeof this.options.load === "function" &&
      query.length >= Number(this.options.minChars || 0) &&
      (query.length > 0 || this.options.loadOnEmpty)
    );
  }

  /**
   * @param {string} query
   * @param {{ cursor?: string | null, append?: boolean, debounce?: boolean }} [options]
   */
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
        input: this.#inputEl(),
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
      const caught = /** @type {any} */ (error);
      if (signal.aborted || caught?.name === "AbortError") return;
      // The error row mirrors loading: it replaces the list for this query and
      // is cleared by the next successful load or local search. Long-lived
      // selection lives on the native source and is untouched by a failed load.
      this.loadError = caught;
      emit(this.source, "combobox:loaderror", {
        query,
        combobox: this,
        error: caught,
      });
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  /**
   * @param {string} query
   */
  #applyFilter(query) {
    const items = this.#items();

    let visible = items.filter((item) => {
      if (this.isMultiple && item.selected) return false;
      return this.#matches(item, query);
    });

    const context = { combobox: this, source: this.source, input: this.#inputEl() };

    if (typeof this.options.filter === "function") {
      visible = visible.filter((item) => this.options.filter(item, query, context));
    }

    if (typeof this.options.score === "function") {
      visible = rankByScore(visible, (item, _index) => this.options.score(item, query, context));
    }

    if (typeof this.options.sort === "function") {
      visible.sort((a, b) => this.options.sort(a, b, query, context));
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

  /**
   * Decision helper: an empty query is "no textual search", so the matcher
   * (including a custom match) has nothing to decide — everything passes the
   * match stage (`filter` admissibility still applies independently).
   * For any other query, the strategy is applied **per `searchField` value**:
   * `matchesField` owns every strategy and receives exactly one value, so a
   * match can never cross field boundaries.
   * @param {import("./helpers.js").ComboboxItem} item
   * @param {string} query
   * @returns {boolean}
   */
  #matches(item, query) {
    if (!query) return true;

    if (typeof this.options.match === "function") {
      return this.options.match(item, query, { combobox: this, source: this.source, input: this.#inputEl() });
    }

    const fields = Array.isArray(this.options.searchFields)
      ? this.options.searchFields
      : this.options.searchFields
        ? [this.options.searchFields]
        : [];
    const values = fields.map((field) => {
      if (field in item) return String(item[field] ?? "");
      return String(item.data?.[field] ?? "");
    });
    return values.some((value) => matchesField(value, query, this.options.match));
  }

  /**
   * @param {string | null | undefined} label
   * @returns {boolean}
   */
  #canCreate(label) {
    const value = String(label ?? "").trim();
    if (!this.isSelect || !this.options.create || !value) return false;
    if (
      this.options.maxItems > 0 &&
      this.isMultiple &&
      this.#selectSource().selectedOptions.length >= this.options.maxItems
    )
      return false;
    if (typeof this.options.createFilter === "function") {
      return (
        this.options.createFilter(value, { combobox: this, source: this.source, input: this.#inputEl() }) !==
        false
      );
    }
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Rendering                                                              */
  /* ---------------------------------------------------------------------- */

  #renderList() {
    this.#listEl().replaceChildren();
    this.#statusEl().textContent = "";

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
        this.#listEl().append(group);
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
      if (item.option?.title || item.title) option.title = item.option?.title ?? item.title ?? "";
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
      this.#listEl().append(option);
    }

    if (!this.filteredItems.length) {
      if (this.#canCreate(this.#inputEl().value)) {
        const create = document.createElement("div");
        create.className = "cb-option cb-create";
        create.tabIndex = -1;
        create.role = "option";
        const query = this.#inputEl().value.trim();
        const rendered = this.options.render.create?.(query, { combobox: this });
        const createLabel = document.createElement("span");
        createLabel.className = "cb-option-label";
        setContent(
          createLabel,
          rendered ??
            this.options.messages.create?.(query, {
              combobox: this,
              source: this.source,
              input: this.#inputEl(),
            }) ??
            query,
        );
        create.append(createLabel);
        this.#listEl().append(create);
      } else {
        const empty = document.createElement("div");
        empty.className = "cb-empty";
        const rendered = this.options.render.noResults?.(this.query, { combobox: this });
        setContent(empty, rendered ?? this.options.messages.noResults);
        this.#listEl().append(empty);
        this.#statusEl().textContent = this.options.messages.noResults ?? "";
      }
    }
  }

  #renderLoading() {
    this.#listEl().replaceChildren();
    // A loading/error row replaces the option list, so no row may stay active:
    // the previous aria-activedescendant would point at removed DOM.
    this.#setActive(-1);
    const loading = document.createElement("div");
    loading.className = "cb-empty cb-loading";
    const rendered = this.options.render.loading?.(this.query, { combobox: this });
    setContent(loading, rendered ?? this.options.messages.loading);
    this.#listEl().append(loading);
    this.#statusEl().textContent = this.options.messages.loading ?? "";
  }

  #renderError() {
    this.#listEl().replaceChildren();
    this.#setActive(-1);
    const error = document.createElement("div");
    error.className = "cb-empty cb-error";
    const rendered = this.options.render.error?.(this.query, { error: this.loadError, combobox: this });
    setContent(error, rendered ?? this.options.messages.loadError);
    this.#listEl().append(error);
    this.#statusEl().textContent = this.options.messages.loadError ?? "";
  }

  #renderChips() {
    const chips = this.#chipsEl();
    if (!chips) return;
    chips.replaceChildren();

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
        remove.append(createRemoveIcon());
        remove.setAttribute("aria-label", `Remove ${item.label}`);
        chip.append(remove);
      }

      chips.append(chip);
    }
  }

  #selectedOptionsInOrder() {
    const selected = Array.from(this.#selectSource().selectedOptions);
    if (this.options.selectionOrder !== "selected") return selected;

    // Reconcile the remembered order against the actual selection. Options no
    // longer selected are dropped; options selected by external DOM mutations
    // and absent from the remembered order are appended in native order. Set
    // membership is object identity, so duplicate values stay distinct.
    return reconcileSelected(selected, this.selectionOrder);
  }

  /**
   * @param {HTMLOptionElement} option
   */
  #rememberSelection(option) {
    if (!this.selectionOrder.includes(option)) this.selectionOrder.push(option);
  }

  /**
   * @param {HTMLOptionElement} option
   */
  #forgetSelection(option) {
    const index = this.selectionOrder.indexOf(option);
    if (index >= 0) this.selectionOrder.splice(index, 1);
  }

  /**
   * Keyboard interaction on a focused chip.
   * @param {KeyboardEvent} event
   * @param {import("./helpers.js").ComboboxItem} item
   */
  #onChipKeyDown(event, item) {
    const chips = /** @type {HTMLElement[]} */ (
      Array.from(this.#chipsEl()?.querySelectorAll(".cb-chip") || [])
    );
    const current =
      event.target instanceof HTMLElement
        ? /** @type {HTMLElement | null} */ (event.target.closest(".cb-chip"))
        : null;
    const index = current ? chips.indexOf(current) : -1;

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
      if (next >= chips.length) this.#inputEl().focus();
      else chips[next]?.focus();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      void this.remove(item.option ?? item.value).then((removed) => {
        if (!removed) return;
        queueMicrotask(() => {
          const remaining = /** @type {HTMLElement[]} */ (
            Array.from(this.#chipsEl()?.querySelectorAll(".cb-chip") || [])
          );
          remaining[Math.min(index, remaining.length - 1)]?.focus();
          if (!remaining.length) this.#inputEl().focus();
        });
      });
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.#inputEl().focus();
    }
  }

  /** Move a focused chip to an absolute position, keep it focused and announce. */
  /**
   * @param {import("./helpers.js").ComboboxItem} item
   * @param {number} target
   */
  #reorderChip(item, target) {
    const identity = item.option ?? item.value;
    if (!this.move(identity, target)) return;
    const chips = /** @type {HTMLElement[]} */ (
      Array.from(this.#chipsEl()?.querySelectorAll(".cb-chip") || [])
    );
    const chip = item.option
      ? chips.find((candidate) => this._chipOptions.get(candidate) === item.option)
      : chips.find((candidate) => candidate.dataset.value === item.value);
    chip?.focus();
    this.#statusEl().textContent =
      this.options.messages.position?.(
        item.label,
        chips.indexOf(/** @type {HTMLElement} */ (chip)) + 1,
        chips.length,
        { combobox: this, source: this.source, input: this.#inputEl() },
      ) ?? "";
  }

  /* ---------------------------------------------------------------------- */
  /* Selection / creation                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * @param {number} delta
   */
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
  /**
   * @param {number} from
   * @param {number} direction
   * @returns {number}
   */
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
    const first = this.#listEl().querySelector(".cb-option");
    if (!first) return 1;
    const row = /** @type {HTMLElement} */ (first).offsetHeight || 48;
    const view = this.#popoverEl().clientHeight || 0;
    return Math.max(1, Math.floor(view / row));
  }

  /**
   * @param {number} index
   */
  #setActive(index) {
    if (index >= this.visibleItems.length) index = -1;
    this.activeIndex = index;

    for (const item of this.#sourceItems()) item.option?.removeAttribute("data-active-option");

    for (const option of this.#listEl().querySelectorAll(".cb-option[data-index]")) {
      const el = /** @type {HTMLElement} */ (option);
      const active = Number(el.dataset.index) === index;
      el.toggleAttribute("data-active", active);
      if (active) {
        this.#inputEl().setAttribute("aria-activedescendant", el.id);
        this.visibleItems[index]?.option?.setAttribute("data-active-option", "");
        el.scrollIntoView({ block: "nearest" });
      }
    }

    if (index < 0) this.#inputEl().removeAttribute("aria-activedescendant");
  }

  /**
   * @param {import("./helpers.js").ComboboxItem} item
   * @param {{ materialize?: boolean }} [options]
   * @returns {boolean}
   */
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
      if (option?.disabled || (!option && !materialize)) return false;

      const unchanged = option
        ? this.isMultiple
          ? option.selected
          : this.#selectSource().selectedOptions[0] === option
        : false;
      if (unchanged) {
        if (!this.isMultiple) this.hide();
        return false;
      }
      if (
        this.isMultiple &&
        this.options.maxItems > 0 &&
        this.#selectSource().selectedOptions.length >= this.options.maxItems
      ) {
        return false;
      }
      if (option) item = { ...item, option, selected: true };
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
      // A transient result becomes native state only after beforeselect has
      // allowed the operation. Cancellation therefore has zero catalogue or
      // value side effects, as a synchronous `before*` contract promises.
      if (!option) option = this.addOption(item);
      const selectOption = /** @type {HTMLOptionElement} */ (option);
      item = { ...item, option: selectOption, selected: true };
      if (this.isMultiple) {
        selectOption.selected = true;
        this.#rememberSelection(selectOption);
        this.#inputEl().value = "";
        this.#commit();
        if (this.suppressReopen) this.refresh();
        else if (this.#closeOnSelect()) this.hide();
        else this.search("", { show: true, reason: "select" });
      } else {
        // Select the exact option rather than assigning source.value, so a
        // duplicate value keeps its own label and selectedIndex.
        selectOption.selected = true;
        this.selectionOrder = [selectOption];
        this.#inputEl().value = item.label;
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

  /**
   * @param {string} label
   * @returns {Promise<HTMLOptionElement | null>}
   */
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

    /** @type {import("./helpers.js").ComboboxItem} */
    let created = { value: label, label };
    if (typeof this.options.create === "function") {
      this.loading = true;
      this.#renderLoading();
      try {
        const result = await this.options.create(label, {
          signal: this.abortController.signal,
          combobox: this,
          source: this.source,
          input: this.#inputEl(),
        });
        if (!result) return null;
        created = /** @type {import("./helpers.js").ComboboxItem} */ (toItem(result, this.#fields()));
      } catch (/** @type {any} */ error) {
        if (error?.name !== "AbortError")
          emit(this.source, "combobox:createerror", { combobox: this, label, error });
        return null;
      } finally {
        this.loading = false;
      }
    }

    const option = this.addOption(created, { selected: true });
    this.#rememberSelection(option);
    this.#inputEl().value = "";
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
   * @param {"add" | "remove" | "clear"} name
   * @param {any} payload
   * @returns {Promise<{ ok: boolean, refused?: boolean, error?: any }>}
   */
  async #runGuard(name, payload) {
    const guards = this.options.guards;
    const guard = guards[name];
    if (typeof guard !== "function") return { ok: true };
    try {
      const result = await guard(payload, {
        combobox: this,
        source: this.source,
        input: this.#inputEl(),
        signal: this.abortController.signal,
      });
      return { ok: result !== false, refused: result === false };
    } catch (error) {
      emit(this.source, "combobox:guarderror", { combobox: this, guard: name, error });
      return { ok: false, refused: false, error };
    }
  }

  /**
   * @returns {boolean}
   */
  #closeOnSelect() {
    return this.options.closeOnSelect ?? !this.isMultiple;
  }

  /**
   * @returns {boolean}
   */
  #separatorsActive() {
    return this.isMultiple && Array.isArray(this.options.separators) && this.options.separators.length > 0;
  }

  /**
   * Resolve the input value into token entries. Honors the optional `tokenize`
   * seam: `tokenize(value, ctx) => { tokens: string[], rest?: string }`.
   * `tokens` are complete tokens to consume; `rest` is the trailing
   * incomplete text that must keep living in the input (defaults to `""`).
   * @param {string} value
   * @param {boolean} [final]
   * @returns {{ entries: Array<{ text: string, sep: string }>, rest: string }}
   */
  #resolveTokens(value, final = false) {
    const custom = this.options.tokenize;
    if (typeof custom === "function") {
      const result = custom(value, { combobox: this, source: this.source, input: this.#inputEl() });
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
   * @param {string} value
   * @param {{ final?: boolean }} [options]
   * @returns {Promise<{ consumed: boolean, rest: string } | null>}
   */
  async #processTokens(value, { final = false } = {}) {
    if (!this.#separatorsActive()) return null;

    const { entries, rest } = this.#resolveTokens(value, final);
    if (!entries.length) return { consumed: false, rest };

    let consumedLength = 0;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (this.options.maxItems > 0 && this.#selectSource().selectedOptions.length >= this.options.maxItems) {
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
  /**
   * @param {string | null | undefined} text
   * @returns {Promise<boolean>}
   */
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
    const result = await this.#processTokens(this.#inputEl().value);
    // #processTokens always returns the computed remainder (`rest`): the
    // trailing incomplete token on a full consumption, or the unconsumed tail
    // (including a refused token) on a refusal/maxItems stop. #createItem
    // clears the interaction input for each created token, so the remainder
    // must be written back in both cases — otherwise a mid-batch refusal
    // would silently swallow the rest of the pasted text.
    if (result) this.#inputEl().value = result.rest;
    this.search(this.#inputEl().value, { show: true, reason: "input" });
  }

  async #commitEnterTokens() {
    const result = await this.#processTokens(this.#inputEl().value, { final: true });
    if (result?.consumed) {
      this.#inputEl().value = result.rest;
      this.search("", { show: true, reason: "create" });
    }
  }

  #dispatchNativeValueEvents() {
    this.source.dispatchEvent(new Event("input", { bubbles: true }));
    this.source.dispatchEvent(new Event("change", { bubbles: true }));
  }

  #commit() {
    this.source.removeAttribute("aria-invalid");
    this.#inputEl()?.removeAttribute("aria-invalid");
    this.#dispatchNativeValueEvents();
  }

  /* ---------------------------------------------------------------------- */
  /* Public state                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * Add a catalogue option to the select.
   * @param {*} rawItem
   * @param {{ selected?: boolean }} [options]
   * @returns {HTMLOptionElement}
   */
  addOption(rawItem, { selected = false } = {}) {
    if (!this.isSelect) throw new TypeError("addOption() is only available for select-backed comboboxes");
    const item = toItem(rawItem, this.#fields());
    if (!item) throw new TypeError("Option requires a value");
    // `""` is a legitimate value only when allowEmptyOption admits it; the
    // empty-placeholder convention stays the single-select default otherwise.
    if (item.value === "" && !this.options.allowEmptyOption) throw new TypeError("Option requires a value");

    // Each catalogue entry is its own identity: an existing value never
    // short-circuits a fresh option, so two distinct {value: "2"} entries stay
    // distinct choices. An explicit item.option is adopted as-is instead.
    const option =
      item.option instanceof HTMLOptionElement
        ? item.option
        : // `selected` is live state only. `defaultSelected` belongs to authored
          // markup (or an explicit setOptions catalogue replacement), otherwise
          // a dynamic selection would silently rewrite form.reset()'s baseline.
          new Option(item.label, item.value, false, selected);
    if (!(item.option instanceof HTMLOptionElement)) {
      option.disabled = Boolean(item.disabled);
      if (item.data) Object.assign(option.dataset, item.data);
      if (item.group) {
        let group = /** @type {HTMLOptGroupElement | undefined} */ (
          Array.from(this.#selectSource().children).find(
            (node) => node instanceof HTMLOptGroupElement && node.label === item.group,
          )
        );
        if (!group) {
          group = document.createElement("optgroup");
          group.label = item.group;
          this.#selectSource().append(group);
        }
        group.append(option);
      } else {
        this.#selectSource().add(option);
      }
    }
    if (selected && !option.selected) option.selected = true;
    if (selected) this.#rememberSelection(option);
    return option;
  }

  /**
   * Select an item. Bare values resolve to existing catalogue entries (never
   * materialising new options); objects/options may materialise.
   * @param {string | number | import("./helpers.js").ComboboxItem | HTMLOptionElement} itemOrValue
   * @returns {boolean}
   */
  select(itemOrValue) {
    const isObject = typeof itemOrValue === "object" && itemOrValue !== null;

    if (this.mode === "fallback" && this.isSelect) {
      const item = isObject
        ? toItem(itemOrValue, this.#fields())
        : { value: String(itemOrValue), label: String(itemOrValue) };
      if (!item) return false;
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
        for (const other of this.#selectSource().options) other.selected = false;
      }
      option.selected = true;
      this.#rememberSelection(option);
      this.#dispatchNativeValueEvents();
      return true;
    }

    if (isObject) {
      const item = toItem(itemOrValue, this.#fields());
      if (!item) return false;
      // An exact <option> passed to select() keeps its identity, so a
      // duplicate value is never resolved back to the first occurrence.
      if (itemOrValue instanceof HTMLOptionElement) item.option = itemOrValue;
      return this.#selectItem(item, { materialize: true });
    }

    // A bare string means "select an existing catalogue value": no implicit
    // creation, and each call resolves to the next selectable occurrence (see
    // #findSelectableOption), so select("2") x3 picks three distinct options.
    const value = String(itemOrValue);
    const foundRaw =
      this.#items().find((candidate) => candidate.value === value) ||
      this.#sourceItems().find((candidate) => candidate.value === value);
    const found = foundRaw ? /** @type {import("./helpers.js").ComboboxItem} */ (foundRaw) : null;
    if (!found) return false;
    return this.#selectItem({ value: found.value, label: found.label }, { materialize: false });
  }

  /**
   * @param {string | HTMLOptionElement} valueOrOption
   * @returns {Promise<boolean>}
   */
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

    const selected = Array.from(this.#selectSource().selectedOptions).filter((option) => !option.disabled);
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

  /**
   * @returns {string[]}
   */
  getSelectedValues() {
    if (!this.isSelect) return [this.source.value].filter(Boolean);
    return this.#selectedOptionsInOrder().map((option) => option.value);
  }

  /**
   * @returns {import("./helpers.js").ComboboxItem[]}
   */
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

  /**
   * @param {string | HTMLOptionElement} itemOrValue
   * @param {number} index
   * @returns {boolean}
   */
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
      this.#inputEl().disabled = this.source.disabled;
      this.#inputEl().readOnly = this.source.hasAttribute("readonly");
      for (const option of this.#selectSource().selectedOptions) this.#rememberSelection(option);
      if (this.source.required) this.#inputEl().setAttribute("aria-required", "true");
      else this.#inputEl().removeAttribute("aria-required");
      if (this.isMultiple) this.#renderChips();
      else this.#syncSingleLabel();
    }

    this.#applyFilter(this.isSelect && !this.isMultiple ? "" : this.#inputEl().value);
    return this;
  }

  #syncSingleLabel() {
    const selected = this.#selectSource().selectedOptions[0];
    this.#inputEl().value = selected?.value ? selected.textContent.trim() : "";
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
      this.#popoverEl().showPopover({ source: this.#inputEl() });
    } catch {
      this.#popoverEl().showPopover();
    }
    this.#positionPicker();
    this.#startAutoUpdate();
    openCombobox = this;
    return true;
  }

  hide() {
    if (this.mode !== "enhanced" || !this.isOpen()) return false;
    const before = emit(this.source, "combobox:beforeclose", { combobox: this }, { cancelable: true });
    if (before.defaultPrevented) return false;
    this.#popoverEl().hidePopover();
    if (openCombobox === this) openCombobox = null;
    return true;
  }

  isOpen() {
    return this.mode === "enhanced" && this.#popoverEl().matches(":popover-open");
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
    this.stopAutoUpdate?.();
    this.stopAutoUpdate = null;
    this.#popoverEl()?.remove();

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
      if (!this.ownsInput && this.#inputEl() && this.original.filterInputPlaceholder?.parentNode) {
        this.original.filterInputPlaceholder.replaceWith(this.#inputEl());
      }
      this.#inputEl()?.classList.remove("cb-input");
      this.inputSnapshot?.restore();
    } else {
      this.source.classList.remove("cb-text-control");
      // A placeholder that was consumed by a previous dispose() has no parent.
      // Restoring must also work when the whole wrapper subtree is detached.
      const datalist = this.datalist;
      if (datalist && this.original.datalistPlaceholder?.parentNode) {
        this.original.datalistPlaceholder.replaceWith(datalist);
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
