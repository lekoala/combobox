import { expect, test } from "@playwright/test";

// Functional smoke over the real demo page, which always loads the generated
// dist bundle. The engine is reached through the element's public .combobox
// getter (there are no library globals on a dist page).
const DEMO_HTML = "/demo/index.html";

async function demoEnhanced(page) {
  return page.evaluate(() => document.querySelector("combo-box")?.combobox?.mode === "enhanced");
}

test("fallback keeps native controls and cheap create input", async ({ page }) => {
  await page.goto(`${DEMO_HTML}?native=1`);

  await expect(page.locator("#tags")).toBeVisible();
  await expect(page.locator(".cb-popover")).toHaveCount(0);

  const fallback = page.locator("#tags + .cb-fallback-create");
  await expect(fallback).toBeVisible();
  await expect(fallback.locator("input")).not.toHaveAttribute("name", /.+/);

  await fallback.locator("input").fill("Modern CSS");
  await fallback.locator("button").click();

  expect(await page.locator('#tags option[value="Modern CSS"]').evaluate((option) => option.selected)).toBe(
    true,
  );
});

test("enhanced input keeps its datalist discoverable and popover stays open", async ({ page }) => {
  await page.goto(DEMO_HTML);
  test.skip(!(await demoEnhanced(page)), "Modern Popover + floating placement support is required");

  await expect(page.locator("#cities")).toHaveCount(1);
  await expect(page.locator("#city")).not.toHaveAttribute("list");

  await page.locator("#city").click();
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);
  await page.waitForTimeout(80);
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);
});

test("single select uses separate unnamed filter and preserves native value", async ({ page }) => {
  await page.goto(DEMO_HTML);
  test.skip(!(await demoEnhanced(page)), "Modern Popover + floating placement support is required");

  const filter = page.locator("#doctor-filter");
  await expect(filter).toBeVisible();
  await expect(filter).not.toHaveAttribute("name", /.+/);

  await filter.fill("Alice");
  const listboxId = await filter.getAttribute("aria-controls");
  await page.locator(`#${listboxId} .cb-option`, { hasText: "Alice Martin" }).click();

  await expect(page.locator("#doctor")).toHaveValue("101");
});

test("programmatic select materializes externally-created option", async ({ page }) => {
  await page.goto(DEMO_HTML);
  await page.locator("#add-doctor").click();

  await expect(page.locator('#doctor option[value="205"]')).toHaveText("Eva Dupont");
  await expect(page.locator("#doctor")).toHaveValue("205");
});

test("remote results remain transient until selected", async ({ page }) => {
  await page.goto(DEMO_HTML);
  test.skip(!(await demoEnhanced(page)), "Modern Popover + floating placement support is required");

  await expect(page.locator("#country option")).toHaveCount(1);
  const filter = page.locator("#country + .cb-control .cb-input");
  await filter.fill("Bel");

  const listboxId = await filter.getAttribute("aria-controls");
  const result = page.locator(`#${listboxId} .cb-option`, { hasText: "Belgium" });
  await expect(result).toBeVisible();

  // Search results must not turn the native select into a remote cache.
  await expect(page.locator("#country option")).toHaveCount(1);

  await result.click();
  await expect(page.locator('#country option[value="be"]')).toHaveCount(1);
  await expect(page.locator("#country")).toHaveValue("be");
});

test("selection order changes without moving catalogue options", async ({ page }) => {
  await page.goto(DEMO_HTML);
  test.skip(!(await demoEnhanced(page)), "Modern Popover + floating placement support is required");

  const before = await page
    .locator("#priorities option")
    .evaluateAll((options) => options.map((o) => o.value));

  await page.evaluate(() => {
    const combo = document.querySelector("#priorities-widget").combobox;
    combo.select("b");
    combo.select("c");
    combo.move("c", 0);
  });

  const order = await page.evaluate(() =>
    document.querySelector("#priorities-widget").combobox.getSelectedValues(),
  );
  expect(order).toEqual(["c", "b"]);

  const after = await page
    .locator("#priorities option")
    .evaluateAll((options) => options.map((o) => o.value));
  expect(after).toEqual(before);
});
