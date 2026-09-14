import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const HTML = "/test/fixtures/titles.html";

test.beforeEach(async ({ page }) => {
  await setup(page, HTML);
});

test("native <option title> tooltips propagate to rows and chips", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("titled"));
    combo.input.focus();
    const row = [...document.querySelectorAll(".cb-popover .cb-option")].find((option) =>
      String(option.textContent).includes("Apple"),
    );
    return {
      rowTitle: row?.title || "",
      rowCount: document.querySelectorAll('.cb-popover .cb-option[title="Apple tooltip"]').length,
      chipTitle: document.querySelector('.cb-chip[data-value="2"]')?.title || "",
    };
  });

  expect(state.rowCount).toBe(1);
  expect(state.rowTitle).toBe("Apple tooltip");
  expect(state.chipTitle).toBe("Banana tooltip");
});

test("a selected remote result materializes its title onto the native option and chip", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  await page.evaluate(() => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("titled"));
    combo.select({ value: "9", label: "Remote", title: "Remote tooltip" });
  });
  await page.waitForFunction(
    () => document.getElementById("titled").querySelector('option[value="9"]')?.title === "Remote tooltip",
  );
  const chipTitle = await page.locator('.cb-chip[data-value="9"]').getAttribute("title");
  expect(chipTitle).toBe("Remote tooltip");
});

test("sync() keeps the materialized title on the DOM and the canonical item", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    // Single select: the selected row stays in the result store, so the
    // canonical item itself is observable (a multiple select hides selected
    // rows from filteredItems by design).
    const combo = Combobox.getOrCreateInstance(document.getElementById("titled-single"));
    combo.select({ value: "r", label: "Remote", title: "Remote tooltip" });
    combo.sync();
    const item = combo.filteredItems.find((entry) => entry.value === "r");
    return {
      nativeTitle: document.getElementById("titled-single").querySelector('option[value="r"]')?.title || "",
      itemTitle: item?.title || "",
    };
  });
  // The DOM assertion alone would pass through item.option?.title and hide a
  // readSourceItems() regression: the canonical item must carry it too.
  expect(state.nativeTitle).toBe("Remote tooltip");
  expect(state.itemTitle).toBe("Remote tooltip");
});

test("setOptions() preserves the title of a kept selected option", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("titled"));
    combo.setOptions([{ value: "3", label: "Orange" }]);
    return {
      nativeTitle: document.getElementById("titled").querySelector('option[value="2"]')?.title || "",
      selected: Array.from(document.getElementById("titled").selectedOptions, (o) => o.value),
    };
  });
  expect(state.selected).toEqual(["2"]);
  expect(state.nativeTitle).toBe("Banana tooltip");
  await expect(page.locator('.cb-chip[data-value="2"]')).toHaveAttribute("title", "Banana tooltip");
});
