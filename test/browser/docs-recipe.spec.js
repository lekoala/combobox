import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const HTML = "/test/fixtures/docs-recipe.html";

test.beforeEach(async ({ page }) => {
  await setup(page, HTML);
});

test("README remote starter: configure() on the element wires load and materializes on select", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(async () => {
    const box = document.querySelector("combo-box.patients");

    box.configure({
      minChars: 2,

      async load(query) {
        const patients = { ja: ["Jane", "Jake"], jo: ["Joel"] };
        return Object.values(patients)
          .flat()
          .filter((name) => name.toLowerCase().startsWith(query.toLowerCase()))
          .map((label) => ({ value: label.toLowerCase(), label }));
      },
    });

    // configure() rebuilds the engine on a microtask; read it in the next tick.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const combo = box.combobox;
    const input = combo.input;
    input.focus();
    input.value = "ja";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const transient = combo.filteredItems.map((item) => item.label);

    input.value = "jake";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    combo.select(combo.filteredItems[0]);

    const select = box.querySelector("select");
    return {
      minChars: combo.options.minChars,
      transient,
      nativeLabels: Array.from(select.options).map((option) => option.label),
    };
  });
  expect(state.minChars).toBe(2);
  expect(state.transient).toEqual(["Jane", "Jake"]);
  expect(state.nativeLabels).toEqual(["Jake"]);
});

test("README search-fields comma form with spaces parses to the documented fields", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(
    () => document.getElementById("multifield").combobox.options.searchFields,
  );
  expect(state).toEqual(["label", "city", "specialty"]);
});
