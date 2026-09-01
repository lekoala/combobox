import { expect, test } from "@playwright/test";
import { modernSupported, rowsFor, setup } from "./helpers.js";

const FUZZY = "/test/fixtures/fuzzy.html";
const MODERN = "Modern Popover + Anchor support is required";

test.describe("match modes", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, FUZZY);
  });

  test("match:startswith matches the label prefix, not arbitrary substrings", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const ba = await rowsFor(page, "plain", "ba", { match: "startswith" });
    expect(ba.rows).toEqual(["Banana"]);
    const na = await rowsFor(page, "plain", "na", { match: "startswith" });
    expect(na.rows).toEqual([]);
    expect(na.empty).toBe(true);
  });

  test("custom match function receives item/query/context and returns the subset", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const combo = Combobox.getOrCreateInstance(document.getElementById("plain"), {
        match: (item, query, context) => {
          window.__matchCalls ??= [];
          window.__matchCalls.push({
            query,
            hasCombobox: context.combobox === combo,
            hasSource: context.source === document.getElementById("plain"),
          });
          return item.label.startsWith("B") && query !== "no-b";
        },
      });
      const input = combo.input;
      input.focus();
      input.value = "x";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const withB = combo.filteredItems.map((item) => item.label);

      input.value = "no-b";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const noB = combo.filteredItems.map((item) => item.label);
      return { withB, noB, calls: window.__matchCalls };
    });
    expect(state.withB).toEqual(["Banana", "Blackberry"]);
    expect(state.noB).toEqual([]);
    expect(state.calls.every((call) => call.hasCombobox && call.hasSource)).toBe(true);
    expect(state.calls.some((call) => call.query === "x")).toBe(true);
  });

  test("custom filter function narrows the default includes result", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const combo = Combobox.getOrCreateInstance(document.getElementById("plain"), {
        filter: (item) => item.label !== "Banana",
      });
      const input = combo.input;
      input.focus();
      input.value = "a";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      return combo.filteredItems.map((item) => item.label);
    });
    // Default includes matches everything carrying an "a"; the custom filter
    // narrows that subset by dropping Banana.
    expect(state).toEqual(["Strawberry", "Blackberry", "Apple pie"]);
  });

  test("match:pattern is case- and accent-insensitive", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    // "Sómething sour" matches through the folded spelling, from either side.
    const noAccent = await rowsFor(page, "plain", "som", { match: "pattern" });
    expect(noAccent.rows).toEqual(["Sómething sour"]);
    const accented = await rowsFor(page, "plain", "sóm", { match: "pattern" });
    expect(accented.rows).toEqual(["Sómething sour"]);
    const upper = await rowsFor(page, "plain", "SOM", { match: "pattern" });
    expect(upper.rows).toEqual(["Sómething sour"]);
  });

  test("match:pattern with a malformed query fails safely to no-results", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const state = await rowsFor(page, "plain", "(", { match: "pattern" });
    expect(state.rows).toEqual([]);
    expect(state.empty).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});

test.describe("field boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, FUZZY);
  });

  test("includes never crosses searchFields boundaries", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    // With joined text "AABB CCDD" the old model matched "BBCC"; per-field it
    // cannot span the label/data boundary.
    const crossing = await rowsFor(page, "boundary", "BBCC", {
      searchFields: ["label", "b"],
    });
    expect(crossing.rows).toEqual([]);

    const single = await rowsFor(page, "boundary", "BB", {
      searchFields: ["label", "b"],
    });
    expect(single.rows).toEqual(["AABB"]);

    const dataOnly = await rowsFor(page, "boundary", "DD", {
      searchFields: ["label", "b"],
    });
    expect(dataOnly.rows).toEqual(["AABB"]);
  });

  test("fuzzy never crosses searchFields boundaries", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const options = { match: "fuzzy", searchFields: ["label", "b"] };
    // "BD" and "ABCD" were subsequences of the old joined text but not of any
    // single field.
    const crossing = await rowsFor(page, "boundary", "BD", options);
    expect(crossing.rows).toEqual([]);
    const crossing2 = await rowsFor(page, "boundary", "ABCD", options);
    expect(crossing2.rows).toEqual([]);

    const single = await rowsFor(page, "boundary", "AA", options);
    expect(single.rows).toEqual(["AABB"]);
  });
});

