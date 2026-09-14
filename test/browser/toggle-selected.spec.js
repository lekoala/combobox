import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";

function filter(selectId) {
  return `#${selectId} + .cb-control .cb-input`;
}

test.beforeEach(async ({ page }) => {
  await setup(page, FEATURES);
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
});

test("toggle-selected shows selected rows with aria-selected true", async ({ page }) => {
  const rows = await page.evaluate(() => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("tags"), { toggleSelected: true });
    combo.input.focus();
    combo.search("", { show: false, reason: "api" });
    return combo.visibleItems.map((item) => ({ label: item.label, selected: item.selected }));
  });
  expect(rows).toContainEqual({ label: "Apple", selected: true });
  expect(rows).toContainEqual({ label: "Banana", selected: false });
});

test("without toggle-selected selected rows stay hidden", async ({ page }) => {
  const rows = await page.evaluate(() => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("tags"));
    combo.input.focus();
    combo.search("", { show: false, reason: "api" });
    return combo.visibleItems.map((item) => item.label);
  });
  expect(rows).not.toContain("Apple");
  expect(rows).toContain("Banana");
});

test("Enter on a selected row deselects through the guarded remove path", async ({ page }) => {
  await page.evaluate(() => {
    const select = document.getElementById("tags");
    window.__events = [];
    for (const name of ["beforeremove", "remove", "beforeselect", "select"]) {
      select.addEventListener(`combobox:${name}`, () => window.__events.push(name));
    }
    const combo = Combobox.getOrCreateInstance(select, { toggleSelected: true });
    combo.input.focus();
    combo.search("", { show: true, reason: "api" });
    const index = combo.visibleItems.findIndex((item) => item.label === "Apple");
    combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    // Move to the selected row deterministically instead of assuming index 0.
    while (combo.activeIndex !== index) {
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    }
    combo.input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  });
  await page.waitForFunction(
    () => !document.getElementById("tags").querySelector('option[value="1"]').selected,
  );
  const state = await page.evaluate(() => ({
    selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
    events: window.__events,
    open: Combobox.getInstance(document.getElementById("tags")).isOpen(),
    focused: document.activeElement === Combobox.getInstance(document.getElementById("tags")).input,
  }));
  expect(state.selected).not.toContain("1");
  expect(state.events).toContain("beforeremove");
  expect(state.events).toContain("remove");
  expect(state.events).not.toContain("beforeselect");
  expect(state.open).toBe(true);
  expect(state.focused).toBe(true);
});

test("click on a selected row deselects and keeps native events exactly once", async ({ page }) => {
  await page.evaluate(() => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("tags"), { toggleSelected: true });
    combo.input.focus();
    combo.search("", { show: true, reason: "api" });
  });
  const input = page.locator(filter("tags"));
  await input.click();
  const row = page.locator(".cb-popover .cb-option[aria-selected='true']").first();
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForFunction(
    () => !document.getElementById("tags").querySelector('option[value="1"]').selected,
  );
  const native = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const select = document.getElementById("tags");
        let inputs = 0;
        let changes = 0;
        select.addEventListener("input", () => inputs++, { once: true });
        select.addEventListener("change", () => changes++, { once: true });
        // The toggle already happened above; re-select then toggle again to count events.
        const combo = Combobox.getInstance(select);
        combo.select("1");
        resolve({ inputs, changes });
      }),
  );
  expect(native.inputs).toBe(1);
  expect(native.changes).toBe(1);
});

test("guards.remove refusal blocks the toggle", async ({ page }) => {
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("tags"), {
      toggleSelected: true,
      guards: { remove: () => false },
    });
  });
  const input = page.locator(filter("tags"));
  await input.click();
  await page.locator(".cb-popover .cb-option[aria-selected='true']").first().click();
  await page.waitForTimeout(40);
  const selected = await page.evaluate(() =>
    Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
  );
  expect(selected).toContain("1");
});

