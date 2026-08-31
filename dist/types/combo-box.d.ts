import { Combobox } from "./combobox.js";
export type ComboboxOptions = import("./combobox.js").ComboboxOptions;
export type ComboboxSource = import("./combobox.js").ComboboxSource;
export type AttributeConfig = {
    /**
     * Built-in converter
     */
    type?: "boolean" | "integer";
    /**
     * Override of the default kebab→camelCase name
     */
    option?: string;
    /**
     * Explicit converter
     */
    parse?: (raw: string | null) => any;
};
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
export declare class ComboBoxElement extends HTMLElement {
    #private;
    /** @type {Combobox | null} */
    _combobox: Combobox | null;
    /** @type {ComboboxSource | null} */
    _source: ComboboxSource | null;
    /** @type {ComboboxOptions} */
    _options: ComboboxOptions;
    /** @type {MutationObserver | null} */
    _sourceObserver: MutationObserver | null;
    _revision: number;
    _rebuildQueued: boolean;
    /** @type {Array<(combobox: Combobox) => void>} */
    _readyResolvers: Array<(combobox: Combobox) => void>;
    static get observedAttributes(): string[];
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    /**
     * @param {string} _name
     * @param {string | null} oldValue
     * @param {string | null} newValue
     */
    attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void;
    /**
     * The enhanced source element, discovering it lazily when needed.
     * @public
     * @returns {ComboboxSource | null}
     */
    get source(): ComboboxSource | null;
    /**
     * The underlying Combobox engine instance, or null before upgrade.
     * @public
     * @returns {Combobox | null}
     */
    get combobox(): Combobox | null;
    /**
     * The merged JavaScript options currently applied to the element.
     * @public
     * @returns {ComboboxOptions}
     */
    get options(): ComboboxOptions;
    /**
     * @param {ComboboxOptions} value
     */
    set options(value: ComboboxOptions);
    /**
     * Merge JavaScript-only behavior such as load/create/render callbacks.
     * @public
     * @param {ComboboxOptions} [options]
     * @returns {this}
     */
    configure(options?: ComboboxOptions): this;
    /**
     * Enhance the native child source. Safe to call repeatedly.
     * @public
     * @returns {Combobox | null} The Combobox instance, or null until a source
     *   child exists.
     */
    upgrade(): Combobox | null;
    /**
     * Resolves once the engine has upgraded the source child.
     * @public
     * @returns {Promise<Combobox>}
     */
    whenReady(): Promise<Combobox>;
    /**
     * Tear the engine down and restore the native source.
     * @public
     */
    dispose(): void;
}
/**
 * Explicit registration avoids surprising the global CustomElementRegistry.
 * A fresh subclass permits the same base implementation to be registered
 * under another application-specific name when desired.
 * @param {string} [name]
 * @param {CustomElementRegistry} [registry]
 * @returns {typeof ComboBoxElement | null}
 */
export declare function defineCombobox(name?: string, registry?: CustomElementRegistry): typeof ComboBoxElement | null;
//# sourceMappingURL=combo-box.d.ts.map