import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const RTL = "/test/fixtures/rtl.html";

test.beforeEach(async ({ page }) => {
  await setup(page, RTL);
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
});

test("chips flow right-to-left and the control does not overflow", async ({ page }) => {
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("rtl-multi"));
  });

  const first = page.locator(".cb-chip").first();
  const second = page.locator(".cb-chip").nth(1);
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();

  expect(firstBox.x).toBeGreaterThan(secondBox.x);

  const fits = await page.evaluate(() => {
    const control = document.querySelector("#rtl-multi + .cb-control");
    const rect = control.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= window.innerWidth + 1;
  });
  expect(fits).toBe(true);
});

test("picker opens in RTL, has no horizontal overflow and selects on click", async ({ page }) => {
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("rtl-single"));
  });

  const input = page.locator("#rtl-single + .cb-control .cb-input");
  await input.click();

  await expect(page.locator(".cb-popover:visible")).toHaveCount(1);
  const overflow = await page.evaluate(() => {
    const popover = document.querySelector(".cb-popover");
    return { overflow: popover.scrollWidth - popover.clientWidth, open: popover.matches(":popover-open") };
  });
  expect(overflow.open).toBe(true);
  expect(overflow.overflow).toBeLessThanOrEqual(1);

  await page.locator(".cb-popover:visible .cb-option", { hasText: "תל אביב" }).click();
  await page.waitForTimeout(40);

  const state = await page.evaluate(() => {
    const select = document.getElementById("rtl-single");
    return {
      value: select.value,
      label: select.nextElementSibling.querySelector(".cb-input").value,
    };
  });
  expect(state.value).toBe("t");
  expect(state.label).toBe("תל אביב");
});

test("keyboard navigation is physical in RTL", async ({ page }) => {
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("rtl-single"));
  });

  const input = page.locator("#rtl-single + .cb-control .cb-input");
  await input.click();
  await input.press("ArrowDown");
  await input.press("ArrowDown");

  const state = await page.evaluate(() => {
    const combo = Combobox.getInstance(document.getElementById("rtl-single"));
    return {
      activeIndex: combo.activeIndex,
      label: combo.visibleItems[combo.activeIndex]?.label,
    };
  });
  expect(state.activeIndex).toBe(1);
  expect(state.label).toBe("ירושלים");
});

test("Alt+ArrowLeft reorder is physical in RTL and never moves catalogue options", async ({ page }) => {
  const state = await page.evaluate(() => {
    const select = document.getElementById("rtl-multi");
    const combo = Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
    combo.select("3"); // selected order: 1, 2, 3
    const chip3 = Array.from(document.querySelectorAll("#rtl-multi + .cb-control .cb-chip")).find(
      (chip) => chip.dataset.value === "3",
    );
    chip3.focus();
    chip3.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true, cancelable: true }),
    );
    return {
      values: combo.getSelectedValues(),
      focused: document.activeElement?.dataset?.value ?? null,
      status: document.querySelector(".cb-status")?.textContent ?? "",
      catalogue: Array.from(select.options, (o) => o.value),
    };
  });
  expect(state.values).toEqual(["1", "3", "2"]);
  expect(state.focused).toBe("3");
  expect(state.status).toBe("סלט position 2 of 3");
  expect(state.catalogue).toEqual(["1", "2", "3"]);
});
