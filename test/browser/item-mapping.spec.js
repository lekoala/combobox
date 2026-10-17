import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Data field mapping", () => {
  const FEATURES = "/test/fixtures/features.html";

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("labelField/valueField map data results and select materializes the native option", async ({
    page,
  }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      const select = document.getElementById("capped");
      const combo = Combobox.getOrCreateInstance(select, {
        labelField: "name",
        valueField: "id",
      });
      combo.setResults([{ id: "10", name: "Zucchini" }]);
      combo.applyFilter("zuc", { show: true });
    });

    await page.locator(".cb-popover:visible .cb-option", { hasText: "Zucchini" }).click();
    await page.waitForTimeout(40);

    const state = await page.evaluate(() => {
      const select = document.getElementById("capped");
      const option = select.querySelector('option[value="10"]');
      return { value: select.value, exists: option !== null, label: option?.textContent };
    });
    expect(state.value).toBe("10");
    expect(state.exists).toBe(true);
    expect(state.label.trim()).toBe("Zucchini");
  });
});

test.describe("Canonical native option labels", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("native option label wins over text content", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice"><option value="a" label="Display label">Text content</option></select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select);
      const result = { native: select.options[0].label, display: combo.input.value };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.native).toBe("Display label");
    expect(state.display).toBe("Display label");
  });
});
