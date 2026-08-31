import { Combobox } from "./combobox.js";
import { booleanAttribute, parseInteger, parseList, parseSeparators } from "./helpers.js";

/**
 * @typedef {import("./combobox.js").ComboboxOptions} ComboboxOptions
 * @typedef {import("./combobox.js").ComboboxSource} ComboboxSource
 */

/**
 * Configuration of one `<combo-box>` attribute → option mapping.
 * @typedef {Object} AttributeConfig
 * @property {"boolean" | "integer"} [type] Built-in converter
 * @property {string} [option] Override of the default kebab→camelCase name
 * @property {(raw: string | null) => any} [parse] Explicit converter
 */

/**
 * Declarative surface: the canonical mapping of `<combo-box>` attributes to
 * engine options. This schema drives both `observedAttributes` and the option
 * resolver, so anything listed here is part of the HTML API — nothing is
 * inferred from `DEFAULTS`. `option` overrides the default kebab→camelCase
 * name; `parse` is an explicit converter; `type` selects a built-in converter
 * (`boolean`, `integer`, otherwise raw string).
 * @type {Record<string, AttributeConfig>}
 */
const OPTION_ATTRIBUTES = {
  create: { type: "boolean" },
  placeholder: {},
  search: { option: "match" },
  "min-chars": { type: "integer" },
  "max-items": { type: "integer" },
  "max-options": { type: "integer" },
  "selection-order": {},
  separators: { parse: parseSeparators },
  "create-on-blur": { type: "boolean" },
  "close-on-select": { type: "boolean" },
  "autoselect-first": { type: "boolean" },
  "tab-select": { type: "boolean" },
  "search-fields": { parse: parseList },
  "label-field": {},
  "value-field": {},
  "load-on-empty": { type: "boolean" },
  "allow-empty-option": { type: "boolean" },
  debounce: { type: "integer" },
};

/**
 * @param {string} name
 * @returns {string}
 */
