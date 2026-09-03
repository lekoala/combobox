import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";
const MODERN = "Modern Popover + floating placement support is required";

test.beforeEach(async ({ page }) => {
  await setup(page, FEATURES);
  test.skip(!(await modernSupported(page)), MODERN);
});

test("picker rows and chips stay distinguishable under forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", colorScheme: "dark" });
  const supported = await page.evaluate(() => matchMedia("(forced-colors: active)").matches);
  if (!supported) test.skip(true, "Engine does not emulate forced-colors");

  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("tags")));
  const input = page.locator("#tags + .cb-control .cb-input");
  await input.click();
  await input.press("ArrowDown");

  const state = await page.evaluate(() => {
    const row =
      document.querySelector(".cb-popover [data-active]") || document.querySelector(".cb-popover .cb-option");
    const cs = getComputedStyle(row);
    const remove = document.querySelector(".cb-chip-remove");
    return {
      rowText: row?.textContent.trim() ?? null,
      color: cs.color,
      bg: cs.backgroundColor,
      distinguishable: cs.color !== cs.backgroundColor,
      removeVisible: remove ? remove.getBoundingClientRect().width > 0 : false,
      chipVisible: document.querySelector(".cb-chip")
        ? document.querySelector(".cb-chip").getBoundingClientRect().width > 0
        : false,
    };
  });

  expect(state.rowText).toBeTruthy();
  expect(state.distinguishable).toBe(true);
  expect(state.removeVisible).toBe(true);
  expect(state.chipVisible).toBe(true);
});

test("reduced motion applies: no animation or transition on the picker", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });

  const media = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  expect(media).toBe(true);

  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("capped")));
  const input = page.locator("#capped + .cb-control .cb-input");
  await input.click();
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);

  const motion = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector(".cb-popover"));
    return { transition: cs.transitionDuration, animation: cs.animationName };
  });
  expect(motion.transition).toBe("0s");
  expect(motion.animation).toBe("none");
});
