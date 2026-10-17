import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Reduced motion preference", () => {
  const FEATURES = "/test/fixtures/features.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
    test.skip(!(await modernSupported(page)), MODERN);
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
});