test.describe("list state recovery", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, FUZZY);
  });

  test("backspacing out of no-results restores the options", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    await page.evaluate(() => {
      window.__combo = Combobox.getOrCreateInstance(document.getElementById("plain"));
      window.__combo.input.focus();
    });
    const input = page.locator("#plain + .cb-control .cb-input");

    await input.fill("zzz");
    await page.waitForTimeout(40);
    let state = await page.evaluate(() => ({
      rows: window.__combo.filteredItems.map((item) => item.label),
      empty: window.__combo.listbox.querySelector(".cb-empty") !== null,
    }));
    expect(state.rows).toEqual([]);
    expect(state.empty).toBe(true);

    await input.press("Backspace");
    await page.waitForTimeout(40);
    state = await page.evaluate(() => ({
      query: window.__combo.query,
      rows: window.__combo.filteredItems.map((item) => item.label),
      empty: window.__combo.listbox.querySelector(".cb-empty") !== null,
    }));
    // "zz" still matches nothing; only a real edit recovers the catalogue.
    expect(state.query).toBe("zz");
    expect(state.rows).toEqual([]);
    expect(state.empty).toBe(true);

    await input.fill("ba");
    await page.waitForTimeout(40);
    state = await page.evaluate(() => window.__combo.filteredItems.map((item) => item.label));
    expect(state).toEqual(["Banana"]);
  });

  test("data-filtered mirrors :filtered on source options and clears with the query", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const select = document.getElementById("plain");
      const combo = Combobox.getOrCreateInstance(select);
      const filterState = () => ({
        banana: select.querySelector('option[value="banana"]').hasAttribute("data-filtered"),
        strawberry: select.querySelector('option[value="strawberry"]').hasAttribute("data-filtered"),
      });

      combo.input.focus();
      combo.input.value = "ban";
      combo.input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const duringQuery = filterState();

      // Visibility and filtering are orthogonal: closing the picker does not
      // reset the dataset's filtered state.
      combo.hide();
      const closedStillFiltered = filterState();
      combo.input.focus();
      combo.input.value = "";
      combo.input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const afterClearQuery = filterState();

      combo.dispose();
      return { duringQuery, closedStillFiltered, afterClearQuery, afterDispose: filterState() };
    });
    expect(state.duringQuery).toEqual({ banana: false, strawberry: true });
    expect(state.closedStillFiltered).toEqual({ banana: false, strawberry: true });
    expect(state.afterClearQuery).toEqual({ banana: false, strawberry: false });
    expect(state.afterDispose).toEqual({ banana: false, strawberry: false });
  });
});

test.describe("pipeline contract", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, FUZZY);
  });

  test("an empty query never consults the matcher, even a custom one", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      let matchCalls = 0;
      const combo = Combobox.getOrCreateInstance(document.getElementById("plain"), {
        match: () => {
          matchCalls++;
          return false;
        },
      });
      combo.refresh();
      const afterRefresh = { matchCalls, rows: combo.filteredItems.map((item) => item.label) };
      combo.input.focus();
      combo.input.value = "x";
      combo.input.dispatchEvent(new Event("input", { bubbles: true }));
      const afterQuery = matchCalls;
      return { afterRefresh, afterQuery };
    });
    // Empty query: the custom matcher is never asked, every option shows.
    expect(state.afterRefresh).toEqual({
      matchCalls: 0,
      rows: ["Banana", "Strawberry", "Blackberry", "Sómething sour", "Apple pie"],
    });
    // Non-empty query: the custom matcher owns matching and rejects everything.
    expect(state.afterQuery).toBeGreaterThan(0);
  });

  test("an empty query still applies the filter admissibility gate", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const combo = Combobox.getOrCreateInstance(document.getElementById("plain"), {
        filter: (item) => item.value !== "banana",
      });
      combo.refresh();
      return combo.filteredItems.map((item) => item.label);
    });
    // "no textual search" is not "admit everything": the app-level filter vetoes
    // one option even without a query.
    expect(state).toEqual(["Strawberry", "Blackberry", "Sómething sour", "Apple pie"]);
  });
});
