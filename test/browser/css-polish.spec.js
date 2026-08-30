import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

function shotsDir() {
  return path.join(process.cwd(), ".temp", "screens");
}

async function capture(page, name) {
  if (!process.env.CSS_SHOTS) return;
  const dir = shotsDir();
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, name) });
}

test("no horizontal overflow in controls, picker or document at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await setup(page, "/");
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  const initial = await page.evaluate(() => ({
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    controls: Array.from(document.querySelectorAll(".cb-control, .cb-text-control")).map((el) => ({
      className: el.className,
      overflow: el.scrollWidth - el.clientWidth,
    })),
  }));
  expect(initial.docOverflow).toBeLessThanOrEqual(0);
  for (const control of initial.controls) {
    expect(control.overflow, control.className).toBeLessThanOrEqual(1);
  }

  await page.locator("#city").click();
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);

  const picker = await page.evaluate(() => {
    const popover = document.querySelector(".cb-popover");
    const empty = document.querySelector(".cb-empty");
    return {
      popoverOverflow: popover.scrollWidth - popover.clientWidth,
      emptyMinHeight: empty ? empty.getBoundingClientRect().height : 0,
    };
  });
  expect(picker.popoverOverflow).toBeLessThanOrEqual(1);
  await capture(page, "10-narrow-open-city.png");

  await page.locator("#city").fill("zzz");
  const noResults = await page.evaluate(() => {
    const popover = document.querySelector(".cb-popover");
    const empty = document.querySelector(".cb-empty");
    return {
      popoverOverflow: popover.scrollWidth - popover.clientWidth,
      emptyHeight: empty.getBoundingClientRect().height,
    };
  });
  expect(noResults.popoverOverflow).toBeLessThanOrEqual(1);
  expect(noResults.emptyHeight).toBeGreaterThanOrEqual(38);

  await page.keyboard.press("Escape");
  await setup(page, "/?native=1");
  const fallback = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(fallback).toBeLessThanOrEqual(0);
  await capture(page, "11-fallback-320.png");
});

test("picker adopts the control typography instead of the page font", async ({ page }) => {
  await setup(page, "/");
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  await page.locator("#city").click();
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);

  const fonts = await page.evaluate(() => {
    const popover = document.querySelector(".cb-popover");
    const input = document.getElementById("city");
    const sample = popover.querySelector(".cb-option, .cb-empty");
    return {
      popover: getComputedStyle(popover).fontFamily,
      input: getComputedStyle(input).fontFamily,
      body: getComputedStyle(document.body).fontFamily,
      option: sample ? getComputedStyle(sample).fontFamily : "",
    };
  });

  expect(fonts.popover).toBe(fonts.input);
  expect(fonts.option).toBe(fonts.input);
  expect(fonts.input).not.toBe(fonts.body);
});

test("input combobox and single-select control share geometry", async ({ page }) => {
  await setup(page, "/");
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  const geometry = await page.evaluate(() => {
    const input = document.querySelector("#city");
    const control = document.querySelector("#doctor + .cb-control");
    const inputStyle = getComputedStyle(input);
    const controlStyle = getComputedStyle(control);
    return {
      inputHeight: input.getBoundingClientRect().height,
      controlHeight: control.getBoundingClientRect().height,
      inputRadius: inputStyle.borderRadius,
      controlRadius: controlStyle.borderRadius,
      inputBorder: inputStyle.borderTopColor,
      controlBorder: controlStyle.borderTopColor,
    };
  });

  expect(Math.abs(geometry.inputHeight - geometry.controlHeight)).toBeLessThanOrEqual(1);
  expect(geometry.inputRadius).toBe(geometry.controlRadius);
  expect(geometry.inputBorder).toBe(geometry.controlBorder);
});

test("chips stay compact and remove is a real hit target", async ({ page }) => {
  await setup(page, "/");
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  const geometry = await page.evaluate(() => {
    const control = document.querySelector("#specialties + .cb-control");
    const chip = control.querySelector(".cb-chip");
    const remove = chip.querySelector(".cb-chip-remove");
    const chipRect = chip.getBoundingClientRect();
    const removeRect = remove.getBoundingClientRect();
    const labelRect = chip.querySelector(".cb-chip-label").getBoundingClientRect();
    return {
      chipHeight: chipRect.height,
      controlHeight: control.getBoundingClientRect().height,
      removeWidth: removeRect.width,
      removeHeight: removeRect.height,
      removeIsAfterLabel: removeRect.x >= labelRect.x,
      chipRadius: getComputedStyle(chip).borderRadius,
    };
  });

  expect(geometry.chipHeight).toBeLessThan(geometry.controlHeight);
  expect(geometry.removeWidth).toBeGreaterThanOrEqual(20);
  expect(geometry.removeHeight).toBeGreaterThanOrEqual(20);
  expect(geometry.removeIsAfterLabel).toBe(true);
  expect(geometry.chipRadius).not.toBe("999px");
});

