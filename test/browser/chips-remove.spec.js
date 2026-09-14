import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";
const MODERN = "Modern Popover + floating placement support is required";

function inputLocator(selectId) {
  return `#${selectId} + .cb-control .cb-input`;
}

function removeLocator(selectId, value) {
  return `#${selectId} + .cb-control .cb-chip[data-value="${value}"] .cb-chip-remove`;
}

const isOpen = (page, selectId) =>
  page.evaluate((id) => Combobox.getInstance(document.getElementById(id))?.isOpen() === true, selectId);

const activeIsInput = (page) =>
  page.evaluate(() => document.activeElement?.classList?.contains("cb-input") === true);

test.beforeEach(async ({ page }) => {
  await setup(page, FEATURES);
  test.skip(!(await modernSupported(page)), MODERN);
});

test("clicking a chip × while closed removes without opening the picker", async ({ page }) => {
  const input = page.locator(inputLocator("tags"));
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("tags"));
  });

  // Open, then close: the removal below starts from a closed picker.
  await input.focus();
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);
  await input.press("Escape");
  await expect(page.locator(".cb-popover:visible")).toHaveCount(0);

  await page.locator(removeLocator("tags", "1")).click();
  await expect(page.locator("#tags + .cb-control .cb-chip")).toHaveCount(0);
  expect(await isOpen(page, "tags")).toBe(false);
  expect(await activeIsInput(page)).toBe(true);
  expect(await page.locator('#tags option[value="1"]').evaluate((o) => o.selected)).toBe(false);
});

test("keyboard Delete on the last chip returns focus without opening", async ({ page }) => {
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("tags"));
    document.querySelector('#tags + .cb-control .cb-chip[data-value="1"]').focus();
  });
  await page.keyboard.press("Delete");

  await expect(page.locator("#tags + .cb-control .cb-chip")).toHaveCount(0);
  expect(await activeIsInput(page)).toBe(true);
  expect(await isOpen(page, "tags")).toBe(false);
});

test("removal while open keeps the picker open", async ({ page }) => {
  const input = page.locator(inputLocator("tags"));
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("tags"));
  });

  await input.focus();
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);

  await page.locator(removeLocator("tags", "1")).click();
  await expect(page.locator("#tags + .cb-control .cb-chip")).toHaveCount(0);
  expect(await isOpen(page, "tags")).toBe(true);
});

test("removal runs no search: no beforefilter, filter or load", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const counters = { beforefilter: 0, filter: 0, load: 0 };
    const combo = Combobox.getOrCreateInstance(document.getElementById("tags"), {
      debounce: 0,
      minChars: 0,
      load: async () => {
        counters.load += 1;
        return [];
      },
    });
    combo.input.addEventListener("beforefilter", () => {
      counters.beforefilter += 1;
    });
    combo.input.addEventListener("filter", () => {
      counters.filter += 1;
    });
    document
      .querySelector('#tags + .cb-control .cb-chip[data-value="1"] .cb-chip-remove')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    return {
      counters,
      chips: document.querySelectorAll("#tags + .cb-control .cb-chip").length,
      open: combo.isOpen(),
      focused: document.activeElement === combo.input,
    };
  });

  expect(state.chips).toBe(0);
  expect(state.counters).toEqual({ beforefilter: 0, filter: 0, load: 0 });
  expect(state.open).toBe(false);
  expect(state.focused).toBe(true);
});
