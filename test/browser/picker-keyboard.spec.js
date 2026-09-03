import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";
const SOURCES = "/test/fixtures/sources.html";
const PICKER = "/test/fixtures/picker.html";

function filter(selectId) {
  return `#${selectId} + .cb-control .cb-input`;
}

test.beforeEach(async ({ page }) => {
  await setup(page, FEATURES);
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
});

test("Home/End move the input caret and never hijack picker navigation", async ({ page }) => {
  await setup(page, FEATURES);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("capped"));
  });

  const input = page.locator(filter("capped"));
  await input.click();
  await input.fill("apple pineapple");

  await input.press("Home");
  const homeStart = await page.evaluate(() => {
    const combo = Combobox.getInstance(document.getElementById("capped"));
    return { start: combo.input.selectionStart, active: combo.activeIndex, open: combo.isOpen() };
  });

  await input.press("End");
  const endStart = await page.evaluate(() => {
    const combo = Combobox.getInstance(document.getElementById("capped"));
    return {
      start: combo.input.selectionStart,
      active: combo.activeIndex,
      open: combo.isOpen(),
      activedesc: combo.input.getAttribute("aria-activedescendant"),
    };
  });

  expect(homeStart.start).toBe(0);
  expect(homeStart.active).toBe(-1);
  expect(homeStart.open).toBe(true);
  const length = await input.evaluate((el) => el.value.length);
  expect(endStart.start).toBe(length);
  expect(endStart.active).toBe(-1);
  expect(endStart.open).toBe(true);
  expect(endStart.activedesc).toBeNull();
});

test("Home/End on a closed picker stay text-editing and never auto-open", async ({ page }) => {
  await setup(page, FEATURES);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("capped"));
  });

  const input = page.locator(filter("capped"));
  await input.click();
  await input.press("Escape");
  expect(await isOpen(page, "capped")).toBe(false);

  await input.press("Home");
  await input.press("End");
  expect(await isOpen(page, "capped")).toBe(false);
});

test("PageDown/PageUp step by a page and clamp at the edges", async ({ page }) => {
  await setup(page, PICKER);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("many"));
  });

  const input = page.locator(filter("many"));
  await input.click();

  const pageSize = await page.evaluate(() => {
    const popover = document.querySelector(".cb-popover");
    const row = popover?.querySelector(".cb-option");
    return Math.max(1, Math.floor((popover?.clientHeight || 0) / (row?.offsetHeight || 48)));
  });

  const steps = await page.evaluate(async () => {
    const combo = Combobox.getInstance(document.getElementById("many"));
    const input = combo.input;
    const press = (key) =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    const out = [];
    press("PageDown");
    out.push(combo.activeIndex);
    press("ArrowDown");
    out.push(combo.activeIndex);
    press("PageUp");
    out.push(combo.activeIndex);
    press("PageUp");
    out.push(combo.activeIndex);
    press("PageDown");
    out.push(combo.activeIndex);
    return out;
  });

  expect(steps).toEqual([pageSize - 1, pageSize, 0, 0, pageSize]);
});

test("PageUp/PageDown never land on disabled rows and clamp at the selectable edges", async ({ page }) => {
  await setup(page, PICKER);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("mixed"));
  });

  const input = page.locator(filter("mixed"));
  await input.click();

  const state = await page.evaluate(() => {
    const combo = Combobox.getInstance(document.getElementById("mixed"));
    const input = combo.input;
    const press = (key) =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    // Overshoot both edges: PageDown clamps at the last selectable row, PageUp
    // clamps at the first (skipping the scattered disabled rows throughout).
    for (let i = 0; i < 40; i++) press("PageDown");
    const down = combo.activeIndex;
    const downDisabled = combo.visibleItems[down]?.disabled;
    for (let i = 0; i < 40; i++) press("PageUp");
    const up = combo.activeIndex;
    return {
      down,
      downDisabled,
      up,
      upDisabled: combo.visibleItems[up]?.disabled,
      upLabel: combo.visibleItems[up]?.label,
    };
  });
  expect(state.down).toBe(29);
  expect(state.downDisabled).toBe(false);
  expect(state.up).toBe(0);
  expect(state.upDisabled).toBe(false);
  expect(state.upLabel).toBe("Item 1");
});

