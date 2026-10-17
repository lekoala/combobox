import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Disabled option changes", () => {
  const FEATURES = "/test/fixtures/features.html";

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("disabled at runtime: toggling an option shows/hides the chip remove button", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"));
    });

    await page.evaluate(() => {
      const select = document.getElementById("tags");
      select.querySelector('option[value="1"]').disabled = true;
      Combobox.getInstance(select).refresh();
    });

    await expect(page.locator('.cb-chip[data-value="1"] .cb-chip-remove')).toHaveCount(0);
    await expect(page.locator('.cb-chip[data-value="1"]')).toHaveCount(1);

    await page.evaluate(() => {
      const select = document.getElementById("tags");
      select.querySelector('option[value="1"]').disabled = false;
      Combobox.getInstance(select).refresh();
    });
    await expect(page.locator('.cb-chip[data-value="1"] .cb-chip-remove')).toHaveCount(1);
  });
});

test.describe("Disabled optgroups", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("select(value) refuses options in a disabled optgroup", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice" multiple><optgroup label="Locked" disabled><option value="a">A</option></optgroup></select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select);
      const result = {
        selectedByValue: combo.select("a"),
        selected: combo.getSelectedValues(),
      };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.selectedByValue).toBe(false);
    expect(state.selected).toEqual([]);
  });

  test("optgroup-disabled selections cannot be removed and get no chip remove button", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice" multiple>
      <optgroup label="Locked" disabled><option value="a" selected>A</option></optgroup>
      <option value="b" selected>B</option>
    </select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select);
      const locked = select.options[0];
      const chipButtons = Array.from(
        form.querySelectorAll(".cb-chip"),
        (chip) => chip.querySelector(".cb-chip-remove") !== null,
      );
      const removedLocked = await combo.remove(locked);
      const cleared = await combo.clear();
      const result = {
        chipButtons,
        removedLocked,
        cleared,
        selected: Array.from(select.selectedOptions, (o) => o.value),
      };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.chipButtons).toEqual([false, true]);
    expect(state.removedLocked).toBe(false);
    expect(state.cleared).toBe(true);
    expect(state.selected).toEqual(["a"]);
  });
});

test.describe("optgroup / disabled propagation", () => {
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

  test("disabled option and disabled optgroup children cannot be selected by mouse", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "grouped");
    await page.locator(control("grouped")).click();
    await page.waitForTimeout(40);

    const disabledRows = page.locator(".cb-popover:visible .cb-option[aria-disabled='true']");
    expect(await disabledRows.allTextContents()).toEqual(["Banana (disabled)", "Carrot"]);

    await page
      .locator(".cb-popover:visible .cb-option", { hasText: "Banana (disabled)" })
      .dispatchEvent("click");
    await page.locator(".cb-popover:visible .cb-option", { hasText: "Carrot" }).dispatchEvent("click");
    expect(await page.locator("#grouped").inputValue()).toBe("");

    await page.locator(".cb-popover:visible .cb-option", { hasText: "Apple" }).dispatchEvent("click");
    expect(await page.locator("#grouped").inputValue()).toBe("apple");
  });

  test("keyboard navigation skips disabled options and disabled optgroup children", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "grouped");
    await page.locator(control("grouped")).click();
    await page.waitForTimeout(40);

    await page.evaluate(async () => {
      const combo = Combobox.getInstance(document.getElementById("grouped"));
      const input = combo.input;
      const active = [];
      combo.input.focus();
      for (let i = 0; i < 6; i++) {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (combo.activeIndex >= 0) active.push(combo.activeIndex);
      }
      window.__activePath = active;
    });

    const path = await page.evaluate(() => {
      const combo = Combobox.getInstance(document.getElementById("grouped"));
      return {
        activePath: window.__activePath,
        neverDisabled: window.__activePath.every((index) => {
          const item = combo.visibleItems[index];
          return item && !item.disabled;
        }),
      };
    });
    expect(path.activePath.length).toBeGreaterThan(0);
    expect(path.neverDisabled).toBe(true);
  });
});