test("toggle-selected keeps the active row at the same position", async ({ page }) => {
  await page.evaluate(async () => {
    const select = document.getElementById("tags");
    const combo = Combobox.getOrCreateInstance(select, { toggleSelected: true, autoselectFirst: true });
    combo.input.focus();
    await combo.search("", { show: true, reason: "api" });
    const press = (key) =>
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    // Select Banana (index 1); checking holds the position, so its
    // now-checked row is already active for the deselect Enter below.
    press("ArrowDown");
    press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

  // Dispatch without refocusing: a focus event would re-run search and reset
  // the active row before Enter is processed.
  await page.evaluate(() => {
    const combo = Combobox.getInstance(document.getElementById("tags"));
    combo.input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  });
  await page.waitForFunction(() => {
    const combo = Combobox.getInstance(document.getElementById("tags"));
    const banana = document.getElementById("tags").querySelector('option[value="2"]');
    const activeId = combo.input.getAttribute("aria-activedescendant");
    const activeRow = activeId ? document.getElementById(activeId) : null;
    return banana && !banana.selected && combo.activeIndex === 1 && activeRow?.dataset.index === "1";
  });
  const state = await page.evaluate(() => {
    const combo = Combobox.getInstance(document.getElementById("tags"));
    return {
      open: combo.isOpen(),
      focused: document.activeElement === combo.input,
    };
  });
  expect(state.open).toBe(true);
  expect(state.focused).toBe(true);
});

test("checking keeps the active row at the same position instead of jumping to the first", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const select = document.getElementById("tags");
    const combo = Combobox.getOrCreateInstance(select, { toggleSelected: true, autoselectFirst: true });
    combo.input.focus();
    await combo.search("", { show: true, reason: "api" });
    // Active starts on Apple (index 0, checked); move to Orange (index 2, unchecked).
    combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  // Dispatch without refocusing: a focus event would re-run search and reset
  // the active row before Enter is processed.
  await page.evaluate(() => {
    const combo = Combobox.getInstance(document.getElementById("tags"));
    combo.input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  });
  await page.waitForFunction(() => {
    const combo = Combobox.getInstance(document.getElementById("tags"));
    const orange = document.getElementById("tags").querySelector('option[value="3"]');
    const activeId = combo.input.getAttribute("aria-activedescendant");
    const activeRow = activeId ? document.getElementById(activeId) : null;
    return orange?.selected && combo.activeIndex === 2 && activeRow?.dataset.index === "2";
  });
  const state = await page.evaluate(() => {
    const combo = Combobox.getInstance(document.getElementById("tags"));
    return {
      open: combo.isOpen(),
      focused: document.activeElement === combo.input,
      input: combo.input.value,
    };
  });
  expect(state.open).toBe(true);
  expect(state.focused).toBe(true);
  expect(state.input).toBe("");
  await expect(page.locator('.cb-chip[data-value="3"]')).toHaveCount(1);
});

test("toggle-selected ignores disabled rows and single selects", async ({ page }) => {
  await page.evaluate(async () => {
    const mixed = document.getElementById("mixedclear");
    const mixedCombo = Combobox.getOrCreateInstance(mixed, { toggleSelected: true });
    await mixedCombo.search("", { show: true, reason: "api" });
  });
  // Clicking the disabled selected row is a no-op (no toggle, no select).
  const disabledRow = page.locator(".cb-popover .cb-option[aria-disabled='true']").first();
  await expect(disabledRow).toBeVisible();
  await disabledRow.click({ force: true });
  await page.waitForTimeout(40);
  const state = await page.evaluate(() => ({
    selected: Array.from(document.getElementById("mixedclear").selectedOptions, (o) => o.value),
    activeLandedDisabled: (() => {
      const combo = Combobox.getInstance(document.getElementById("mixedclear"));
      return combo.visibleItems[combo.activeIndex]?.disabled === true;
    })(),
  }));
  expect(state.selected).toContain("1");
  expect(state.selected).toContain("2");
});

test("toggle-selected follows the manipulated identity across a sort", async ({ page }) => {
  await page.evaluate(async () => {
    const select = document.getElementById("tags");
    const combo = Combobox.getOrCreateInstance(select, {
      toggleSelected: true,
      autoselectFirst: true,
      sort: (a, b) => Number(b.selected) - Number(a.selected),
    });
    combo.input.focus();
    await combo.search("", { show: true, reason: "api" });
    const press = (key) =>
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    // Select Banana, then move back onto Apple and deselect it: Apple sinks
    // below Banana, so only identity (not index 0) tracks it.
    press("ArrowDown");
    press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 30));
    press("ArrowUp");
    press("Enter");
  });
  await page.waitForFunction(() => {
    const combo = Combobox.getInstance(document.getElementById("tags"));
    const apple = document.getElementById("tags").querySelector('option[value="1"]');
    const banana = document.getElementById("tags").querySelector('option[value="2"]');
    const activeId = combo.input.getAttribute("aria-activedescendant");
    const activeRow = activeId ? document.getElementById(activeId) : null;
    return (
      apple &&
      !apple.selected &&
      banana?.selected &&
      combo.activeIndex === 1 &&
      activeRow?.dataset.index === "1" &&
      activeRow?.textContent.trim() === "Apple"
    );
  });
});

