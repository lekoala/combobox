import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const HTML = "/test/fixtures/titles.html";

test.beforeEach(async ({ page }) => {
  await setup(page, HTML);
});

test("native <option title> tooltips propagate to rows and chips", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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
