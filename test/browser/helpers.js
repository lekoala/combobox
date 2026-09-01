/**
 * Playwright-only bridge between the Node test runner and the page.
 *
 * src/ is ESM with zero globals, so `page.evaluate` bodies that reference
 * `Combobox`/`defineCombobox`/`ComboBoxElement` need a test-time global. We
 * dynamically import the real ESM source into the page once per navigation and
 * surface the same bindings — the fixture/module pages already loaded by the
 * page use the exact same cached module instances, so identity stays coherent.
 */

export async function exposeEsm(page) {
  await page.evaluate(async () => {
    if (window.__comboboxEsm) return;
    const mod = await import("/src/index.js");
    window.Combobox = mod.Combobox;
    window.ComboBoxElement = mod.ComboBoxElement;
    window.defineCombobox = mod.defineCombobox;
    window.__comboboxEsm = true;
  });
}

export async function modernSupported(page) {
  return page.evaluate(() => window.Combobox?.supported === true);
}

export async function setup(page, url) {
  await page.goto(url);
  await exposeEsm(page);
}

/**
 * Type a value into a combobox's filter input and read the matched labels +
 * whether the no-results row is shown. `options` are passed to
 * `getOrCreateInstance` and **must be serializable** — `page.evaluate` cannot
 * transport functions across the bridge, so any configuration containing
 * `match`/`filter`/`render`/`load`/... functions must be constructed inside
 * the evaluate body instead (see the "custom match function" test in
 * `filter-modes.spec.js` for that pattern).
 * @param {import("@playwright/test").Page} page
 * @param {string} selectId
 * @param {string} value
 * @param {Record<string, any>} [options]
 */
export async function rowsFor(page, selectId, value, options) {
  return page.evaluate(
    async ({ id, value, options }) => {
      const combo = Combobox.getOrCreateInstance(document.getElementById(id), options ?? {});
      const input = combo.input;
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        rows: combo.filteredItems.map((item) => item.label),
        empty: combo.listbox.querySelector(".cb-empty") !== null,
      };
    },
    { id: selectId, value, options },
  );
}
