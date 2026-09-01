import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";
const MODERN = "Modern Popover + Anchor support is required";

// Touch is exercised with Chromium's touch emulation only; Firefox/WebKit have
// no hasTouch context (the matrix runs them without touch interactions).
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Touch emulation is Chromium-only");
  await setup(page, FEATURES);
  test.skip(!(await modernSupported(page)), MODERN);
});

async function tap(page, locator) {
  const box = await locator.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

test("tap opens the picker", async ({ page }) => {
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("tags")));
  await tap(page, page.locator("#tags + .cb-control"));
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);
});

test("tap selects an option and keeps a multiple picker open", async ({ page }) => {
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("tags")));

  const input = page.locator("#tags + .cb-control .cb-input");
  await tap(page, input);
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);

  await tap(page, page.locator(".cb-popover:visible .cb-option", { hasText: "Banana" }));
  await page.waitForTimeout(80);

  await expect(page.locator('.cb-chip[data-value="2"]')).toHaveCount(1);
  expect(await page.locator("#tags option[value='2']").evaluate((option) => option.selected)).toBe(true);
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);
});

test("tap on a single select option selects and closes", async ({ page }) => {
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("capped")));

  await tap(page, page.locator("#capped + .cb-control .cb-input"));
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);

  await tap(page, page.locator(".cb-popover:visible .cb-option", { hasText: "Three" }));
  await page.waitForTimeout(80);

  await expect(page.locator("#capped")).toHaveValue("3");
  await expect(page.locator(".cb-popover:visible")).toHaveCount(0);
});

test("tap removes a chip through the remove button", async ({ page }) => {
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("tags")));

  await tap(page, page.locator('.cb-chip[data-value="1"] .cb-chip-remove'));
  await page.waitForTimeout(60);

  await expect(page.locator('.cb-chip[data-value="1"]')).toHaveCount(0);
});

test("tap outside the picker closes it", async ({ page }) => {
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("tags")));

  await tap(page, page.locator("#tags + .cb-control"));
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);

  // The dedicated non-interactive target closes the picker from outside.
  await tap(page, page.locator("#blur-target"));
  await page.waitForTimeout(60);
  await expect(page.locator(".cb-popover:visible")).toHaveCount(0);
});
