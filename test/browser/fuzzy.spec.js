import { expect, test } from "@playwright/test";
import { modernSupported, rowsFor, setup } from "./helpers.js";

const HTML = "/test/fixtures/fuzzy.html";

test.beforeEach(async ({ page }) => {
  await setup(page, HTML);
});

test("search=fuzzy orders characters but keeps catalogue order", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const direct = await rowsFor(page, "fruits", "bnn");
  expect(direct.rows).toEqual(["Banana"]);

  const loose = await rowsFor(page, "fruits", "b");
  // Every option whose label carries a `b`, in source order — never re-ranked.
  expect(loose.rows).toEqual(["Banana", "Strawberry", "Blackberry"]);
});

test("fuzzy folds accents and case through normalize", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const accented = await rowsFor(page, "fruits", "som");
  expect(accented.rows).toEqual(["Sómething sour"]);
  const upper = await rowsFor(page, "fruits", "SOM");
  expect(upper.rows).toEqual(["Sómething sour"]);
});

test("fuzzy garbage shows the no-results row", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await rowsFor(page, "fruits", "qqx");
  expect(state.rows).toEqual([]);
  expect(state.empty).toBe(true);
});

test("a whitespace-only fuzzy query matches everything", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await rowsFor(page, "fruits", "   ");
  expect(state.rows.length).toBe(5);
});

test("match:'fuzzy' as a JS option behaves like the declarative attribute", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("plain");
    const combo = Combobox.getOrCreateInstance(select, { match: "fuzzy" });
    return combo.options.match;
  });
  expect(state).toBe("fuzzy");
  const js = await rowsFor(page, "plain", "bnn");
  expect(js.rows).toEqual(["Banana"]);
});

test("the default match stays includes and never fuzzy-matches subsequences", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const includes = await rowsFor(page, "plain", "bnn");
  expect(includes.rows).toEqual([]);
  expect(includes.empty).toBe(true);

  const contiguous = await rowsFor(page, "plain", "ana");
  expect(contiguous.rows).toEqual(["Banana"]);
});

test("fuzzy searches across item metadata declared as <option data-*>", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  // "jdoe" is a subsequence of john doe (label + email joined): only John.
  const state = await rowsFor(page, "people", "jdoe");
  expect(state.rows).toEqual(["John Doe"]);
});
