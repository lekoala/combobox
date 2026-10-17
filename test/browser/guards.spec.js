import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Guard decisions", () => {
  const FEATURES = "/test/fixtures/features.html";

  function control(id) {
    return `#${id} + .cb-control .cb-input`;
  }

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("guards.add: refusal blocks creation, allowance creates", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"), {
        create: true,
        guards: { add: ({ label }) => label !== "nope" },
      });
    });

    const input = page.locator(control("tags"));
    await input.fill("nope");
    await input.press("Enter");
    await page.waitForTimeout(40);
    await input.fill("plum");
    await input.press("Enter");
    await page.waitForTimeout(40);

    const states = await page.evaluate(() => {
      const select = document.getElementById("tags");
      return {
        values: Array.from(select.options, (o) => o.value),
        selected: Array.from(select.selectedOptions, (o) => o.value),
      };
    });
    expect(states.values).not.toContain("nope");
    expect(states.values).toContain("plum");
    expect(states.selected).toContain("plum");
  });

  test("guards.remove: refusal keeps the chip selected", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"), {
        guards: { remove: () => false },
      });
    });

    await page.locator('.cb-chip[data-value="1"] .cb-chip-remove').click();
    await page.waitForTimeout(40);

    expect(await page.locator('#tags option[value="1"]').evaluate((option) => option.selected)).toBe(true);
    await expect(page.locator('.cb-chip[data-value="1"]')).toHaveCount(1);
  });

  test("guards.remove rejection emits guarderror and leaves state unchanged", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      const select = document.getElementById("tags");
      window.__guardErrors = [];
      select.addEventListener("combobox:guarderror", (event) => {
        window.__guardErrors.push({ guard: event.detail.guard, message: event.detail.error.message });
      });
      Combobox.getOrCreateInstance(select, {
        guards: {
          remove: () => Promise.reject(new Error("app boom")),
        },
      });
    });

    await page.locator('.cb-chip[data-value="1"] .cb-chip-remove').click();
    await page.waitForTimeout(40);

    const state = await page.evaluate(() => ({
      selected: document.getElementById("tags").querySelector('option[value="1"]').selected,
      errors: window.__guardErrors,
    }));
    expect(state.selected).toBe(true);
    expect(state.errors).toEqual([{ guard: "remove", message: "app boom" }]);
  });

  test("guards.clear: cancelled confirmation resolves false and clears nothing", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const canceled = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const combo = Combobox.getOrCreateInstance(select, {
        guards: { clear: () => Promise.resolve(false) },
      });
      const result = await combo.clear();
      return { result, selected: Array.from(select.selectedOptions, (o) => o.value) };
    });
    expect(canceled.result).toBe(false);
    expect(canceled.selected).toEqual(["1"]);
  });

  test("guards.add rejection surfaces guarderror with zero unhandled rejections", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const guardErrors = [];
      const unhandled = [];
      window.addEventListener("unhandledrejection", (event) =>
        unhandled.push(event.reason?.message ?? String(event.reason)),
      );
      select.addEventListener("combobox:guarderror", (event) =>
        guardErrors.push({ guard: event.detail.guard, message: event.detail.error.message }),
      );
      const combo = Combobox.getOrCreateInstance(select, {
        create: true,
        guards: { add: async () => Promise.reject(new Error("app boom")) },
      });
      const input = combo.input;
      input.focus();
      input.value = "plum";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 40));
      return {
        guardErrors,
        unhandled,
        selected: Array.from(select.selectedOptions, (o) => o.value),
        hasPlum: Array.from(select.options, (o) => o.value).includes("plum"),
      };
    });
    expect(state.guardErrors).toEqual([{ guard: "add", message: "app boom" }]);
    expect(state.unhandled).toEqual([]);
    expect(state.selected).toEqual(["1"]);
    expect(state.hasPlum).toBe(false);
  });

  test("guards.clear rejection surfaces guarderror and keeps the selection", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const guardErrors = [];
      const unhandled = [];
      window.addEventListener("unhandledrejection", (event) =>
        unhandled.push(event.reason?.message ?? String(event.reason)),
      );
      select.addEventListener("combobox:guarderror", (event) =>
        guardErrors.push({ guard: event.detail.guard, message: event.detail.error.message }),
      );
      const combo = Combobox.getOrCreateInstance(select, {
        guards: { clear: async () => Promise.reject(new Error("app boom")) },
      });
      let result;
      try {
        result = await combo.clear();
      } catch (error) {
        result = `rejected: ${error.message}`;
      }
      return {
        result,
        guardErrors,
        unhandled,
        selected: Array.from(select.selectedOptions, (o) => o.value),
      };
    });
    // A rejected guard is an application error: it propagates to the
    // programmatic caller (unlike a voluntary `false` refusal) while the
    // generic guarderror event still fires and the selection is kept.
    expect(state.result).toBe("rejected: app boom");
    expect(state.guardErrors).toEqual([{ guard: "clear", message: "app boom" }]);
    expect(state.unhandled).toEqual([]);
    expect(state.selected).toEqual(["1"]);
  });
});

test.describe("Programmatic guard errors", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("a rejected guard rejects the programmatic caller", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice" multiple><option value="a" selected>A</option></select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select, {
        guards: {
          remove: async () => {
            throw new Error("broken guard");
          },
        },
      });
      let emitted = 0;
      select.addEventListener("combobox:guarderror", () => emitted++);
      let resolved;
      try {
        resolved = await combo.remove("a");
      } catch (error) {
        resolved = `rejected: ${error.message}`;
      }
      const result = { resolved, emitted, selected: Array.from(select.selectedOptions, (o) => o.value) };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.resolved).toBe("rejected: broken guard");
    expect(state.emitted).toBe(1);
    expect(state.selected).toEqual(["a"]);
  });
});
