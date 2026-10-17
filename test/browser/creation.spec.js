import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Creation decisions and interaction", () => {
  const FEATURES = "/test/fixtures/features.html";

  function control(id) {
    return `#${id} + .cb-control .cb-input`;
  }

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("createOnBlur creates on real leave but never on chip removal", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"), {
        create: true,
        createOnBlur: true,
      });
    });

    const input = page.locator(control("tags"));
    await input.fill("plum");
    await page.locator("#blur-target").click();
    await page.waitForTimeout(40);

    const afterLeaf = await page.evaluate(() => ({
      selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
    }));
    expect(afterLeaf.selected).toContain("plum");

    // Internal interaction (focus into the control subtree) must never
    // blur-create: it is a leave-internal transition, not a real leave.
    const remove = page.locator('.cb-chip[data-value="1"] .cb-chip-remove');
    await input.fill("ghost");
    await remove.focus();
    await page.waitForTimeout(40);
    const focusedInside = await page.evaluate(() => ({
      selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
      hasGhost: Array.from(document.getElementById("tags").options, (o) => o.value).includes("ghost"),
    }));
    expect(focusedInside.selected).toContain("1");
    expect(focusedInside.hasGhost).toBe(false);

    await remove.click();
    await page.waitForTimeout(40);
    const afterRemoval = await page.evaluate(() => ({
      selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
      hasGhost: Array.from(document.getElementById("tags").options, (o) => o.value).includes("ghost"),
    }));
    expect(afterRemoval.selected).not.toContain("1");
    expect(afterRemoval.hasGhost).toBe(false);
  });

  test("createOnBlur is blocked during IME composition", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"), {
        create: true,
        createOnBlur: true,
      });
    });

    const during = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const input = select.nextElementSibling.querySelector(".cb-input");
      document.body.tabIndex = -1;
      input.focus();
      input.dispatchEvent(new CompositionEvent("compositionstart"));
      input.value = "한글";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      document.body.focus();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const hasCompositionToken = Array.from(select.options, (o) => o.value).includes("한글");
      input.dispatchEvent(new CompositionEvent("compositionend"));
      input.focus();
      document.body.focus();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const hasRealToken = Array.from(select.options, (o) => o.value).includes("한글");
      return { hasCompositionToken, hasRealToken };
    });

    expect(during.hasCompositionToken).toBe(false);
    expect(during.hasRealToken).toBe(true);
  });

  test("createFilter refusal hides create and leaves Enter to the form", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      const form = document.getElementById("form");
      form.dataset.submissions = "0";
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        form.dataset.submissions = String(Number(form.dataset.submissions) + 1);
      });
      Combobox.getOrCreateInstance(document.getElementById("tags"), {
        create: true,
        createFilter: (value) => value.trim().length > 2,
      });
    });

    const input = page.locator(control("tags"));
    const row = (text) => page.locator(".cb-popover:visible .cb-create", { hasText: text });

    await input.fill("xy");
    await expect(row("xy")).toHaveCount(0);
    await input.press("Enter");
    await page.waitForTimeout(40);
    let state = await page.evaluate(() => ({
      selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
      submissions: document.getElementById("form").dataset.submissions,
    }));
    expect(state.selected).toEqual(["1"]);
    expect(state.submissions).toBe("1");

    await input.fill("xyz");
    await expect(row("xyz")).toHaveCount(1);
    await input.press("Enter");
    await page.waitForTimeout(40);
    state = await page.evaluate(() => ({
      selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
    }));
    expect(state.selected).toContain("xyz");
  });

  test("async create shows a loading row and selects the resolved item", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const events = [];
      select.addEventListener("combobox:create", () => events.push("create"));
      select.addEventListener("input", () => events.push("input"));
      select.addEventListener("change", () => events.push("change"));

      let resolveCreate;
      const gate = new Promise((resolve) => (resolveCreate = resolve));
      const combo = Combobox.getOrCreateInstance(select, {
        create: async (label) => {
          await gate;
          return { value: label.toUpperCase(), label };
        },
      });
      const input = combo.input;
      input.focus();
      input.value = "plum";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      const during = {
        loadingRow: combo.listbox.querySelector(".cb-loading")?.textContent.trim() ?? null,
      };

      resolveCreate();
      await new Promise((resolve) => setTimeout(resolve, 40));

      return {
        during,
        selected: Array.from(select.selectedOptions, (o) => o.value),
        optionExists: !!select.querySelector('option[value="PLUM"]'),
        inputValue: input.value,
        events,
      };
    });

    expect(state.during.loadingRow).toBe("Loading…");
    expect(state.optionExists).toBe(true);
    expect(state.selected).toContain("PLUM");
    expect(state.inputValue).toBe("");
    expect(state.events).toEqual(["input", "change", "create"]);
  });

  test("create rejection emits createerror and AbortError stays silent", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const errors = [];
      select.addEventListener("combobox:createerror", (event) =>
        errors.push({ label: event.detail.label, message: event.detail.error.message }),
      );
      const combo = Combobox.getOrCreateInstance(select, {
        create: async () => {
          throw new Error("boom");
        },
      });
      const input = combo.input;
      input.focus();
      input.value = "plum";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));

      const rejected = {
        errors,
        hasPlum: Array.from(select.options, (o) => o.value).includes("plum"),
        inputValue: input.value,
      };

      const abortSelect = document.createElement("select");
      abortSelect.multiple = true;
      abortSelect.innerHTML = `<option value="1" selected>One</option>`;
      document.body.append(abortSelect);
      const abortErrors = [];
      abortSelect.addEventListener("combobox:createerror", (event) =>
        abortErrors.push(event.detail.error.message),
      );
      const abortCombo = Combobox.getOrCreateInstance(abortSelect, {
        create: async () => {
          throw new DOMException("Aborted", "AbortError");
        },
      });
      const abortInput = abortCombo.input;
      abortInput.focus();
      abortInput.value = "ghost";
      abortInput.dispatchEvent(new Event("input", { bubbles: true }));
      abortInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 30));

      return {
        rejected,
        aborted: {
          errors: abortErrors,
          hasGhost: Array.from(abortSelect.options, (o) => o.value).includes("ghost"),
        },
      };
    });

    expect(state.rejected.errors).toEqual([{ label: "plum", message: "boom" }]);
    expect(state.rejected.hasPlum).toBe(false);
    expect(state.rejected.inputValue).toBe("plum");
    expect(state.aborted.errors).toEqual([]);
    expect(state.aborted.hasGhost).toBe(false);
  });

  test("beforecreate preventDefault blocks creation and keeps the query", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      select.addEventListener("combobox:beforecreate", (event) => event.preventDefault());
      const combo = Combobox.getOrCreateInstance(select, { create: true });
      const input = combo.input;
      input.focus();
      input.value = "plum";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        hasPlum: Array.from(select.options, (o) => o.value).includes("plum"),
        inputValue: input.value,
      };
    });
    expect(state.hasPlum).toBe(false);
    expect(state.inputValue).toBe("plum");
  });

  test("blank and whitespace never create an option", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const combo = Combobox.getOrCreateInstance(select, { create: true });
      const input = combo.input;
      input.focus();
      input.value = "   ";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        hasWhitespace: Array.from(select.options, (o) => o.value).includes("   "),
        inputValue: input.value,
        selected: Array.from(select.selectedOptions, (o) => o.value),
      };
    });
    expect(state.hasWhitespace).toBe(false);
    expect(state.inputValue).toBe("   ");
    expect(state.selected).toEqual(["1"]);
  });

  test("case-insensitive existing label is selected, never duplicated", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      select.querySelector('option[value="2"]').selected = false;
      const combo = Combobox.getOrCreateInstance(select, { create: true });
      const input = combo.input;
      input.focus();
      input.value = "BANANA";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        bananaSelected: Array.from(select.selectedOptions, (o) => o.value).includes("2"),
        bananaCount: Array.from(select.options, (o) => o.value).filter((v) => v === "2").length,
        hasDuplicate: Array.from(select.options, (o) => o.textContent.trim()).includes("BANANA"),
      };
    });
    expect(state.bananaSelected).toBe(true);
    expect(state.bananaCount).toBe(1);
    expect(state.hasDuplicate).toBe(false);
  });
});

test.describe("Creation vetoes", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("creation runs the beforeselect gate", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice"></select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select, { create: true });
      let beforeSelect = 0;
      select.addEventListener("combobox:beforeselect", (event) => {
        beforeSelect++;
        event.preventDefault();
      });
      await combo.setQuery("New");
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await tick();
      await tick();
      const result = { beforeSelect, selected: combo.getSelectedValues() };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.beforeSelect).toBeGreaterThanOrEqual(1);
    expect(state.selected).toEqual([]);
  });

  test("createOnBlur keeps the typed text when creation is refused", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice" multiple></select><button type="button">Away</button>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select, {
        create: true,
        createOnBlur: true,
        guards: { add: () => false },
      });
      combo.input.value = "keepme";
      combo.input.focus();
      await tick();
      form.querySelector("button").focus();
      await tick();
      await tick();
      const result = { text: combo.input.value, selected: combo.getSelectedValues() };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.text).toBe("keepme");
    expect(state.selected).toEqual([]);
  });
});
