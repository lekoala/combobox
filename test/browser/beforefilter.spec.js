import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";
const MODERN = "Modern Popover + Anchor support is required";

test.beforeEach(async ({ page }) => {
  await setup(page, FEATURES);
  test.skip(!(await modernSupported(page)), MODERN);
});

test("the default pipeline fires beforefilter before filter with the matching query", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("capped"));
    const input = combo.input;
    // beforefilter/filter are emitted on the interaction input (Open UI style).
    const events = [];
    input.addEventListener("beforefilter", (event) =>
      events.push({
        type: "beforefilter",
        query: event.detail.query,
        direct: event.query,
        cancelable: event.cancelable,
        reason: event.detail.reason,
      }),
    );
    input.addEventListener("filter", (event) =>
      events.push({ type: "filter", query: event.detail.query, manual: Boolean(event.detail.manual) }),
    );
    input.focus();
    input.value = "Tw";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    // The focus-driven search fires its own beforefilter(""); keep the
    // input-driven pair for this query.
    return events.filter((event) => event.query === "Tw");
  });
  expect(state[0]).toEqual({
    type: "beforefilter",
    query: "Tw",
    direct: "Tw",
    cancelable: true,
    reason: "input",
  });
  expect(state[1]).toEqual({ type: "filter", query: "Tw", manual: false });
  expect(state[0].type).toBe("beforefilter");
  expect(state[1].type).toBe("filter");
});

test("preventDefault on beforefilter stops both the load and the built-in filter", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("capped"), {
      debounce: 0,
      load: async () => {
        window.__loads = (window.__loads ?? 0) + 1;
        return [{ value: "x", label: "Remote X" }];
      },
    });
    const input = combo.input;
    const filters = [];
    input.addEventListener("beforefilter", (event) => event.preventDefault());
    input.addEventListener("filter", (event) => filters.push(event.detail.query));
    input.focus();
    input.value = "Tw";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      loads: window.__loads ?? 0,
      filters,
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option"), (row) => row.textContent.trim()),
    };
  });
  expect(state.loads).toBe(0);
  expect(state.filters).toEqual([]);
  expect(state.rows).toContain("One");
  expect(state.rows).not.toContain("Remote X");
});

test("a canceled beforefilter can apply custom transient results without refiring", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("capped"));
    let beforeCount = 0;
    let filterCount = 0;
    const input = combo.input;
    input.addEventListener("beforefilter", (event) => {
      beforeCount++;
      event.preventDefault();
      const query = event.query;
      combo.setResults([{ value: "p1", label: "Plump apricot" }]).applyFilter(query, { show: true });
    });
    input.addEventListener("filter", () => filterCount++);
    input.focus();
    input.value = "plu";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    return {
      focused: document.activeElement === input,
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option"), (row) => row.textContent.trim()),
      query: combo.query,
      beforeCount,
      filterCount,
    };
  });
  expect(state.rows).toEqual(["Plump apricot"]);
  expect(state.query).toBe("plu");
  expect(state.focused).toBe(true);
  // focus + the "plu" input each fire beforefilter once; the manual
  // applyFilter() inside the handler must not add a third.
  expect(state.beforeCount).toBe(2);
  expect(state.filterCount).toBe(2);
});

test("manual applyFilter never fires beforefilter", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("capped"));
    const input = combo.input;
    let beforeCount = 0;
    input.addEventListener("beforefilter", () => beforeCount++);
    combo.setResults([{ value: "m1", label: "Manual row" }]);
    combo.applyFilter("man", { show: true });
    await new Promise((resolve) => setTimeout(resolve, 40));
    return {
      beforeCount,
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option"), (row) => row.textContent.trim()),
    };
  });
  expect(state.beforeCount).toBe(0);
  expect(state.rows).toEqual(["Manual row"]);
});

test("focus stays in the search input while results are replaced", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("capped"));
    const input = combo.input;
    input.focus();
    combo.setResults([{ value: "r1", label: "Replaced" }]);
    combo.applyFilter("", { show: true });
    await new Promise((resolve) => setTimeout(resolve, 40));
    return {
      focused: document.activeElement === input,
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option"), (row) => row.textContent.trim()),
    };
  });
  expect(state.focused).toBe(true);
  expect(state.rows).toEqual(["Replaced"]);
});
