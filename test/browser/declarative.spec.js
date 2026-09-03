import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const HTML = "/test/fixtures/declarative.html";

test.beforeEach(async ({ page }) => {
  await setup(page, HTML);
});

test("data-* attributes on the source are application metadata, never configuration (no third way)", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("sourcedata"));
    return {
      create: combo.options.create,
      placeholder: combo.options.placeholder,
      match: combo.options.match,
      maxItems: combo.options.maxItems,
      separators: combo.options.separators,
    };
  });
  expect(state).toEqual({
    create: false,
    placeholder: "Search…",
    match: "includes",
    maxItems: 0,
    separators: [],
  });
});

test("boolean wrapper attributes honor =false and presence means true", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const wrap = document.getElementById("boolwrap");
    return wrap.combobox.options;
  });
  expect(state.create).toBe(false);
  expect(state.loadOnEmpty).toBe(false);
  expect(state.allowEmptyOption).toBe(false);
  expect(state.tabSelect).toBe(true);
});

test("search-fields attribute parses to a trimmed array", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => document.getElementById("sfwrap").combobox.options.searchFields);
  expect(state).toEqual(["label", "email"]);
});

test("JS options win over wrapper attributes", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(async () => {
    const wrap = document.getElementById("prio");
    const fromAttr = wrap.combobox.options.maxItems;
    wrap.configure({ maxItems: 9 });
    // configure() schedules a rebuild on a microtask; let it land.
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { fromAttr, afterConfigure: wrap.combobox.options.maxItems };
  });
  expect(state.fromAttr).toBe(3);
  expect(state.afterConfigure).toBe(9);
});

test("invalid numeric attributes fall back to DEFAULTS instead of spreading NaN", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => document.getElementById("invnum").combobox.options);
  expect(state.minChars).toBe(2);
  expect(state.maxItems).toBe(0);
  expect(state.debounce).toBe(200);
  expect(state.maxItems).not.toBeNaN();
  expect(state.debounce).not.toBeNaN();
});

test("changing an observed attribute rebuilds with the re-parsed option", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(async () => {
    const wrap = document.getElementById("prio");
    const before = wrap.combobox.options.maxItems;
    wrap.setAttribute("max-items", "8");
    wrap.setAttribute("create", "");
    // attributeChangedCallback schedules a rebuild on a microtask; let it land.
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { before, afterMax: wrap.combobox.options.maxItems, afterCreate: wrap.combobox.options.create };
  });
  expect(state.before).toBe(3);
  expect(state.afterMax).toBe(8);
  expect(state.afterCreate).toBe(true);
});
