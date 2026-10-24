import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Reset of selected order", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, "/test/fixtures/features.html");
    test.skip(!(await modernSupported(page)), "Modern Popover support is required");
  });

  for (const cancelled of [false, true]) {
    test(`form reset ${cancelled ? "cancellation preserves user order" : "restores native default order without rewriting the catalogue"}`, async ({
      page,
    }) => {
      const state = await page.evaluate(async (cancelled) => {
        const source = document.getElementById("overlimit");
        const options = [...source.options];
        const combo = new Combobox(source, { selectionOrder: "selected", maxItems: 2 });
        combo.move("1", 2);
        const events = [];
        for (const type of ["input", "change", "combobox:reorder"])
          source.addEventListener(type, () => events.push(type));
        if (cancelled)
          source.form.addEventListener("reset", (event) => event.preventDefault(), { once: true });
        source.form.reset();
        await new Promise((resolve) => setTimeout(resolve, 0));
        return {
          values: combo.getSelectedValues(),
          submitted: new FormData(source.form).getAll(source.name),
          chips: [...combo.chips.children].map((chip) => chip.dataset.value),
          native: [...source.selectedOptions].map((option) => option.value),
          catalogue: options.every((option, index) => source.options[index] === option),
          events,
        };
      }, cancelled);
      const values = cancelled ? ["2", "3", "1"] : ["1", "2", "3"];
      expect(state).toEqual({
        values,
        submitted: values,
        chips: values,
        native: ["1", "2", "3"],
        catalogue: true,
        events: [],
      });
    });
  }
});

test.describe("Reset and durable selections", () => {
  const FEATURES = "/test/fixtures/features.html";

  function control(id) {
    return `#${id} + .cb-control .cb-input`;
  }

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("form reset restores native selection and chips", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"));
      Combobox.getOrCreateInstance(document.getElementById("overlimit"));
    });

    await page.locator(control("tags")).fill("Banana");
    await page.locator(".cb-popover:visible .cb-option", { hasText: "Banana" }).click();
    await page.waitForTimeout(40);

    await page.evaluate(() => document.querySelector("form").reset());
    await page.waitForTimeout(40);

    const state = await page.evaluate(() => ({
      tags: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
      chips: Array.from(document.querySelectorAll("#tags + .cb-control .cb-chip")).map((chip) =>
        chip.getAttribute("data-value"),
      ),
    }));
    expect(state.tags).toEqual(["1"]);
    expect(state.chips).toEqual(["1"]);
  });

  test("a native reset button restores chips in the same click", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"));
    });

    // Remove the server-rendered selection.
    await page.locator('#tags + .cb-control .cb-chip[data-value="1"] .cb-chip-remove').click();
    await expect(page.locator("#tags + .cb-control .cb-chip")).toHaveCount(0);

    // A real reset button restores defaultSelected *after* the reset event
    // dispatch returns to the activation code; a microtask still observes the
    // pre-reset state, so the engine must resync from a later task.
    await page.locator("#form-reset").click();
    await page.waitForTimeout(40);

    const state = await page.evaluate(() => ({
      selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
      chips: Array.from(document.querySelectorAll("#tags + .cb-control .cb-chip"), (chip) =>
        chip.getAttribute("data-value"),
      ),
    }));
    expect(state.selected).toEqual(["1"]);
    expect(state.chips).toEqual(["1"]);
  });

  test("created selected options never rewrite the form reset baseline", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"), { create: true });
    });

    const input = page.locator(control("tags"));
    await input.fill("Plum");
    await input.press("Enter");

    const created = await page
      .locator('#tags option[value="Plum"]')
      .evaluate((option) => ({ selected: option.selected, defaultSelected: option.defaultSelected }));
    expect(created).toEqual({ selected: true, defaultSelected: false });

    await page.evaluate(() => document.querySelector("form").reset());
    await page.waitForTimeout(40);

    const reset = await page.evaluate(() => ({
      selected: Array.from(document.getElementById("tags").selectedOptions, (option) => option.value),
      chips: Array.from(document.querySelectorAll("#tags + .cb-control .cb-chip"), (chip) =>
        chip.getAttribute("data-value"),
      ),
      createdStillDefault: document.querySelector('#tags option[value="Plum"]').defaultSelected,
    }));
    expect(reset.selected).toEqual(["1"]);
    expect(reset.chips).toEqual(["1"]);
    expect(reset.createdStillDefault).toBe(false);
  });

  test("created options survive sync() and form.reset() with native reset semantics", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(async () => {
      const combo = Combobox.getOrCreateInstance(document.getElementById("tags"), { create: true });
      const input = combo.input;
      input.value = "Plum";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    const select = page.locator("#tags");
    const exists = () => page.locator('#tags option[value="Plum"]').count();

    expect(await exists()).toBe(1);

    await page.evaluate(() => Combobox.getInstance(document.getElementById("tags")).sync());
    expect(await exists()).toBe(1);
    expect(await select.evaluate((el) => Array.from(el.selectedOptions, (o) => o.value))).toContain("Plum");

    // reset() restores the native/default selection; it never rewrites the
    // catalogue, so the created option stays present but unselected.
    await page.evaluate(() => document.querySelector("form").reset());
    await page.waitForTimeout(40);

    expect(await exists()).toBe(1);
    expect(await select.evaluate((el) => Array.from(el.selectedOptions, (o) => o.value))).toEqual(["1"]);
  });
});