test("long chip labels truncate instead of widening the control", async ({ page }) => {
  await setup(page, "/");
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  const overflow = await page.evaluate(async () => {
    const wrap = document.createElement("combo-box");
    wrap.style.width = "180px";
    wrap.innerHTML =
      `<select multiple>` +
      `<option value="a" selected>A very very long chip label that must truncate instead of widening the control</option>` +
      `<option value="b">Short</option>` +
      `</select>`;
    document.body.append(wrap);
    await wrap.whenReady();
    const chip = wrap.querySelector(".cb-chip");
    const label = wrap.querySelector(".cb-chip-label");
    return {
      chipOverflow: chip.scrollWidth - chip.clientWidth,
      labelOverflow: label.scrollWidth - label.clientWidth,
      chipWidth: chip.getBoundingClientRect().width,
      wrapWidth: wrap.getBoundingClientRect().width,
    };
  });

  expect(overflow.chipOverflow).toBeLessThanOrEqual(1);
  expect(overflow.labelOverflow).toBeGreaterThan(0);
  expect(overflow.chipWidth).toBeLessThanOrEqual(overflow.wrapWidth);
});

test("long option labels truncate without horizontal picker scroll", async ({ page }) => {
  await setup(page, "/");
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  const overflow = await page.evaluate(async () => {
    const wrap = document.createElement("combo-box");
    wrap.style.width = "220px";
    wrap.innerHTML =
      `<select>` +
      `<option value="">—</option>` +
      `<option value="long">A very very long option label used to verify ellipsis truncation in narrow pickers</option>` +
      `</select>`;
    document.body.append(wrap);
    const combo = await wrap.whenReady();
    combo.show();
    const option = combo.listbox.querySelector(".cb-option");
    const label = option.querySelector(".cb-option-label");
    const result = {
      optionOverflow: option.scrollWidth - option.clientWidth,
      labelOverflow: label.scrollWidth - label.clientWidth,
      popoverOverflow: combo.popover.scrollWidth - combo.popover.clientWidth,
      rowHeight: option.getBoundingClientRect().height,
    };
    combo.hide();
    return result;
  });

  expect(overflow.optionOverflow).toBeLessThanOrEqual(1);
  expect(overflow.labelOverflow).toBeGreaterThan(0);
  expect(overflow.popoverOverflow).toBeLessThanOrEqual(1);
  expect(overflow.rowHeight).toBeGreaterThanOrEqual(38);
});

test("rtl mirrors chips and keeps remove at the inline start", async ({ page }) => {
  await setup(page, "/");
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  const rtl = await page.evaluate(() => {
    const control = document.querySelector("#rtl-tags + .cb-control") || document.querySelector("#rtl-tags");
    const chips = Array.from(control.querySelectorAll(".cb-chip"));
    const first = chips[0].getBoundingClientRect();
    const second = chips[1].getBoundingClientRect();
    const remove = chips[0].querySelector(".cb-chip-remove").getBoundingClientRect();
    const label = chips[0].querySelector(".cb-chip-label").getBoundingClientRect();
    return {
      chipCount: chips.length,
      firstLabel: chips[0].querySelector(".cb-chip-label").textContent,
      isReversed: first.x > second.x,
      removeBeforeLabel: remove.x < label.x,
      rtlDirection: getComputedStyle(control).direction,
    };
  });

  expect(rtl.chipCount).toBe(2);
  expect(rtl.rtlDirection).toBe("rtl");
  expect(rtl.isReversed).toBe(true);
  expect(rtl.removeBeforeLabel).toBe(true);
});

test("screenshot catalog for manual review", async ({ page }) => {
  test.skip(!process.env.CSS_SHOTS, "Set CSS_SHOTS=1 to write screenshots");
  await setup(page, "/");
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  await capture(page, "01-page-light.png");

  await page.setViewportSize({ width: 320, height: 900 });
  await capture(page, "02-page-narrow.png");

  await page.setViewportSize({ width: 1000, height: 800 });
  await page.evaluate(() => {
    document.body.style.background = "#1e2430";
  });
  await page.locator("#doctor-filter").focus();
  await capture(page, "03-dark-focus-single.png");

  await page.evaluate(() => {
    document.body.style.background = "";
  });
  await page.locator("#city").click();
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);
  await capture(page, "04-picker-open-city.png");
  await page.keyboard.press("Escape");

  await page.locator("#tags ~ .cb-control .cb-input").fill("zzz");
  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);
  await capture(page, "05-create-row.png");

  await setup(page, "/?native=1");
  await expect(page.locator(".cb-popover")).toHaveCount(0);
  await capture(page, "06-fallback.png");
});
