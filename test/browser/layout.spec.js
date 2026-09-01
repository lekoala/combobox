import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const LAYOUT = "/test/fixtures/layout.html";
const MODERN = "Modern Popover + Anchor support is required";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  await setup(page, LAYOUT);
  test.skip(!(await modernSupported(page)), MODERN);
});

test("the picker anchors to the whole control width, even with wrapped chips", async ({ page }) => {
  const state = await page.evaluate(() => {
    const select = document.getElementById("chips");
    const combo = Combobox.getOrCreateInstance(select);
    combo.show();
    const control = select.nextElementSibling;
    const input = control.querySelector(".cb-input");
    const popover = combo.popover.getBoundingClientRect();
    const controlRect = control.getBoundingClientRect();
    const chipRows = new Set(
      Array.from(control.querySelectorAll(".cb-chip"), (chip) =>
        Math.round(chip.getBoundingClientRect().top),
      ).map((top) => Math.round(top)),
    ).size;
    return {
      rows: chipRows,
      controlWidth: controlRect.width,
      inputWidth: input.getBoundingClientRect().width,
      popoverWidth: popover.width,
      matchesControl: Math.abs(popover.width - controlRect.width) <= 2,
    };
  });
  expect(state.rows).toBeGreaterThanOrEqual(2);
  expect(state.inputWidth).toBeLessThan(state.controlWidth);
  expect(state.popoverWidth).toBeGreaterThanOrEqual(state.controlWidth * 0.95);
  expect(state.matchesControl).toBe(true);
});

test("the picker flips above when the viewport lacks block-end space", async ({ page }) => {
  const state = await page.evaluate(() => {
    const select = document.getElementById("bottom");
    const combo = Combobox.getOrCreateInstance(select);
    combo.show();
    const control = select.nextElementSibling;
    const controlRect = control.getBoundingClientRect();
    const popoverRect = combo.popover.getBoundingClientRect();
    return {
      open: combo.isOpen(),
      spaceBelow: window.innerHeight - controlRect.bottom,
      flipped: popoverRect.bottom <= controlRect.top + 5,
      withinViewport:
        popoverRect.top >= 0 &&
        popoverRect.bottom <= window.innerHeight + 1 &&
        popoverRect.left >= 0 &&
        popoverRect.right <= window.innerWidth + 1,
    };
  });
  expect(state.open).toBe(true);
  expect(state.spaceBelow).toBeLessThan(60);
  expect(state.withinViewport).toBe(true);
  expect(state.flipped).toBe(true);
});

test("pickers inside an input group, a floating label and a table cell stay on-screen and interactive", async ({
  page,
}) => {
  const state = await page.evaluate(async () => {
    const out = {};
    for (const id of ["grouped", "floaty", "tcell"]) {
      const select = document.getElementById(id);
      const combo = Combobox.getOrCreateInstance(select);
      combo.show();
      const rect = combo.popover.getBoundingClientRect();
      const row = combo.listbox.querySelector(".cb-option");
      const entry = {
        open: combo.isOpen(),
        withinViewport:
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight + 1 &&
          rect.left >= 0 &&
          rect.right <= window.innerWidth + 1,
        hasRow: row !== null,
      };
      if (row) {
        row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        entry.clickSelects = select.value !== "";
      }
      combo.dispose();
      out[id] = entry;
    }
    return out;
  });
  for (const id of ["grouped", "floaty", "tcell"]) {
    expect(state[id].open).toBe(true);
    expect(state[id].withinViewport).toBe(true);
    expect(state[id].hasRow).toBe(true);
    expect(state[id].clickSelects).toBe(true);
  }
});

test("scrolling the page never detaches the open picker from its anchor", async ({ page }) => {
  const state = await page.evaluate(() => {
    const select = document.getElementById("mid");
    const combo = Combobox.getOrCreateInstance(select);
    combo.show();
    const anchor = select.nextElementSibling;
    const dx = () => combo.popover.getBoundingClientRect().left - anchor.getBoundingClientRect().left;

    const before = { open: combo.isOpen(), dx: dx() };
    window.scrollTo(0, 120);
    window.dispatchEvent(new Event("scroll"));
    const rect = combo.popover.getBoundingClientRect();
    const after = {
      open: combo.isOpen(),
      dx: dx(),
      withinViewport: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
    };
    return { before, after };
  });
  expect(state.before.open).toBe(true);
  expect(state.after.open).toBe(true);
  // The horizontal offset between picker and anchor is unchanged after a scroll.
  expect(state.after.dx).toBeCloseTo(state.before.dx, 0);
  expect(state.after.withinViewport).toBe(true);
});

test("a long no-results message never creates horizontal scroll", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const long = "a long sentence that never, ever, ever wraps ".repeat(8);
    const combo = Combobox.getOrCreateInstance(document.getElementById("mid"), {
      messages: { noResults: long },
    });
    const input = combo.input;
    input.focus();
    input.value = "zzz-nothing";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    const empty = combo.listbox.querySelector(".cb-empty");
    return {
      emptyShown: empty !== null,
      popoverOverflow: combo.popover.scrollWidth - combo.popover.clientWidth,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      emptyHeight: empty ? empty.getBoundingClientRect().height : 0,
    };
  });
  expect(state.emptyShown).toBe(true);
  expect(state.popoverOverflow).toBeLessThanOrEqual(1);
  expect(state.docOverflow).toBeLessThanOrEqual(1);
  expect(state.emptyHeight).toBeGreaterThanOrEqual(38);
});

test("a long loading message stays contained in the popover", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const long = "loading ".repeat(60);
    const select = document.getElementById("lcity");
    let resolveLoad;
    const gate = new Promise((resolve) => (resolveLoad = resolve));
    const combo = Combobox.getOrCreateInstance(select, {
      debounce: 0,
      messages: { loading: long },
      load: () => gate,
    });
    const input = combo.input;
    input.focus();
    input.value = "a";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    const loading = combo.listbox.querySelector(".cb-loading");
    const result = {
      loadingShown: loading !== null,
      popoverOverflow: combo.popover.scrollWidth - combo.popover.clientWidth,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      loadingHeight: loading ? loading.getBoundingClientRect().height : 0,
    };
    resolveLoad([]);
    return result;
  });
  expect(state.loadingShown).toBe(true);
  expect(state.popoverOverflow).toBeLessThanOrEqual(1);
  expect(state.docOverflow).toBeLessThanOrEqual(1);
  expect(state.loadingHeight).toBeGreaterThanOrEqual(38);
});
