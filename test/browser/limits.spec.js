import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Selection and rendering limits", () => {
  const FEATURES = "/test/fixtures/features.html";

  function control(id) {
    return `#${id} + .cb-control .cb-input`;
  }

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("maxOptions caps rendered options and keyboard navigation", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("capped"), {
        maxOptions: 2,
      });
    });

    const input = page.locator(control("capped"));
    await input.click();
    await expect(page.locator(".cb-popover:visible .cb-option")).toHaveCount(2);

    await input.press("ArrowDown");
    await input.press("ArrowDown");
    await input.press("ArrowDown");
    const activeId = await input.getAttribute("aria-activedescendant");
    const index = await page.evaluate((id) => {
      const option = document.getElementById(id);
      if (!option) return null;
      return Array.from(document.querySelectorAll(".cb-popover .cb-option")).indexOf(option);
    }, activeId);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(2);
  });

  test("maxItems never mutilates pre-existing native selection at init", async ({ page }) => {
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("overlimit"), { maxItems: 2 });
    });

    const state = await page.evaluate(() => ({
      selectedOptions: Array.from(document.getElementById("overlimit").selectedOptions, (o) => o.value),
      chips: Array.from(document.querySelectorAll("#overlimit + .cb-control .cb-chip")).map((chip) =>
        chip.getAttribute("data-value"),
      ),
    }));
    expect(state.selectedOptions).toEqual(["1", "2", "3"]);
    expect(state.chips).toEqual(["1", "2", "3"]);

    const blocked = await page.evaluate(() => {
      const select = document.getElementById("overlimit");
      const combo = Combobox.getInstance(select);
      const before = Array.from(select.selectedOptions, (o) => o.value);
      combo.select("4");
      return { before, after: Array.from(select.selectedOptions, (o) => o.value) };
    });
    expect(blocked.after).toEqual(blocked.before);

    await page.locator(".cb-chip[data-value='3'] .cb-chip-remove").click();
    await page.waitForTimeout(40);
    expect(await page.locator("#overlimit option[value='3']").evaluate((o) => o.selected)).toBe(false);
  });
});
