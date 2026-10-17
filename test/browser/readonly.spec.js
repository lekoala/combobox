import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Readonly interaction and programmatic values", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("a readonly select locks interaction but keeps the programmatic API", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const form = document.createElement("form");
      form.innerHTML = `<select id="ro-multi" name="ro" multiple readonly>
      <option value="a" selected>A</option>
      <option value="b" selected>B</option>
    </select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select);

      const removeButtons = form.querySelectorAll(".cb-chip-remove").length;

      combo.input.focus();
      await tick(30);
      const openOnFocus = combo.isOpen();

      // Backspace in the empty input must not remove the last selection either.
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
      await tick(30);
      const afterInputBackspace = Array.from(select.selectedOptions, (o) => o.value);

      const chip = form.querySelector(".cb-chip");
      chip.focus();
      chip.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
      await tick(30);
      const afterChipBackspace = Array.from(select.selectedOptions, (o) => o.value);

      const removed = await combo.remove("a");
      const result = {
        removeButtons,
        openOnFocus,
        afterInputBackspace,
        afterChipBackspace,
        removed,
        afterRemove: Array.from(select.selectedOptions, (o) => o.value),
      };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.removeButtons).toBe(0);
    expect(state.openOnFocus).toBe(false);
    expect(state.afterInputBackspace).toEqual(["a", "b"]);
    expect(state.afterChipBackspace).toEqual(["a", "b"]);
    expect(state.removed).toBe(true);
    expect(state.afterRemove).toEqual(["b"]);
  });
});

test.describe("Native disabled and readonly reflection", () => {
  const FEATURES = "/test/fixtures/sources.html";

  function control(id) {
    return `#${id} + .cb-control .cb-input`;
  }

  function init(page, id, options) {
    return page.evaluate(
      ([id, options]) => Combobox.getOrCreateInstance(document.getElementById(id), options),
      [id, options],
    );
  }

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("disabled and readonly source state is reflected on the filter input", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "dis");
    await init(page, "ro");
    expect(await page.locator(control("dis")).isDisabled()).toBe(true);
    expect(await page.locator(control("ro")).getAttribute("readonly")).not.toBeNull();

    await page.evaluate(() => {
      const select = document.getElementById("dis");
      select.disabled = false;
      Combobox.getInstance(select).refresh();
    });
    expect(await page.locator(control("dis")).isDisabled()).toBe(false);
  });
});
