import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";

function control(id) {
  return `#${id} + .cb-control .cb-input`;
}

test.beforeEach(async ({ page }) => {
  await setup(page, FEATURES);
});

test("guards.add: refusal blocks creation, allowance creates", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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

test("separator input consumes tokens and keeps the incomplete token", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("tags"), {
      create: true,
      separators: [","],
    });
  });

  const input = page.locator(control("tags"));
  await input.fill("nutmeg,cinna");
  await page.waitForTimeout(60);

  const state = await page.evaluate(() => ({
    selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
    input: document.getElementById("tags").nextElementSibling.querySelector(".cb-input").value,
    options: Array.from(document.getElementById("tags").options, (o) => o.value),
  }));
  expect(state.selected).toContain("nutmeg");
  expect(state.input).toBe("cinna");
  expect(state.options).toContain("nutmeg");
});

test("separator paste is sequential and respects maxItems between tokens", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("overlimit"), {
      create: true,
      maxItems: 4,
      separators: [","],
    });
  });

  const input = page.locator(control("overlimit"));
  await input.fill("x,y");
  await page.waitForTimeout(80);

  const state = await page.evaluate(() => ({
    selected: Array.from(document.getElementById("overlimit").selectedOptions, (o) => o.value),
    input: document.getElementById("overlimit").nextElementSibling.querySelector(".cb-input").value,
    options: Array.from(document.getElementById("overlimit").options, (o) => o.value),
  }));
  expect(state.selected).toContain("x");
  expect(state.selected).not.toContain("y");
  expect(state.input).toBe("y");
  expect(state.options).not.toContain("y");
});

test("separator paste preserves explicit selection order", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("tags"), {
      create: true,
      selectionOrder: "selected",
      separators: [","],
    });
  });

  const input = page.locator(control("tags"));
  await input.fill("zap,zip,");
  await page.waitForTimeout(80);

  const order = await page.evaluate(() =>
    Combobox.getInstance(document.getElementById("tags")).getSelectedValues(),
  );
  expect(order).toEqual(["1", "zap", "zip"]);
});

test("maxOptions caps rendered options and keyboard navigation", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("capped"), {
      maxOptions: 2,
    });
  });

  const input = page.locator(control("capped"));
  await input.click();
  await expect(page.locator(".cb-popover:visible .cb-option")).toHaveCount(2);

  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  const activeId = await input.getAttribute("aria-activedescendant");
  const index = await page.evaluate((id) => {
    const option = document.getElementById(id);
    if (!option) return null;
    return Array.from(document.querySelectorAll(".cb-popover .cb-option")).indexOf(option);
  }, activeId);
  expect(index).toBeGreaterThanOrEqual(0);
  expect(index).toBeLessThan(2);
});

test("maxItems never mutilates pre-existing native selection at init", async ({ page }) => {
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("overlimit"), { maxItems: 2 });
  });

  const state = await page.evaluate(() => ({
    selectedOptions: Array.from(document.getElementById("overlimit").selectedOptions, (o) => o.value),
    chips: Array.from(document.querySelectorAll("#overlimit + .cb-control .cb-chip")).map((chip) =>
      chip.getAttribute("data-value"),
    ),
  }));
  expect(state.selectedOptions).toEqual(["1", "2", "3"]);
  expect(state.chips).toEqual(["1", "2", "3"]);

  const blocked = await page.evaluate(() => {
    const select = document.getElementById("overlimit");
    const combo = Combobox.getInstance(select);
    const before = Array.from(select.selectedOptions, (o) => o.value);
    combo.select("4");
    return { before, after: Array.from(select.selectedOptions, (o) => o.value) };
  });
  expect(blocked.after).toEqual(blocked.before);

  await page.locator(".cb-chip[data-value='3'] .cb-chip-remove").click();
  await page.waitForTimeout(40);
  expect(await page.locator("#overlimit option[value='3']").evaluate((o) => o.selected)).toBe(false);
});

test("disabled at runtime: toggling an option shows/hides the chip remove button", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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

test("duplicate values are distinct option identities in chips and selection", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("dupes"));
  });

  const input = page.locator(control("dupes"));
  await input.fill("Second");
  const format = page.locator(".cb-popover:visible .cb-option", { hasText: "Second label" });
  await format.click();
  await page.waitForTimeout(40);

  const state = await page.evaluate(() => {
    const select = document.getElementById("dupes");
    return {
      selectedSame: Array.from(select.selectedOptions).filter((o) => o.value === "same").length,
      chipsSame: Array.from(document.querySelectorAll("#dupes + .cb-control .cb-chip")).filter(
        (chip) => chip.getAttribute("data-value") === "same",
      ).length,
      values: Combobox.getInstance(select).getSelectedValues(),
    };
  });
  expect(state.selectedSame).toBe(2);
  expect(state.chipsSame).toBe(2);
  expect(state.values).toEqual(["same", "same"]);
});

test("form reset restores native selection and chips", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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

test("created selected options never rewrite the form reset baseline", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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

test("closeOnSelect closes a multiple picker after selection", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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

test("createOnBlur creates on real leave but never on chip removal", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("tags"), {
      create: true,
      createOnBlur: true,
    });
  });

  const input = page.locator(control("tags"));
  await input.fill("plum");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
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
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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

test("labelField/valueField map data results and select materializes the native option", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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

test("separator tokenize custom seam is honored", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("tags"), {
      create: true,
      separators: [","],
      tokenize: (value) => ({ tokens: value.split("+").filter(Boolean), rest: "" }),
    });
  });

  const input = page.locator(control("tags"));
  await input.fill("alpha+beta");
  await page.waitForTimeout(80);

  const state = await page.evaluate(() => ({
    selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
  }));
  expect(state.selected).toContain("alpha");
  expect(state.selected).toContain("beta");
});

test("custom tokenize keeps the declared rest in the input", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("tags"), {
      create: true,
      separators: [","],
      tokenize: (value) => {
        const parts = value.split("+");
        return { tokens: parts.slice(0, 1), rest: parts.slice(1).join("+") };
      },
    });
  });

  const input = page.locator(control("tags"));
  await input.fill("alpha+beta");
  await page.waitForTimeout(80);

  const state = await page.evaluate(() => ({
    selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
    inputValue: document.querySelector("#tags + .cb-control .cb-input").value,
  }));
  expect(state.selected).toContain("alpha");
  expect(state.selected).not.toContain("beta");
  expect(state.inputValue).toBe("beta");
});

test("createFilter returning false hides the create row and blocks Enter", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
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
  }));
  expect(state.selected).toEqual(["1"]);

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
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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
    abortInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
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
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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

test("guards.add rejection surfaces guarderror with zero unhandled rejections", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
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
    const result = await combo.clear();
    return {
      result,
      guardErrors,
      unhandled,
      selected: Array.from(select.selectedOptions, (o) => o.value),
    };
  });
  expect(state.result).toBe(false);
  expect(state.guardErrors).toEqual([{ guard: "clear", message: "app boom" }]);
  expect(state.unhandled).toEqual([]);
  expect(state.selected).toEqual(["1"]);
});