test("PageDown/PageUp and arrows open a closed picker; Escape closes and clears activedescendant", async ({
  page,
}) => {
  await setup(page, FEATURES);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("capped"));
  });

  const input = page.locator(filter("capped"));
  await input.click();
  await input.press("Escape");

  expect(await isOpen(page, "capped")).toBe(false);

  await input.press("PageDown");
  let state = await openState(page, "capped");
  expect(state.open).toBe(true);
  expect(state.activeDescendant).toBe(true);

  await input.press("Escape");
  await page.waitForFunction((id) => {
    const combo = Combobox.getInstance(document.getElementById(id));
    const activeId = combo.input.getAttribute("aria-activedescendant");
    // The popover toggle event that clears the attribute lands asynchronously
    // after hidePopover(); poll instead of asserting a single-shot snapshot.
    return !combo.isOpen() && activeId === null;
  }, "capped");

  await input.press("ArrowDown");
  state = await openState(page, "capped");
  expect(state.open).toBe(true);
  expect(state.activeIndex).toBe(0);
});

test("open/close events fire in order; beforeopen/beforeclose cancel without state flip", async ({
  page,
}) => {
  await setup(page, FEATURES);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("capped"));
  });

  const order = await page.evaluate(async () => {
    const select = document.getElementById("capped");
    const combo = Combobox.getOrCreateInstance(select);
    const events = [];
    for (const name of ["beforeopen", "open", "beforeclose", "close"]) {
      select.addEventListener(`combobox:${name}`, () => events.push(name));
    }
    combo.input.focus();
    await new Promise((resolve) => setTimeout(resolve, 0));
    combo.input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    return events;
  });
  expect(order).toEqual(["beforeopen", "open", "beforeclose", "close"]);
});

test("beforeopen preventDefault cancels opening; beforeclose preventDefault pins the picker open", async ({
  page,
}) => {
  await setup(page, FEATURES);
  const state = await page.evaluate(async () => {
    const select = document.getElementById("capped");
    const openBlocked = Combobox.getOrCreateInstance(select);

    const blocked = {};
    select.addEventListener("combobox:beforeopen", (event) => {
      event.preventDefault();
      blocked.opened = false;
    });
    select.addEventListener("combobox:open", () => (blocked.opened = true));
    openBlocked.input.focus();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const selection = { closeBlocked: false };
    const tags = document.getElementById("tags");
    const closeBlocked = Combobox.getOrCreateInstance(tags);
    tags.addEventListener("combobox:beforeclose", (event) => {
      event.preventDefault();
      selection.closeBlocked = true;
    });
    closeBlocked.input.focus();
    closeBlocked.input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );

    return {
      blockedOpen: blocked.opened,
      blockedPopover: openBlocked.popover.matches(":popover-open"),
      closeBlockedStillOpen: closeBlocked.popover.matches(":popover-open"),
    };
  });

  expect(state.blockedOpen).toBe(false);
  expect(state.blockedPopover).toBe(false);
  expect(state.closeBlockedStillOpen).toBe(true);
});

test("opening a second combobox closes the first", async ({ page }) => {
  await setup(page, FEATURES);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("capped"));
    Combobox.getOrCreateInstance(document.getElementById("tags"));
  });

  await page.locator(filter("capped")).click();
  expect(await isOpen(page, "capped")).toBe(true);

  await page.locator(filter("tags")).click();
  expect(await isOpen(page, "capped")).toBe(false);
  expect(await isOpen(page, "tags")).toBe(true);
});

