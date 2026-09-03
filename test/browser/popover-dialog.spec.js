import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const HTML = "/test/fixtures/dialog.html";

test.beforeEach(async ({ page }) => {
  await setup(page, HTML);
});

test("the picker lives inside a modal dialog, stays interactive and never becomes inert", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  await page.click("#open");

  const state = await page.evaluate(async () => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("fruit"));
    const dialog = document.getElementById("dlg");
    const isDescendant = combo.popover.parentElement === dialog;
    combo.input.focus();
    combo.input.value = "Banana";
    combo.input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    const open = combo.isOpen();
    const row = [...document.querySelectorAll(".cb-popover .cb-option")].find((option) =>
      String(option.textContent).includes("Banana"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      isDescendant,
      open,
      clickable: row !== null,
      selected: Array.from(document.getElementById("fruit").selectedOptions, (option) => option.value),
      chip: !!document.querySelector('.cb-chip[data-value="2"]'),
      dialogStillOpen: dialog.matches(":modal"),
      popoverInTopLayer: combo.popover.matches(":popover-open") || !combo.isOpen(),
    };
  });

  expect(state.isDescendant).toBe(true);
  expect(state.open).toBe(true);
  expect(state.clickable).toBe(true);
  expect(state.selected).toEqual(["2"]);
  expect(state.chip).toBe(true);
  expect(state.dialogStillOpen).toBe(true);
  expect(state.popoverInTopLayer).toBe(true);
});

test("Escape closes the enhanced picker first and only then the dialog", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  await page.click("#open");
  await page.evaluate(() => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("fruit"));
    combo.input.focus();
  });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(20);
  const afterFirst = await page.evaluate(() => ({
    pickerOpen: Combobox.getInstance(document.getElementById("fruit")).isOpen(),
    dialogOpen: document.getElementById("dlg").matches(":modal"),
  }));
  expect(afterFirst.pickerOpen).toBe(false);
  expect(afterFirst.dialogOpen).toBe(true);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(20);
  const afterSecond = await page.evaluate(() => document.getElementById("dlg").matches(":modal"));
  expect(afterSecond).toBe(false);
});

test("dispose() removes the popover even when the dialog was closed first", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  await page.click("#open");
  const state = await page.evaluate(() => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("fruit"));
    document.getElementById("dlg").close();
    combo.dispose();
    return {
      popoverConnected: combo.popover.isConnected,
      controlGone: !document.querySelector("#fruit + .cb-control"),
      sourceVisible: getComputedStyle(document.getElementById("fruit")).display !== "none",
    };
  });
  expect(state.popoverConnected).toBe(false);
  expect(state.controlGone).toBe(true);
  expect(state.sourceVisible).toBe(true);
});