function camelCase(name) {
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Lightweight Custom Element owner for the Combobox enhancement engine.
 *
 * Intentional design choices:
 * - autonomous custom element: <combo-box>
 * - no Shadow DOM: native source/form/label semantics remain visible
 * - not form-associated: the child <input>/<select> remains the value owner
 * - no automatic registration: call defineCombobox() explicitly
 * - JS options may be assigned before custom-element registration
 */
export class ComboBoxElement extends HTMLElement {
  static get observedAttributes() {
    return Object.keys(OPTION_ATTRIBUTES);
  }

  constructor() {
    super();
    /** @type {Combobox | null} */
    this._combobox = null;
    /** @type {ComboboxSource | null} */
    this._source = null;
    /** @type {ComboboxOptions} */
    this._options = {};
    /** @type {MutationObserver | null} */
    this._sourceObserver = null;
    this._revision = 0;
    this._rebuildQueued = false;
    /** @type {Array<(combobox: Combobox) => void>} */
    this._readyResolvers = [];

    // Upgrade properties assigned while <combo-box> was still an unknown
    // element, e.g. box.options = { load() {} }; defineCombobox();
    this.#upgradeProperty("options");
  }

  connectedCallback() {
    const revision = ++this._revision;
    queueMicrotask(() => {
      if (revision !== this._revision || !this.isConnected) return;
      this.upgrade();
    });
  }

  disconnectedCallback() {
    const revision = ++this._revision;
    // DOM moves commonly disconnect/reconnect synchronously. Deferring teardown
    // avoids destroying state for a simple move while still cleaning removals.
    queueMicrotask(() => {
      if (revision !== this._revision || this.isConnected) return;
      this.dispose();
    });
  }

  /**
   * @param {string} _name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue === newValue || !this._combobox) return;
    this.#scheduleRebuild();
  }

  /**
   * The enhanced source element, discovering it lazily when needed.
   * @public
   * @returns {ComboboxSource | null}
   */
  get source() {
    return this._source || this.#findSource();
  }

  /**
   * The underlying Combobox engine instance, or null before upgrade.
   * @public
   * @returns {Combobox | null}
   */
  get combobox() {
    return this._combobox;
  }

  /**
   * The merged JavaScript options currently applied to the element.
   * @public
   * @returns {ComboboxOptions}
   */
  get options() {
    return { ...this._options };
  }

  /**
   * @param {ComboboxOptions} value
   */
  set options(value) {
    if (value == null) value = {};
    if (typeof value !== "object") throw new TypeError("combo-box options must be an object");
    this._options = { ...value };
    if (this._combobox) this.#scheduleRebuild();
  }

  /**
   * Merge JavaScript-only behavior such as load/create/render callbacks.
   * @public
   * @param {ComboboxOptions} [options]
   * @returns {this}
   */
  configure(options = {}) {
    this.options = { ...this._options, ...options };
    return this;
  }

  /**
   * Enhance the native child source. Safe to call repeatedly.
   * @public
   * @returns {Combobox | null} The Combobox instance, or null until a source
   *   child exists.
   */
  upgrade() {
    const source = this.#findSource();
    if (!source) {
      this.#watchForSource();
      return null;
    }

    // The engine is imported statically above, so a missing source child is
    // the only reason to defer enhancement.
    this._sourceObserver?.disconnect();
    this._sourceObserver = null;

    if (this._combobox && this._source === source) return this._combobox;
    if (this._combobox) this._combobox.dispose();

    this._source = source;
    this._combobox = new Combobox(source, this.#resolvedOptions());

    const ready = this._readyResolvers.splice(0);
    for (const resolve of ready) resolve(this._combobox);

    this.dispatchEvent(
      new CustomEvent("combobox:ready", {
        bubbles: true,
        detail: { combobox: this._combobox, source },
      }),
    );

    return this._combobox;
  }

  /**
   * Resolves once the engine has upgraded the source child.
   * @public
   * @returns {Promise<Combobox>}
   */
  whenReady() {
    if (this._combobox) return Promise.resolve(this._combobox);
    return new Promise((resolve) => this._readyResolvers.push(resolve));
  }

  /**
   * Tear the engine down and restore the native source.
   * @public
   */
  dispose() {
    this._sourceObserver?.disconnect();
    this._sourceObserver = null;
    this._combobox?.dispose();
    this._combobox = null;
    this._source = null;
  }

  /**
   * @returns {ComboboxSource | null}
   */
  #findSource() {
    // A select wins because a select-backed combobox may also contain its
    // explicit filter <input>. Otherwise require input[list] for free text.
    for (const child of this.children) {
      if (child instanceof HTMLSelectElement) return child;
    }
    for (const child of this.children) {
      if (child instanceof HTMLInputElement && child.hasAttribute("list")) return child;
    }
    return null;
  }

  #watchForSource() {
    if (this._sourceObserver) return;
    this._sourceObserver = new MutationObserver(() => {
      if (this.#findSource()) this.upgrade();
    });
    this._sourceObserver.observe(this, { childList: true });
  }

  /**
   * @returns {ComboboxOptions}
   */
  #resolvedOptions() {
    /** @type {Record<string, any>} */
    const attrs = {};

    for (const [attribute, config] of Object.entries(OPTION_ATTRIBUTES)) {
      if (!this.hasAttribute(attribute)) continue;
      const raw = this.getAttribute(attribute);
      const value = config.parse
        ? config.parse(raw)
        : config.type === "boolean"
          ? booleanAttribute(this, attribute)
          : config.type === "integer"
            ? parseInteger(raw)
            : raw;
      // undefined means the attribute was authored with a value that does not
      // convert (e.g. an integer option got "banana") — skip it so DEFAULTS wins.
      if (value !== undefined) attrs[config.option ?? camelCase(attribute)] = value;
    }

    // JS wins over markup for behavior that needs an explicit override.
    return /** @type {ComboboxOptions} */ ({ ...attrs, ...this._options });
  }

  #scheduleRebuild() {
    if (this._rebuildQueued) return;
    this._rebuildQueued = true;
    queueMicrotask(() => {
      this._rebuildQueued = false;
      if (!this.isConnected || !this._combobox) return;
      const source = this._source;
      this._combobox.dispose();
      this._combobox = null;
      this._source = source;
      this.upgrade();
    });
  }

  /**
   * @param {string} name
   */
  #upgradeProperty(name) {
    if (!Object.hasOwn(this, name)) return;
    // Reflect keeps the object index dynamic without aliasing `this` (which
    // Biome flags) or widening the element type with a cast per access.
    const value = Reflect.get(this, name);
    Reflect.deleteProperty(this, name);
    Reflect.set(this, name, value);
  }
}

/**
 * Explicit registration avoids surprising the global CustomElementRegistry.
 * A fresh subclass permits the same base implementation to be registered
 * under another application-specific name when desired.
 * @param {string} [name]
 * @param {CustomElementRegistry} [registry]
 * @returns {typeof ComboBoxElement | null}
 */
export function defineCombobox(name = "combo-box", registry = globalThis.customElements) {
  if (!registry) return null;
  const existing = registry.get(name);
  if (existing) {
    if (existing.prototype instanceof ComboBoxElement)
      return /** @type {typeof ComboBoxElement} */ (existing);
    throw new DOMException(`Custom element "${name}" is already defined`, "NotSupportedError");
  }

  const RegisteredComboBox = class extends ComboBoxElement {};
  registry.define(name, RegisteredComboBox);
  return RegisteredComboBox;
}