test("option pointerdown keeps the filter focused; clicking outside closes", async ({ page }) => {
  await setup(page, FEATURES);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("capped"));
  });

  const input = page.locator(filter("capped"));
  await input.click();

  await page.locator(".cb-popover:visible .cb-option").first().dispatchEvent("pointerdown");
  const keptFocus = await page.evaluate(() => ({
    focused:
      document.activeElement ===
      document.getElementById("capped").nextElementSibling.querySelector(".cb-input"),
    open: document.querySelector(".cb-popover").matches(":popover-open"),
  }));
  expect(keptFocus.focused).toBe(true);
  expect(keptFocus.open).toBe(true);

  // Clicking the dedicated non-interactive target closes the picker.
  await page.locator("#blur-target").click();
  expect(await isOpen(page, "capped")).toBe(false);
});

test("focus and activedescendant survive filtering through async results", async ({ page }) => {
  await setup(page, SOURCES);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("city2"), {
      debounce: 0,
      load: (query, { signal }) =>
        new Promise((resolve) =>
          setTimeout(() => {
            if (signal.aborted) return;
            resolve([{ label: `Result ${query}`, value: `r${query}` }]);
          }, 30),
        ),
    });
  });

  await page.evaluate(async () => {
    const combo = Combobox.getInstance(document.getElementById("city2"));
    combo.input.focus();
    combo.input.value = "br";
    combo.input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
  });

  const state = await page.evaluate(() => {
    const combo = Combobox.getInstance(document.getElementById("city2"));
    const activeId = combo.input.getAttribute("aria-activedescendant");
    const activeRow = activeId ? document.getElementById(activeId) : null;
    return {
      focused: document.activeElement === combo.input,
      value: combo.input.value,
      rows: Array.from(document.querySelectorAll(".cb-option")).map((row) => row.textContent.trim()),
      activeDescendantValid: activeId ? activeRow?.classList.contains("cb-option") : null,
    };
  });
  expect(state.focused).toBe(true);
  expect(state.value).toBe("br");
  expect(state.rows).toEqual(["Result br"]);
  expect(state.activeDescendantValid).not.toBe(false);
});

test("Enter selects the active option on a single select", async ({ page }) => {
  await setup(page, FEATURES);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("capped"));
  });

  const input = page.locator(filter("capped"));
  await input.click();
  await input.press("ArrowDown");
  await input.press("Enter");
  await page.waitForTimeout(20);

  const state = await page.evaluate(() => {
    const select = document.getElementById("capped");
    return {
      value: select.value,
      label: select.nextElementSibling.querySelector(".cb-input").value,
      open: Combobox.getInstance(select).isOpen(),
    };
  });
  expect(state.value).toBe("1");
  expect(state.label).toBe("One");
  expect(state.open).toBe(false);
});

test("Escape never corrupts the source value", async ({ page }) => {
  await setup(page, FEATURES);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("capped"));
  });

  const input = page.locator(filter("capped"));
  await input.click();
  await input.press("Escape");
  await input.press("Escape");

  const state = await page.evaluate(() => ({
    value: document.getElementById("capped").value,
    open: Combobox.getInstance(document.getElementById("capped")).isOpen(),
  }));
  expect(state.value).toBe("");
  expect(state.open).toBe(false);
});

async function isOpen(page, selectId) {
  return page.evaluate(
    (id) => Combobox.getInstance(document.getElementById(id))?.isOpen() === true,
    selectId,
  );
}

async function openState(page, selectId) {
  return page.evaluate((id) => {
    const combo = Combobox.getInstance(document.getElementById(id));
    const activeId = combo.input.getAttribute("aria-activedescendant");
    const activeRow = activeId ? document.getElementById(activeId) : null;
    return {
      open: combo.isOpen(),
      activeIndex: combo.activeIndex,
      activeDescendant: activeId !== null && activeRow !== null,
    };
  }, selectId);
}
