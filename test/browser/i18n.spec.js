import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const pageUrl = "/test/fixtures/i18n.html";

async function openNoMatch(page, selectId, options) {
  await page.evaluate(
    async ({ id, opts }) => {
      const combo = window.Combobox.getOrCreateInstance(document.getElementById(id), opts);
      await combo.setQuery("zzz", { show: true });
    },
    { id: selectId, opts: options },
  );
  await page.waitForTimeout(40);
}

async function reopenNoMatch(page, selectId) {
  await page.evaluate(async (id) => {
    const combo = window.Combobox.getInstance(document.getElementById(id));
    await combo.setQuery("zzz", { show: true });
  }, selectId);
  await page.waitForTimeout(40);
}

test("locale import applies to new instances only; per-instance messages win", async ({ page }) => {
  await setup(page, pageUrl);
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  const EMPTY = ".cb-popover:visible .cb-empty";

  await openNoMatch(page, "sel-a");
  expect(await page.locator(EMPTY).textContent()).toBe("No results");

  await page.evaluate(() => import("/src/locales/fr.js"));

  await openNoMatch(page, "sel-b");
  expect(await page.locator(EMPTY).textContent()).toBe("Aucun résultat");

  await openNoMatch(page, "sel-c", { messages: { noResults: "Custom empty row" } });
  expect(await page.locator(EMPTY).textContent()).toBe("Custom empty row");

  await reopenNoMatch(page, "sel-a");
  expect(await page.locator(EMPTY).textContent()).toBe("No results");
});