test.describe("Submission and validation", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("selectionOrder formdata keeps sibling fields and respects disabled", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice" multiple><option value="a">Alpha</option></select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
      combo.select("a");
      const input = document.createElement("input");
      input.name = "choice";
      input.value = "sibling";
      form.append(input);
      const shared = new FormData(form).getAll("choice");
      select.disabled = true;
      const disabled = new FormData(form).getAll("choice");
      combo.dispose();
      form.remove();
      return { shared, disabled };
    });

    expect(state.shared).toEqual(["a", "sibling"]);
    expect(state.disabled).toEqual(["sibling"]);
  });

  test("selectionOrder formdata follows a name and form assigned after init", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const select = document.createElement("select");
      select.multiple = true;
      for (const value of ["a", "b", "c"]) select.add(new Option(value, value, true, true));
      document.body.append(select);
      const combo = new Combobox(select, { selectionOrder: "selected" });
      combo.move("c", 0);

      const form = document.createElement("form");
      document.body.append(form);
      select.name = "late[]";
      form.append(select);
      return {
        values: combo.getSelectedValues(),
        submitted: new FormData(form).getAll("late[]"),
      };
    });
    expect(state).toEqual({ values: ["c", "a", "b"], submitted: ["c", "a", "b"] });
  });

  test("form reset follows a form assigned after init", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const select = document.createElement("select");
      select.multiple = true;
      for (const value of ["a", "b", "c"]) select.add(new Option(value, value, true, true));
      document.body.append(select);
      const combo = new Combobox(select, { selectionOrder: "selected" });
      combo.move("c", 0);

      const form = document.createElement("form");
      document.body.append(form);
      form.append(select, combo.control);
      form.reset();
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        values: combo.getSelectedValues(),
        chips: [...combo.chips.children].map((chip) => chip.dataset.value),
        native: [...select.selectedOptions].map((option) => option.value),
      };
    });
    expect(state).toEqual({
      values: ["a", "b", "c"],
      chips: ["a", "b", "c"],
      native: ["a", "b", "c"],
    });
  });

  test("form validation focuses the first invalid combobox, not the last", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML = `
      <select id="inv-a" name="a" required><option value="">Choose</option><option value="1">One</option></select>
      <select id="inv-b" name="b" required><option value="">Choose</option><option value="1">One</option></select>`;
      document.body.append(form);
      const a = form.querySelector("#inv-a");
      const b = form.querySelector("#inv-b");
      Combobox.getOrCreateInstance(a);
      Combobox.getOrCreateInstance(b);
      const inputOf = (select) => select.nextElementSibling.querySelector(".cb-input");
      form.requestSubmit();
      const result = {
        focusedFirst: document.activeElement === inputOf(a),
        focusedSecond: document.activeElement === inputOf(b),
      };
      for (const select of [a, b]) Combobox.getInstance(select).dispose();
      form.remove();
      return result;
    });

    expect(state.focusedFirst).toBe(true);
    expect(state.focusedSecond).toBe(false);
  });

  test("form validation still focuses the first invalid combobox inside a fieldset", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const form = document.createElement("form");
      // The <fieldset> is listed before its child and matches :invalid as soon
      // as the child is invalid, without being a validation candidate itself.
      form.innerHTML = `
      <fieldset>
        <select id="inv-fs" name="a" required><option value="">Choose</option><option value="1">One</option></select>
      </fieldset>`;
      document.body.append(form);
      const select = form.querySelector("#inv-fs");
      const combo = Combobox.getOrCreateInstance(select);
      form.requestSubmit();
      const result = {
        focused: document.activeElement === select.nextElementSibling.querySelector(".cb-input"),
        ariaInvalid: combo.input.getAttribute("aria-invalid"),
      };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.focused).toBe(true);
    expect(state.ariaInvalid).toBe("true");
  });
});