test("toggle-selected toggles the exact duplicate identity", async ({ page }) => {
  await page.evaluate(async () => {
    const select = document.getElementById("dupes");
    const combo = Combobox.getOrCreateInstance(select, { toggleSelected: true });
    combo.input.focus();
    await combo.search("", { show: true, reason: "api" });
    const press = (key) =>
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    // Second row: the unselected "same"-valued twin.
    press("ArrowDown");
    press("ArrowDown");
    press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 30));
    press("Enter");
  });
  await page.waitForFunction(() => {
    const select = document.getElementById("dupes");
    const combo = Combobox.getInstance(select);
    const selected = Array.from(select.selectedOptions);
    const activeId = combo.input.getAttribute("aria-activedescendant");
    const activeRow = activeId ? document.getElementById(activeId) : null;
    return (
      selected.length === 1 &&
      selected[0] === select.options[0] &&
      combo.activeIndex === 1 &&
      activeRow?.textContent.trim() === "Second label (same value)"
    );
  });
});

test("toggle-selected keeps a non-empty query and emits no filter", async ({ page }) => {
  await page.evaluate(async () => {
    const select = document.getElementById("tags");
    const combo = Combobox.getOrCreateInstance(select, { toggleSelected: true });
    combo.input.focus();
    combo.input.value = "an";
    combo.input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    // Count from here: typing already ran the search pipeline.
    window.__filterEvents = 0;
    combo.input.addEventListener("beforefilter", () => window.__filterEvents++);
    combo.input.addEventListener("filter", () => window.__filterEvents++);
    const press = (key) =>
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    // "an" matches Banana (0) and Orange (1): check Orange, then uncheck it.
    press("ArrowDown");
    press("ArrowDown");
    press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 30));
    press("Enter");
  });
  await page.waitForFunction(() => {
    const combo = Combobox.getInstance(document.getElementById("tags"));
    const orange = document.getElementById("tags").querySelector('option[value="3"]');
    const activeId = combo.input.getAttribute("aria-activedescendant");
    const activeRow = activeId ? document.getElementById(activeId) : null;
    return (
      orange &&
      !orange.selected &&
      combo.input.value === "an" &&
      combo.visibleItems.map((item) => item.label).join() === "Banana,Orange" &&
      combo.activeIndex === 1 &&
      activeRow?.dataset.index === "1"
    );
  });
  const filterEvents = await page.evaluate(() => window.__filterEvents);
  expect(filterEvents).toBe(0);
});

test("toggle-selected falls back to the neighbor when the row leaves", async ({ page }) => {
  await page.evaluate(async () => {
    const select = document.getElementById("tags");
    const combo = Combobox.getOrCreateInstance(select, {
      toggleSelected: true,
      autoselectFirst: true,
      filter: (item) => !item.selected,
    });
    combo.input.focus();
    await combo.search("", { show: true, reason: "api" });
    const press = (key) =>
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    // Visible: Banana (0), Orange (1). Checking Orange removes it from the
    // results: the manipulated identity is gone, the neighbor must win.
    press("ArrowDown");
    press("Enter");
  });
  await page.waitForFunction(() => {
    const combo = Combobox.getInstance(document.getElementById("tags"));
    const orange = document.getElementById("tags").querySelector('option[value="3"]');
    const activeId = combo.input.getAttribute("aria-activedescendant");
    const activeRow = activeId ? document.getElementById(activeId) : null;
    return (
      orange?.selected &&
      combo.visibleItems.map((item) => item.label).join() === "Banana" &&
      combo.activeIndex === 0 &&
      activeRow?.textContent.trim() === "Banana"
    );
  });
});

test("toggle-selected at maxItems still deselects but blocks additions", async ({ page }) => {
  await page.evaluate(async () => {
    const select = document.getElementById("overlimit");
    const combo = Combobox.getOrCreateInstance(select, { toggleSelected: true, maxItems: 2 });
    combo.input.focus();
    await combo.search("", { show: true, reason: "api" });
    const press = (key) =>
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    // Four (index 3) is unselected while 3 options are selected over the cap:
    // Enter must change nothing.
    press("ArrowDown");
    press("ArrowDown");
    press("ArrowDown");
    press("ArrowDown");
    press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 30));
    window.__afterBlocked = Array.from(select.selectedOptions, (o) => o.value);
    // Back to One (index 0) and deselect it: always allowed.
    press("ArrowUp");
    press("ArrowUp");
    press("ArrowUp");
    press("Enter");
  });
  await page.waitForFunction(() => {
    const select = document.getElementById("overlimit");
    const combo = Combobox.getInstance(select);
    const selected = Array.from(select.selectedOptions, (o) => o.value);
    return (
      window.__afterBlocked.join() === "1,2,3" &&
      selected.join() === "2,3" &&
      combo.isOpen() &&
      document.activeElement === combo.input
    );
  });
});
