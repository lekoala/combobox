import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const HTML = "/test/fixtures/placeholder.html";

test.beforeEach(async ({ page }) => {
  await setup(page, HTML);
});

test("a disabled+hidden empty placeholder never becomes a chip", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(async () => {
    const select = document.getElementById("tagplace");
    const combo = Combobox.getOrCreateInstance(select);
    const before = {
      chips: document.querySelectorAll("#tagplace + .cb-control .cb-chip").length,
      emptyChips: document.querySelectorAll('.cb-chip[data-value=""]').length,
    };
    // Select a real value through the UI to confirm normal chips still render.
    combo.input.focus();
    combo.input.value = "Banana";
    combo.input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    const row = [...document.querySelectorAll(".cb-popover .cb-option")].find((option) =>
      String(option.textContent).includes("Banana"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      before,
      after: document.querySelectorAll("#tagplace + .cb-control .cb-chip").length,
      emptyChipsAfter: document.querySelectorAll('.cb-chip[data-value=""]').length,
      selected: Array.from(select.selectedOptions, (option) => option.value),
    };
  });

  expect(state.before.chips).toBe(0);
  expect(state.before.emptyChips).toBe(0);
  expect(state.after).toBe(1);
  expect(state.emptyChipsAfter).toBe(0);
  expect(state.selected).toEqual(["", "2"]);
});

test("the same placeholder on a single select reflects an empty label, never as a chip", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("singleplace");
    const combo = Combobox.getOrCreateInstance(select);
    return {
      // An empty-value placeholder is an empty selection: no chip (single has
      // none anyway) and an empty interaction label, while the source keeps the
      // placeholder option selected so native validation/reset stay untouched.
      label: combo.input.value,
      values: combo.getSelectedValues(),
      placeholderStillSelected: select.selectedOptions[0]?.disabled === true,
    };
  });

  expect(state.label).toBe("");
  expect(state.values).toEqual([""]);
  expect(state.placeholderStillSelected).toBe(true);
});

test("allowEmptyOption keeps the disabled+hidden placeholder out but honours real empty options", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("emptyok");
    const combo = Combobox.getOrCreateInstance(select, { allowEmptyOption: true });
    const before = document.querySelectorAll("#emptyok + .cb-control .cb-chip").length;
    // A real (never disabled/hidden) empty-value option selectable with
    // allowEmptyOption: append programmatically and select the exact option.
    const option = new Option("", "", true, true);
    select.append(option);
    combo.refresh();
    const after = document.querySelectorAll("#emptyok + .cb-control .cb-chip").length;
    const emptyChips = document.querySelectorAll('.cb-chip[data-value=""]').length;
    return { before, after, emptyChips };
  });

  expect(state.before).toBe(0);
  expect(state.after).toBe(1);
  expect(state.emptyChips).toBe(1);
});
