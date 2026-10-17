import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Selection and clearing", () => {
  const FEATURES = "/test/fixtures/features.html";

  function control(id) {
    return `#${id} + .cb-control .cb-input`;
  }

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("closeOnSelect closes a multiple picker after selection", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"), { closeOnSelect: true });
    });

    const input = page.locator(control("tags"));
    await input.fill("Banana");
    await page.locator(".cb-popover:visible .cb-option", { hasText: "Banana" }).click();
    await page.waitForTimeout(40);

    await expect(page.locator(".cb-popover:visible")).toHaveCount(0);
    expect(await page.locator('#tags option[value="2"]').evaluate((o) => o.selected)).toBe(true);
  });

  test("clear() keeps disabled selections and removes the rest", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("mixedclear");
      const combo = Combobox.getOrCreateInstance(select);
      const result = await combo.clear();
      return {
        result,
        selected: Array.from(select.selectedOptions, (o) => o.value),
        chips: Array.from(document.querySelectorAll("#mixedclear + .cb-control .cb-chip")).map((chip) =>
          chip.getAttribute("data-value"),
        ),
      };
    });
    expect(state.result).toBe(true);
    expect(state.selected).toEqual(["2"]);
    expect(state.chips).toEqual(["2"]);
  });

  test("an external clear button clears through the public API, not DOM hacks", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      const combo = Combobox.getOrCreateInstance(document.getElementById("tags"));
      // The button is harness-owned; the app wires it without touching DOM below
      // the combobox — this binding lives in the test so the fixture never
      // depends on the engine global being present at parse time.
      document.getElementById("ext-clear").addEventListener("click", () => combo.clear());
    });
    await page.locator("#ext-clear").click();
    await page.waitForTimeout(40);
    const state = await page.evaluate(() => {
      const form = document.getElementById("form");
      return {
        selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
        chips: document.querySelectorAll("#tags + .cb-control .cb-chip").length,
        formData: new FormData(form).getAll("tags[]"),
      };
    });
    expect(state.selected).toEqual([]);
    expect(state.chips).toBe(0);
    expect(state.formData).toEqual([]);
  });
});

test.describe("Empty value selection", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("select({ value: '' }) refuses instead of throwing", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice"><option value="a">A</option></select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select);
      let threw = null;
      let returned = null;
      try {
        returned = combo.select({ value: "", label: "Empty" });
      } catch (error) {
        threw = error.message;
      }
      const result = { threw, returned, options: select.options.length };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.threw).toBeNull();
    expect(state.returned).toBe(false);
    expect(state.options).toBe(1);
  });
});

test.describe("select single/multiple source mapping", () => {
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

  test("single select filter shows the selected label and owns the native value", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "wrapped");
    const input = page.locator(control("wrapped"));
    await input.fill("Wiz");
    await page.locator(".cb-popover:visible .cb-option", { hasText: "Wizard" }).click();
    await page.waitForTimeout(40);

    expect(await input.inputValue()).toBe("Wizard");
    expect(await page.locator("#wrapped").inputValue()).toBe("w1");
  });

  test("explicit filter input is reused, unnamed and restored hidden on dispose", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "explicit");
    expect(await page.locator("#explicit + .cb-control .cb-input#explicit-filter").count()).toBe(1);

    await page.evaluate(() => Combobox.getInstance(document.getElementById("explicit")).dispose());
    await expect(page.locator("#explicit-filter")).toHaveAttribute("hidden", /.*/);
  });

  test("input[data-filter-for=id] discovery works", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "disc");
    await expect(page.locator("#disc + .cb-control .cb-input#disc-filter")).toHaveCount(1);
  });
});
