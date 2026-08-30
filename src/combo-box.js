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
class ComboBoxElement extends HTMLElement {
  static observedAttributes = [
    "create",
    "placeholder",
    "search",
    "min-chars",
    "max-items",
    "selection-order",
    "separators",
    "load-on-empty",
    "allow-empty-option",
    "debounce",
  ];

  constructor() {
    super();
    this._combobox = null;
    this._source = null;
    this._options = {};
    this._sourceObserver = null;
    this._revision = 0;
    this._rebuildQueued = false;
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

  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue === newValue || !this._combobox) return;
    this.#scheduleRebuild();
  }

  get source() {
    return this._source || this.#findSource();
  }

  get combobox() {
    return this._combobox;
  }

  get options() {
    return { ...this._options };
  }

  set options(value) {
    if (value == null) value = {};
    if (typeof value !== "object") throw new TypeError("combo-box options must be an object");
    this._options = { ...value };
    if (this._combobox) this.#scheduleRebuild();
  }

  /** Merge JavaScript-only behavior such as load/create/render callbacks. */
  configure(options = {}) {
    this.options = { ...this._options, ...options };
    return this;
  }

  /**
   * Enhance the native child source. Safe to call repeatedly.
   * Returns the Combobox instance, or null until a source child exists.
   */
  upgrade() {
    const source = this.#findSource();
    if (!source) {
      this.#watchForSource();
      return null;
    }

    // The engine (src/combobox.js) must load before this wrapper. If it is
    // missing, leave the native source untouched instead of throwing.
    if (typeof Combobox === "undefined") return null;

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

  whenReady() {
    if (this._combobox) return Promise.resolve(this._combobox);
    return new Promise((resolve) => this._readyResolvers.push(resolve));
  }

  dispose() {
    this._sourceObserver?.disconnect();
    this._sourceObserver = null;
    this._combobox?.dispose();
    this._combobox = null;
    this._source = null;
  }

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

  #resolvedOptions() {
    const attrs = {};

    if (this.hasAttribute("create")) attrs.create = true;
    if (this.hasAttribute("placeholder")) attrs.placeholder = this.getAttribute("placeholder");
    if (this.hasAttribute("search")) attrs.match = this.getAttribute("search");
    if (this.hasAttribute("min-chars")) attrs.minChars = Number(this.getAttribute("min-chars"));
    if (this.hasAttribute("max-items")) attrs.maxItems = Number(this.getAttribute("max-items"));
    if (this.hasAttribute("selection-order")) attrs.selectionOrder = this.getAttribute("selection-order");
    if (this.hasAttribute("separators")) attrs.separators = Array.from(this.getAttribute("separators"));
    if (this.hasAttribute("load-on-empty")) attrs.loadOnEmpty = true;
    if (this.hasAttribute("allow-empty-option")) attrs.allowEmptyOption = true;
    if (this.hasAttribute("debounce")) attrs.debounce = Number(this.getAttribute("debounce"));

    // JS wins over markup for behavior that needs an explicit override.
    return { ...attrs, ...this._options };
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

  #upgradeProperty(name) {
    if (!Object.hasOwn(this, name)) return;
    const value = this[name];
    delete this[name];
    this[name] = value;
  }
}

/**
 * Explicit registration avoids surprising the global CustomElementRegistry.
 * A fresh subclass permits the same base implementation to be registered
 * under another application-specific name when desired.
 */
function defineCombobox(name = "combo-box", registry = globalThis.customElements) {
  if (!registry) return null;
  const existing = registry.get(name);
  if (existing) {
    if (existing.prototype instanceof ComboBoxElement) return existing;
    throw new DOMException(`Custom element "${name}" is already defined`, "NotSupportedError");
  }

  const RegisteredComboBox = class extends ComboBoxElement {};
  registry.define(name, RegisteredComboBox);
  return RegisteredComboBox;
}

window.ComboBoxElement = ComboBoxElement;
window.defineCombobox = defineCombobox;
