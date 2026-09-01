import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";

function inputLocator(selectId) {
  return `#${selectId} + .cb-control .cb-input`;
}

const activeChip = async (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return { value: el?.dataset?.value ?? null, kind: el?.className ?? String(el?.tagName) };
  });

const activeIsInput = async (page) =>
  page.evaluate(() => document.activeElement?.classList?.contains("cb-input") === true);

const focusChip = async (page, value) =>
  page.evaluate((v) => {
    document.querySelector(`.cb-chip[data-value="${v}"]`).focus();
  }, value);

test.beforeEach(async ({ page }) => {
  await setup(page, FEATURES);
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("overlimit"));
  });
});

test("ArrowLeft on an empty input focuses the last chip", async ({ page }) => {
  const input = page.locator(inputLocator("overlimit"));
  await input.focus();
  await input.press("ArrowLeft");

  const active = await activeChip(page);
  expect(active.value).toBe("3");
  expect(active.kind).toContain("cb-chip");
});

test("chips navigate with ArrowLeft/Right and hand focus back to the input", async ({ page }) => {
  const input = page.locator(inputLocator("overlimit"));
  await input.focus();
  await input.press("ArrowLeft"); // last chip "3"
  await page.keyboard.press("ArrowLeft"); // "2"
  expect((await activeChip(page)).value).toBe("2");
  await page.keyboard.press("ArrowRight"); // "3"
  expect((await activeChip(page)).value).toBe("3");
  await page.keyboard.press("ArrowRight"); // past last -> input
  expect(await activeIsInput(page)).toBe(true);
});

test("Home/End jump to the first/last chip", async ({ page }) => {
  await focusChip(page, "2");
  await page.keyboard.press("End");
  expect((await activeChip(page)).value).toBe("3");
  await page.keyboard.press("Home");
  expect((await activeChip(page)).value).toBe("1");
});

test("Escape on a chip returns to the search input", async ({ page }) => {
  await focusChip(page, "1");
  await page.keyboard.press("Escape");
  expect(await activeIsInput(page)).toBe(true);
});

test("Delete removes the focused chip and refocuses the neighbor", async ({ page }) => {
  await focusChip(page, "2");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(40);

  const state = await page.evaluate(() => ({
    chips: Array.from(document.querySelectorAll("#overlimit + .cb-control .cb-chip"), (chip) =>
      chip.getAttribute("data-value"),
    ),
    selected: Array.from(document.getElementById("overlimit").selectedOptions, (o) => o.value),
  }));
  expect(state.chips).toEqual(["1", "3"]);
  expect(state.selected).toEqual(["1", "3"]);
  const active = await activeChip(page);
  expect(active.value).toBe("3");

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(40);
  const activeAfter = await activeChip(page);
  expect(activeAfter.value).toBe("1");

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(40);
  expect(await activeIsInput(page)).toBe(true);
  expect(await page.locator("#overlimit + .cb-control .cb-chip").count()).toBe(0);
  expect(await page.locator('#overlimit option[value="1"]').evaluate((o) => o.selected)).toBe(false);
});

test("Left/Right inside a non-empty search move the caret and never focus a chip", async ({ page }) => {
  const input = page.locator(inputLocator("overlimit"));
  await input.focus();
  await input.fill("abcde");

  const caret = () =>
    page.evaluate(() => {
      const el = document.querySelector("#overlimit + .cb-control .cb-input");
      return { start: el.selectionStart, end: el.selectionEnd };
    });

  expect(await caret()).toEqual({ start: 5, end: 5 });

  await input.press("ArrowLeft");
  await input.press("ArrowLeft");
  expect(await caret()).toEqual({ start: 3, end: 3 });
  expect(await activeIsInput(page)).toBe(true);

  await input.press("ArrowRight");
  expect(await caret()).toEqual({ start: 4, end: 4 });
  expect(await activeIsInput(page)).toBe(true);

  // A selection collapses to its near boundary instead of handing focus to a chip.
  await input.press("Shift+ArrowLeft");
  const selected = await page.evaluate(() => {
    const el = document.querySelector("#overlimit + .cb-control .cb-input");
    return el.selectionEnd - el.selectionStart;
  });
  expect(selected).toBe(1);
  expect((await activeChip(page)).value).toBeNull();
  expect(await activeIsInput(page)).toBe(true);
});
