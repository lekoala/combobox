export type ComboboxSource = HTMLInputElement | HTMLSelectElement;
export type MatchStrategy = "includes" | "startswith" | "fuzzy" | "pattern";
export type ComboboxContext = {
    combobox: Combobox;
    source: ComboboxSource;
    /**
     * The live search/filter input
     */
    input: HTMLInputElement;
};
export type LoadContext = {
    signal: AbortSignal;
    cursor: string | null;
    combobox: Combobox;
    source: ComboboxSource;
    input: HTMLInputElement;
};
export type LoadResult = {
    items: import("./helpers.js").ComboboxItem[];
    cursor: string | null;
} | import("./helpers.js").ComboboxItem[];
export type LoadCallback = (query: string, context: LoadContext) => Promise<LoadResult>;
export type CreateContext = {
    signal: AbortSignal;
    combobox: Combobox;
    source: ComboboxSource;
    input: HTMLInputElement;
    /**
     * True when running on the native fallback path
     */
    fallback?: boolean;
};
export type CreateCallback = (label: string, context: CreateContext) => Promise<any>;
export type GuardCallback = (payload: any, context: CreateContext) => Promise<boolean | void> | boolean | void;
export type TokenizeCallback = (value: string, context: ComboboxContext) => {
    tokens: string[];
    rest?: string;
};
export type RenderContext = {
    combobox: Combobox;
    query?: string;
    selected?: boolean;
    error?: any;
};
export type ItemRenderer = (item: import("./helpers.js").ComboboxItem, context: RenderContext) => Node | string | null | undefined;
export type TextRenderer = (query: string, context: RenderContext) => Node | string | null | undefined;
export type ErrorRenderer = (query: string, context: RenderContext & {
    error: any;
}) => Node | string | null | undefined;
export type AttributeSnapshot = {
    /**
     * Restore the captured attributes (removes what
     * was absent, rewrites what had a value)
     */
    restore: () => void;
};
export type Messages = import("./messages.js").Messages;
export type RenderMap = {
    option?: ItemRenderer;
    group?: TextRenderer;
    item?: ItemRenderer;
    create?: TextRenderer;
    noResults?: TextRenderer;
    loading?: TextRenderer;
    error?: ErrorRenderer;
};
export type GuardMap = {
    add?: GuardCallback;
    remove?: GuardCallback;
    clear?: GuardCallback;
};
export type ComboboxOptions = {
    match?: MatchStrategy | ((item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => boolean);
    searchFields?: string | string[];
    minChars?: number;
    allowEmptyOption?: boolean;
    placeholder?: string;
    messages?: Messages;
    load?: LoadCallback;
    loadOnEmpty?: boolean;
    shouldLoad?: (query: string, context: ComboboxContext) => boolean;
    debounce?: number;
    createFilter?: (value: string, context: ComboboxContext) => boolean;
    create?: boolean | CreateCallback;
    maxItems?: number;
    maxOptions?: number;
    separators?: string[];
    tokenize?: TokenizeCallback;
    closeOnSelect?: boolean;
    createOnBlur?: boolean;
    autoselectFirst?: boolean;
    tabSelect?: boolean;
    labelField?: string;
    valueField?: string;
    guards?: GuardMap;
    selectionOrder?: "source" | "selected";
    observeSource?: boolean;
    render?: RenderMap;
    /**
     * Consumer-authored positioning/control region
     */
    anchor?: HTMLElement;
    sort?: (a: import("./helpers.js").ComboboxItem, b: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => number;
    score?: (item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => number | false | null;
    filter?: (item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => boolean;
};
export type ResolvedOptions = ComboboxOptions & {
    match: MatchStrategy | ((item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => boolean);
    searchFields: string | string[];
    minChars: number;
    allowEmptyOption: boolean;
    placeholder: string;
    messages: Messages;
    loadOnEmpty: boolean;
    debounce: number;
    maxItems: number;
    maxOptions: number;
    separators: string[];
    createOnBlur: boolean;
    autoselectFirst: boolean;
    tabSelect: boolean;
    guards: GuardMap;
    selectionOrder: "source" | "selected";
    observeSource: boolean;
    render: RenderMap;
    load: LoadCallback | null;
    create: boolean | CreateCallback;
    createFilter: ((value: string, context: ComboboxContext) => boolean) | null;
    shouldLoad: ((query: string, context: ComboboxContext) => boolean) | null;
    tokenize: TokenizeCallback | null;
    sort: ((a: import("./helpers.js").ComboboxItem, b: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => number) | null;
    score: ((item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => number | false | null) | null;
    filter: ((item: import("./helpers.js").ComboboxItem, query: string, context: ComboboxContext) => boolean) | null;
    anchor: HTMLElement | null;
};
export type ViewState = {
    /**
     * Wrapper control (select-only; null for
     * an input whose source input is itself the control)
     */
    control: HTMLElement | null;
    input: HTMLInputElement;
    /**
     * Only meaningful for a select
     */
    chips: HTMLElement | null;
    /**
     * Only meaningful for an input
     */
    datalist: HTMLDataListElement | null;
    inputSnapshot: AttributeSnapshot | null;
    sourceSnapshot: AttributeSnapshot | null;
};
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
export declare class Combobox {
    #private;
    /** @type {ComboboxSource} */
    source: ComboboxSource;
    isSelect: boolean;
    isMultiple: boolean;
    abortController: AbortController;
    /** @type {AbortController | null} */
    loadController: AbortController | null;
    activeIndex: number;
    /** @type {import("./helpers.js").ComboboxItem[]} */
    filteredItems: import("./helpers.js").ComboboxItem[];
    /** @type {import("./helpers.js").ComboboxItem[] | null} */
    results: import("./helpers.js").ComboboxItem[] | null;
    /** @type {HTMLOptionElement[]} */
    selectionOrder: HTMLOptionElement[];
    /** @type {WeakMap<HTMLElement, HTMLOptionElement>} */
    _chipOptions: WeakMap<HTMLElement, HTMLOptionElement>;
    searchGeneration: number;
    /** @type {string | null} */
    nextCursor: string | null;
    loading: boolean;
    /** @type {*} */
    loadError: any;
    query: string;
    id: number;
    mode: string;
    suppressReopen: boolean;
    composing: boolean;
    /** @type {MutationObserver | null} */
    _sourceObserver: MutationObserver | null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    _sourceSyncTimer: ReturnType<typeof setTimeout> | null;
    /** @type {ComboboxOptions} */
    explicitOptions: ComboboxOptions;
    /** @type {ResolvedOptions} */
    options: ResolvedOptions;
    original: {
        /** @type {Comment | null} */
        filterInputPlaceholder: Comment | null;
        /** @type {Array<{ label: HTMLLabelElement, id: string }>} */
        inventedLabels: Array<{
            label: HTMLLabelElement;
            id: string;
        }>;
    };
    /** @type {HTMLLabelElement[]} */
    boundLabels: HTMLLabelElement[];
    ownsInput: boolean;
    /** @type {HTMLElement | null} */
    fallbackControl: HTMLElement | null;
    /** @type {HTMLElement | null} */
    control: HTMLElement | null;
    /** @type {HTMLElement | null} */
    anchor: HTMLElement | null;
    /** @type {(() => void) | null} */
    stopAutoUpdate: (() => void) | null;
    /** @type {HTMLInputElement | null} */
    input: HTMLInputElement | null;
    /** @type {HTMLElement | null} */
    chips: HTMLElement | null;
    /** @type {HTMLDataListElement | null} */
    datalist: HTMLDataListElement | null;
    /** @type {AttributeSnapshot | null} */
    inputSnapshot: AttributeSnapshot | null;
    /** @type {AttributeSnapshot | null} */
    sourceSnapshot: AttributeSnapshot | null;
    /** @type {HTMLElement | null} */
    popover: HTMLElement | null;
    /** @type {HTMLElement | null} */
    listbox: HTMLElement | null;
    /** @type {HTMLElement | null} */
    status: HTMLElement | null;
    static supported: boolean;
    /**
     * Read the current default UI messages. Returns a shallow copy; mutating
     * the result does not affect the engine.
     * @returns {Messages}
     */
    static getDefaultMessages(): Messages;
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
    static setDefaultMessages(messages: Partial<Messages>): void;
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
    static init(rootOrSelector?: string | ParentNode | Iterable<EventTarget> | null | undefined, selectorOrOptions?: string | ComboboxOptions | null | undefined, maybeOptions?: ComboboxOptions): Combobox[];
    /**
     * @param {ComboboxSource} element
     * @returns {Combobox | null}
     */
    static getInstance(element: ComboboxSource): Combobox | null;
    /**
     * @param {ComboboxSource} element
     * @param {ComboboxOptions} options
     * @returns {Combobox}
     */
    static getOrCreateInstance(element: ComboboxSource, options?: ComboboxOptions): Combobox;
    /**
     * @param {ComboboxSource} element
     * @param {ComboboxOptions} options
     */
    constructor(element: ComboboxSource, options?: ComboboxOptions);
    get visibleItems(): import("./helpers.js").ComboboxItem[];
    /** Set transient picker results without turning the select into a remote cache. */
    /**
     * @param {Array<any>} items
     * @returns {this}
     */
    setResults(items: Array<any>): this;
    clearResults(): this;
    /** Replace the native catalogue explicitly. Prefer setResults() for remote search. */
    /**
     * @param {Array<any>} items
     * @param {{ preserveSelected?: boolean }} [options]
     * @returns {this}
     */
    setOptions(items: Array<any>, { preserveSelected }?: {
        preserveSelected?: boolean;
    }): this;
    /** Explicit sync point for external DOM mutations. */
    sync(): this;
    /** Single entry point for all listeners bound with `this` as the handler. */
    /**
     * @param {Event} event
     */
    handleEvent(event: Event): void;
    /**
     * Run the normal filtering pipeline: beforefilter -> optional load -> filter.
     * @param {string} [query]
     * @param {{ show?: boolean, reason?: string }} [options]
     */
    search(query?: string, { show, reason }?: {
        show?: boolean;
        reason?: string;
    }): Promise<void>;
    /**
     * Update the visible interaction text and run the normal search pipeline.
     * Unlike search(), this keeps the DOM input and `query` in sync. Programmatic
     * assignment follows the platform and does not dispatch native input/change
     * events.
     * @param {*} value
     * @param {{ show?: boolean, reason?: string }} [options]
     * @returns {Promise<void>}
     */
    setQuery(value: any, { show, reason }?: {
        show?: boolean;
        reason?: string;
    }): Promise<void>;
    /**
     * Clear the visible interaction text and run the normal search pipeline.
     * The picker is not opened when it was closed unless `{ show: true }` is
     * requested explicitly.
     * @param {{ show?: boolean, reason?: string }} [options]
     * @returns {Promise<void>}
     */
    clearQuery({ show, reason }?: {
        show?: boolean;
        reason?: string;
    }): Promise<void>;
    /**
     * Apply the local filter directly, without re-firing beforefilter or load.
     * This is the escape hatch intended for a canceled beforefilter handler:
     *   event.preventDefault();
     *   combobox.setResults(results).applyFilter(event.query, { show: true });
     * @param {string} [query]
     * @param {{ show?: boolean }} [options]
     * @returns {this | undefined}
     */
    applyFilter(query?: string, { show }?: {
        show?: boolean;
    }): this | undefined;
    /**
     * Add a catalogue option to the select.
     * @param {*} rawItem
     * @param {{ selected?: boolean }} [options]
     * @returns {HTMLOptionElement}
     */
    addOption(rawItem: any, { selected }?: {
        selected?: boolean;
    }): HTMLOptionElement;
    /**
     * Select an item. Bare values resolve to existing catalogue entries (never
     * materialising new options); objects/options may materialise.
     * @param {string | number | import("./helpers.js").ComboboxItem | HTMLOptionElement} itemOrValue
     * @returns {boolean}
     */
    select(itemOrValue: string | number | import("./helpers.js").ComboboxItem | HTMLOptionElement): boolean;
    /**
     * @param {string | HTMLOptionElement} valueOrOption
     * @returns {Promise<boolean>}
     */
    remove(valueOrOption: string | HTMLOptionElement): Promise<boolean>;
    clear(): Promise<boolean>;
    /**
     * @returns {string[]}
     */
    getSelectedValues(): string[];
    /**
     * @returns {import("./helpers.js").ComboboxItem[]}
     */
    getSelectedItems(): import("./helpers.js").ComboboxItem[];
    /**
     * @param {string | HTMLOptionElement} itemOrValue
     * @param {number} index
     * @returns {boolean}
     */
    move(itemOrValue: string | HTMLOptionElement, index: number): boolean;
    loadMore(): Promise<boolean>;
    refresh(): this;
    show(): boolean;
    hide(): boolean;
    isOpen(): boolean;
    dispose(): void;
}
export default Combobox;
//# sourceMappingURL=combobox.d.ts.map