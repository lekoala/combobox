import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";
const MODERN = "Modern Popover + floating placement support is required";

// Playwright supports touch emulation in Chromium and WebKit.
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "firefox", "Firefox touch emulation is unavailable");
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
  await expect(page.locator('.cb-chip[data-value="2"]')).toHaveCount(1);
  await expect(page.locator("#tags")).toHaveValues(["1", "2"]);
  await expect(input).toBeFocused();
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);
});

test("tap on a single select option selects and closes", async ({ page }) => {
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("capped")));

  await tap(page, page.locator("#capped + .cb-control .cb-input"));
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);

  await tap(page, page.locator(".cb-popover:visible .cb-option", { hasText: "Three" }));
  await expect(page.locator("#capped")).toHaveValue("3");
  await expect(page.locator(".cb-popover:visible")).toHaveCount(0);
});

test("tap removes a chip through the remove button", async ({ page }) => {
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("tags")));

  await tap(page, page.locator('.cb-chip[data-value="1"] .cb-chip-remove'));
  await expect(page.locator('.cb-chip[data-value="1"]')).toHaveCount(0);
  await expect(page.locator("#tags")).toHaveValues([]);
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