test.describe("required / invalid / reset", () => {
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

  test("required validity follows the native single select", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "req");
    const formValid = (page) => page.evaluate(() => document.querySelector("#source-form").checkValidity());

    expect(await formValid(page)).toBe(false);

    const input = page.locator(control("req"));
    await input.fill("Alph");
    await page.locator(".cb-popover:visible .cb-option", { hasText: "Alpha" }).click();
    await page.waitForTimeout(40);
    expect(await formValid(page)).toBe(true);

    await page.evaluate(() => Combobox.getInstance(document.getElementById("req")).clear());
    expect(await formValid(page)).toBe(false);
  });

  test("invalid event focuses the enhanced filter and clears aria-invalid after selection", async ({
    page,
  }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "req");
    await page.evaluate(() => document.querySelector("#source-form").requestSubmit());

    const state = await page.evaluate(() => ({
      focused: document.activeElement === document.querySelector("#req + .cb-control .cb-input"),
      ariaInvalid: document.querySelector("#req + .cb-control .cb-input").getAttribute("aria-invalid"),
    }));
    expect(state.focused).toBe(true);
    expect(state.ariaInvalid).toBe("true");

    const input = page.locator(control("req"));
    await input.fill("Bet");
    await page.locator(".cb-popover:visible .cb-option", { hasText: "Beta" }).click();
    await page.waitForTimeout(40);
    expect(await input.getAttribute("aria-invalid")).toBeNull();
  });

  test("form reset restores single label, datalist value and multiple chips", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "req");
    await init(page, "city2");
    await init(page, "syncs");

    await page.locator(control("req")).fill("Alph");
    await page.locator(".cb-popover:visible .cb-option", { hasText: "Alpha" }).click();
    await page.locator("#city2").fill("Ghent");
    await page.locator(control("syncs")).fill("Two");
    await page.waitForTimeout(40);

    await page.evaluate(() => document.querySelector("#source-form").reset());
    await page.waitForTimeout(40);

    const state = await page.evaluate(() => {
      const cityCombo = Combobox.getInstance(document.getElementById("city2"));
      const multiCombo = Combobox.getInstance(document.getElementById("syncs"));
      return {
        reqValue: document.getElementById("req").value,
        reqLabel: document.querySelector("#req + .cb-control .cb-input").value,
        city2: document.getElementById("city2").value,
        cityQuery: cityCombo.query,
        cityResults: cityCombo.filteredItems.map((item) => item.value),
        multiQuery: multiCombo.query,
        multiInput: multiCombo.input.value,
        chips: Array.from(document.querySelectorAll("#syncs + .cb-control .cb-chip")).map((chip) =>
          chip.getAttribute("data-value"),
        ),
      };
    });
    expect(state.reqValue).toBe("");
    expect(state.reqLabel).toBe("");
    expect(state.city2).toBe("");
    expect(state.cityQuery).toBe("");
    expect(state.cityResults).toEqual(["Brussels", "Ghent"]);
    expect(state.multiQuery).toBe("");
    expect(state.multiInput).toBe("");
    expect(state.chips).toEqual(["1"]);
  });
});

test.describe("free-form pattern / FormData envelope", () => {
  const FEATURES = "/test/fixtures/sources.html";

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("source input pattern stays the validation authority for free-form mode", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(() => {
      const source = document.getElementById("pat");
      const combo = Combobox.getOrCreateInstance(source);
      const before = {
        pattern: source.getAttribute("pattern"),
        sameInput: combo.input === source,
        generatedPattern: combo.input.getAttribute("pattern"),
      };

      // Value changes flow through the engine path.
      const invalid = (() => {
        source.value = "abc";
        return source.checkValidity();
      })();
      const valid = (() => {
        source.value = "ABC";
        return source.checkValidity();
      })();

      combo.dispose();
      return {
        before,
        invalid,
        valid,
        after: { pattern: source.getAttribute("pattern"), list: source.getAttribute("list") },
      };
    });

    expect(state.before.pattern).toBe("[A-Z]{3}");
    expect(state.before.sameInput).toBe(true);
    expect(state.before.generatedPattern).toBe("[A-Z]{3}");
    expect(state.invalid).toBe(false);
    expect(state.valid).toBe(true);
    expect(state.after.pattern).toBe("[A-Z]{3}");
    expect(state.after.list).toBe("pat-list");
  });

  test("generated filter inputs never leak into FormData", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("syncs"));
      Combobox.getOrCreateInstance(document.getElementById("city2"));
      const form = document.getElementById("source-form");
      const names = Array.from(new FormData(form).keys());
      // Every named, non-disabled control the form actually contains — a
      // literal enumeration against which FormData must match exactly.
      const expected = Array.from(form.elements)
        .filter((el) => el.name && !el.disabled)
        .map((el) => el.name);
      const selectFilterInputs = Array.from(document.querySelectorAll(".cb-control .cb-input")).map((el) =>
        el.hasAttribute("name"),
      );
      return { names, expected, selectFilterInputs };
    });

    // Only the real source names appear — exactly the named controls the form
    // contains, with no generated filter input contributing a name.
    expect(state.names.sort()).toEqual(state.expected.sort());
    expect(state.selectFilterInputs.every((named) => named === false)).toBe(true);
  });
});

test.describe("Native submission across enhancement modes", () => {
  const FEATURES = "/test/fixtures/features.html";

  test("native submission reflects the selection in enhanced and fallback modes alike", async ({ page }) => {
    await setup(page, FEATURES);

    const state = await page.evaluate(() => {
      const form = document.getElementById("form");
      const combo = Combobox.getOrCreateInstance(document.getElementById("tags"));
      const before = new FormData(form).getAll("tags[]");
      combo.select("2");
      const after = new FormData(form).getAll("tags[]");
      return { mode: combo.mode, before, after };
    });

    expect(state.before).toEqual(["1"]);
    expect(state.after).toEqual(["1", "2"]);
  });
});
