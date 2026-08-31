import Combobox, {
  ComboBoxElement,
  type ComboboxItem,
  type ComboboxOptions,
  defineCombobox,
} from "@lekoala/combobox";
import frMessages from "@lekoala/combobox/locales/fr";

const item: ComboboxItem = { value: "react", label: "React" };
void frMessages;

const options: ComboboxOptions = {
  match: "fuzzy",
  maxItems: 3,
  create: true,
  async load(query, { signal, cursor, source, input, combobox }) {
    void source;
    void input;
    void combobox;
    const response = await fetch(`/api?q=${query}&cursor=${cursor ?? ""}`, { signal });
    const rows = await response.json();
    return { items: rows, cursor: null };
  },
};

const select = document.querySelector("select") as HTMLSelectElement;
const combo = new Combobox(select, options);
void combo.setQuery("doctor", { show: true });
void combo.clearQuery();

const shell = document.createElement("div");
const anchored = new Combobox(select, { anchor: shell });
void anchored;

const combos = Combobox.init(document, "select.combo", options);
for (const enhanced of combos) {
  enhanced.select(item.value);
}

const element = document.createElement("combo-box") as ComboBoxElement;
element.configure({ maxItems: 5 });
const instance = element.upgrade();
void instance;
defineCombobox();
customElements.define("app-combobox", class extends ComboBoxElement {});

void ComboBoxElement;
void combo;
