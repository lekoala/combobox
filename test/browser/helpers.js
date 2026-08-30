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
