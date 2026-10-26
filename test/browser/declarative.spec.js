import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const HTML = "/test/fixtures/declarative.html";

test("chip-class applies on every declarative rebuild and JS options take precedence", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover support is required");
  await page.evaluate(async () => {
    const wrap = document.createElement("combo-box");
    wrap.id = "classed";
    wrap.setAttribute("chip-class", "badge primary");
    wrap.innerHTML = '<select multiple name="tags"><option value="a" selected>Alpha</option></select>';
    document.body.append(wrap);
    await wrap.whenReady();
  });
  const chip = page.locator("#classed .cb-chip");
  await expect(chip).toHaveClass("cb-chip badge primary");
  await page.locator("#classed").evaluate((wrap) => wrap.setAttribute("chip-class", "updated"));
  await expect(chip).toHaveClass("cb-chip updated");
  await page.locator("#classed").evaluate((wrap) => wrap.configure({ chipClass: "override" }));
  await expect(chip).toHaveClass("cb-chip override");
  await page.locator("#classed").evaluate((wrap) => wrap.removeAttribute("chip-class"));
  await expect(chip).toHaveClass("cb-chip override");
  await expect(page.locator("#classed select")).toHaveValues(["a"]);
});

test("declarative rebuild preserves selected order by option identity", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover support is required");
  const state = await page.evaluate(async () => {
    const wrap = document.createElement("combo-box");
    wrap.setAttribute("selection-order", "selected");
    wrap.innerHTML = `
      <select multiple name="ordered[]">
        <option value="a" selected>Alpha</option>
        <option value="b" selected>Beta</option>
        <option value="c" selected>Gamma</option>
      </select>`;
    document.body.append(wrap);
    const before = await wrap.whenReady();
    before.move(wrap.querySelector('option[value="c"]'), 0);
    const identities = [...before.selectionOrder];
    wrap.setAttribute("chip-class", "updated");
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      rebuilt: wrap.combobox !== before,
      values: wrap.combobox.getSelectedValues(),
      identities: wrap.combobox.selectionOrder.every((option, index) => option === identities[index]),
    };
  });
  expect(state.rebuilt).toBe(true);
  expect(state.values).toEqual(["c", "a", "b"]);
  expect(state.identities).toBe(true);
});

test("declarative rebuild preserves duplicate-value identities and their explicit order", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover support is required");
  const state = await page.evaluate(async () => {
    const form = document.createElement("form");
    const wrap = document.createElement("combo-box");
    wrap.setAttribute("selection-order", "selected");
    wrap.innerHTML = `
      <select multiple name="dup[]">
        <optgroup label="Left">
          <option id="dup-a" value="2" selected>Two A</option>
          <option id="dup-b" value="1" selected>One</option>
        </optgroup>
        <optgroup label="Right">
          <option id="dup-c" value="2" selected>Two B</option>
        </optgroup>
      </select>`;
    form.append(wrap);
    document.body.append(form);
    const before = await wrap.whenReady();
    before.move(document.getElementById("dup-c"), 0);
    const identities = [...before.selectionOrder];
    wrap.setAttribute("chip-class", "updated");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const after = wrap.combobox;
    return {
      rebuilt: after !== before,
      sameOrder:
        after.selectionOrder.length === identities.length &&
        after.selectionOrder.every((option, index) => option === identities[index]),
      ids: after.selectionOrder.map((option) => option.id),
      values: after.getSelectedValues(),
      formValues: new FormData(form).getAll("dup[]"),
      chips: Array.from(wrap.querySelectorAll(".cb-chip"), (chip) => chip.dataset.value),
    };
  });
  expect(state).toEqual({
    rebuilt: true,
    sameOrder: true,
    ids: ["dup-c", "dup-a", "dup-b"],
    values: ["2", "2", "1"],
    formValues: ["2", "2", "1"],
    chips: ["2", "2", "1"],
  });
});

test("declarative rebuild drops a selected option removed from the source", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover support is required");
  const state = await page.evaluate(async () => {
    const wrap = document.createElement("combo-box");
    wrap.setAttribute("selection-order", "selected");
    wrap.innerHTML = `
      <select multiple name="gone[]">
        <option id="gone-a" value="a" selected>Alpha</option>
        <option id="gone-b" value="b" selected>Beta</option>
        <option id="gone-c" value="c" selected>Gamma</option>
      </select>`;
    document.body.append(wrap);
    const before = await wrap.whenReady();
    before.move(document.getElementById("gone-c"), 0);
    document.getElementById("gone-b").remove();
    wrap.setAttribute("chip-class", "updated");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const after = wrap.combobox;
    return {
      ids: after.selectionOrder.map((option) => option.id),
      values: after.getSelectedValues(),
      chips: Array.from(wrap.querySelectorAll(".cb-chip"), (chip) => chip.dataset.value),
    };
  });
  expect(state).toEqual({ ids: ["gone-c", "gone-a"], values: ["c", "a"], chips: ["c", "a"] });
});

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
