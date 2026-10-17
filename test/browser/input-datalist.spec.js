import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Native input selection events", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("input+datalist selection does not self-trigger a reload or reopen", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const wrap = document.createElement("div");
      wrap.innerHTML = '<input id="dl-load" list="dl-load-list"><datalist id="dl-load-list"></datalist>';
      document.body.append(wrap);
      const input = wrap.querySelector("input");
      const loads = [];
      const combo = Combobox.getOrCreateInstance(input, {
        load: (query) => {
          loads.push(query);
          return [{ value: "Paris", label: "Paris" }];
        },
        minChars: 0,
        debounce: 0,
      });
      input.focus();
      input.value = "Par";
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await tick(60);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await tick(20);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await tick(60);
      const loadsAfterSelect = loads.length;
      await tick(400);
      const result = {
        value: input.value,
        open: combo.isOpen(),
        loadsAfterSelect,
        loads: loads.slice(),
        grew: loads.length > loadsAfterSelect,
      };
      combo.dispose();
      wrap.remove();
      return result;
    });

    expect(state.value).toBe("Paris");
    expect(state.open).toBe(false);
    expect(state.grew).toBe(false);
    expect(state.loads).toEqual(["Par"]);
  });
});

test.describe("input+datalist blur with open picker", () => {
  const FEATURES = "/test/fixtures/sources.html";

  function init(page, id, options) {
    return page.evaluate(
      ([id, options]) => Combobox.getOrCreateInstance(document.getElementById(id), options),
      [id, options],
    );
  }

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("blurring an open input combobox closes cleanly without a select-backed call", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await init(page, "city2");
    const result = await page.evaluate(async () => {
      const combo = Combobox.getInstance(document.getElementById("city2"));
      combo.input.focus();
      const wasOpen = combo.isOpen() || combo.show();
      await new Promise((resolve) => setTimeout(resolve, 20));
      document.activeElement?.blur();
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { wasOpen, stillOpen: combo.isOpen(), value: document.getElementById("city2").value };
    });
    expect(result.wasOpen).toBe(true);
    expect(result.stillOpen).toBe(false);
    expect(pageErrors).toEqual([]);
  });
});
