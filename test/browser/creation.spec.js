import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Internal blur and async creation completion", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, "/test/fixtures/features.html");
    test.skip(!(await modernSupported(page)), "Modern Popover support is required");
  });

  test("a refused async creation clears loading without reopening a picker closed while pending", async ({
    page,
  }) => {
    const state = await page.evaluate(async () => {
      const source = document.getElementById("tags");
      let release;
      let started;
      const ready = new Promise((resolve) => {
        started = resolve;
      });
      const combo = new Combobox(source, {
        create: () =>
          new Promise((resolve) => {
            release = () => resolve(null);
            started();
          }),
      });
      combo.input.value = "New";
      await combo.search("New", { show: true });
      combo.input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      await ready;
      combo.hide();
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        open: combo.isOpen(),
        loadingRows: combo.listbox.querySelectorAll(".cb-loading").length,
        input: combo.input.value,
        values: [...source.selectedOptions].map((option) => option.value),
      };
    });
    expect(state).toEqual({ open: false, loadingRows: 0, input: "New", values: ["1"] });
  });

  for (const target of ["chip", "remove", "button"]) {
    test(`closed picker internal blur to ${target} keeps uncreated text`, async ({ page }) => {
      await page.evaluate(() => {
        const combo = new Combobox(document.getElementById("tags"), { create: true, createOnBlur: true });
        const button = document.createElement("button");
        button.type = "button";
        button.className = "internal-action";
        button.textContent = "Action";
        combo.control.append(button);
      });
      const input = page.locator("#tags + .cb-control .cb-input");
      await input.fill("ghost");
      await input.press("Escape");
      const selectors = { chip: ".cb-chip", remove: ".cb-chip-remove", button: ".internal-action" };
      const internal = page.locator(`#tags + .cb-control ${selectors[target]}`);
      await internal.focus();
      await expect(internal).toBeFocused();
      await expect(input).toHaveValue("ghost");
      await expect(page.locator('#tags option[value="ghost"]')).toHaveCount(0);
      await expect(page.locator("#tags option:checked")).toHaveAttribute("value", "1");
      await expect(page.locator(".cb-popover:visible")).toHaveCount(0);
    });
  }

  test("ArrowLeft from a closed picker keeps chip focus with createOnBlur", async ({ page }) => {
    await page.evaluate(
      () => new Combobox(document.getElementById("tags"), { create: true, createOnBlur: true }),
    );
    const input = page.locator("#tags + .cb-control .cb-input");
    await input.focus();
    await input.press("Escape");
    await input.press("ArrowLeft");
    await expect(page.locator("#tags + .cb-control .cb-chip")).toBeFocused();
    await expect(page.locator("#tags option:checked")).toHaveAttribute("value", "1");
  });

  for (const outcome of ["null", "reject", "abort", "veto", "invalid"]) {
    test(`async creation ${outcome} restores normal rows and preserves native selection`, async ({
      page,
    }) => {
      const state = await page.evaluate(async (outcome) => {
        const source = document.getElementById("tags");
        let release;
        let started;
        const ready = new Promise((resolve) => {
          started = resolve;
        });
        const errors = [];
        const native = [];
        source.addEventListener("combobox:createerror", (event) => errors.push(event.detail.error.message));
        for (const type of ["input", "change"]) source.addEventListener(type, () => native.push(type));
        if (outcome === "veto")
          source.addEventListener("combobox:beforeselect", (event) => event.preventDefault());
        const combo = new Combobox(source, {
          create: async () => {
            await new Promise((resolve) => {
              release = resolve;
              started();
            });
            if (outcome === "reject") throw new Error("Creation failed");
            if (outcome === "abort") throw new DOMException("Cancelled", "AbortError");
            if (outcome === "null") return null;
            return { value: outcome === "invalid" ? "" : "new", label: "New" };
          },
        });
        combo.input.value = "New";
        await combo.search("New", { show: true });
        combo.input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
        );
        await ready;
        const loadingDuring = !!combo.listbox.querySelector(".cb-loading");
        release();
        await new Promise((resolve) => setTimeout(resolve, 0));
        return {
          loadingDuring,
          loading: combo.loading,
          open: combo.isOpen(),
          loadingRows: combo.listbox.querySelectorAll(".cb-loading").length,
          rows: combo.listbox.children.length,
          input: combo.input.value,
          count: source.options.length,
          values: [...source.selectedOptions].map((option) => option.value),
          errors: errors.length,
          native,
        };
      }, outcome);
      expect(state).toEqual({
        loadingDuring: true,
        loading: false,
        open: true,
        loadingRows: 0,
        rows: 1,
        input: "New",
        count: 3,
        values: ["1"],
        errors: ["reject", "invalid"].includes(outcome) ? 1 : 0,
        native: [],
      });
    });
  }

  test("disposing in combobox:create stops the final input write", async ({ page }) => {
    const state = await page.evaluate(async () => {
      const source = document.getElementById("tags");
      const combo = new Combobox(source, { create: async (label) => ({ value: label, label }) });
      const input = combo.input;
      let writes = 0;
      source.addEventListener("combobox:create", () => {
        combo.dispose();
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        Object.defineProperty(input, "value", {
          get() {
            return descriptor.get.call(this);
          },
          set(value) {
            writes++;
            descriptor.set.call(this, value);
          },
        });
      });
      input.value = "New";
      await combo.search("New", { show: true });
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        writes,
        disposed: Combobox.getInstance(source) === null,
        values: [...source.selectedOptions].map((option) => option.value),
      };
    });
    expect(state).toEqual({ writes: 0, disposed: true, values: ["1", "New"] });
  });
});

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

test.describe("Concurrent creation intents", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, "/test/fixtures/identity.html");
    test.skip(!(await modernSupported(page)), "Modern Popover support is required");
  });

  test("a repeated Enter while create() is pending creates one option", async ({ page }) => {
    await page.evaluate(() => {
      const source = document.createElement("select");
      source.id = "twice";
      source.multiple = true;
      document.body.append(source);
      window.creates = [];
      new Combobox(source, {
        create: (label) =>
          new Promise((resolve) => window.creates.push(() => resolve({ value: label, label }))),
      });
    });
    const input = page.locator("#twice + .cb-control .cb-input");
    await input.pressSequentially("new");
    await input.press("Enter");
    await input.press("Enter");
    const state = await page.evaluate(async () => {
      const calls = window.creates.length;
      for (const finish of window.creates) finish();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const source = document.getElementById("twice");
      return {
        calls,
        options: source.options.length,
        selected: [...source.selectedOptions].map((option) => option.value),
      };
    });
    expect(state).toEqual({ calls: 1, options: 1, selected: ["new"] });
  });
});
