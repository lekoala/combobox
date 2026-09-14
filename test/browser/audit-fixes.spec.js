import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const IDENTITY_HTML = "/test/fixtures/identity.html";
const MODERN = "Modern Popover + floating placement support is required";

test.beforeEach(async ({ page }) => {
  await setup(page, IDENTITY_HTML);
});

test("setOptions preserves selected node identity, metadata and reset baseline", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple><option value="a" data-meta="keep">Alpha</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select);
    combo.select("a");
    const original = select.options[0];
    combo.setOptions([{ value: "b", label: "Beta" }]);
    const kept = select.options[0];
    const result = {
      sameNode: original === kept,
      metadata: kept.dataset.meta ?? null,
      defaultSelected: kept.defaultSelected,
      values: combo.getSelectedValues(),
    };
    form.reset();
    await tick();
    result.afterReset = combo.getSelectedValues();
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.sameNode).toBe(true);
  expect(state.metadata).toBe("keep");
  expect(state.defaultSelected).toBe(false);
  expect(state.values).toEqual(["a"]);
  expect(state.afterReset).toEqual([]);
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

test("concurrent token batches cannot overshoot maxItems", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 60));
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const releases = [];
    const combo = Combobox.getOrCreateInstance(select, {
      create: (label) => new Promise((resolve) => releases.push(() => resolve({ value: label, label }))),
      separators: [","],
      maxItems: 1,
    });
    combo.input.value = "a,";
    combo.input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await tick();
    combo.input.value = "a,b";
    combo.input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await tick();
    const requests = releases.length;
    for (const release of releases) release();
    await tick();
    await tick();
    const result = {
      requests,
      selected: combo.getSelectedValues(),
      options: select.options.length,
      text: combo.input.value,
    };
    combo.dispose();
    form.remove();
    return result;
  });

  // Serialized batches: a single creation serves both input events (no
  // overshoot past maxItems) and the unprocessed remainder stays editable.
  expect(state.requests).toBe(1);
  expect(state.selected).toEqual(["a"]);
  expect(state.options).toBe(1);
  expect(state.text).toBe("a,b");
});

test("a local search aborts the pending remote load", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    let release;
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple><option value="local">Local</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select, {
      load: () => new Promise((resolve) => (release = resolve)),
      minChars: 2,
      debounce: 0,
    });
    const pending = combo.search("abc");
    await combo.search("");
    const loadingAfterLocal = combo.loading;
    release([{ value: "old", label: "Old response" }]);
    await pending;
    const result = {
      loadingAfterLocal,
      results: combo.results,
      loading: combo.loading,
      visible: combo.listbox.textContent,
    };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.loadingAfterLocal).toBe(false);
  expect(state.results).toBeNull();
  expect(state.loading).toBe(false);
  expect(state.visible).not.toContain("Old response");
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

test("a vetoed token keeps its text in the input", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 60));
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple><option value="a">Alpha</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select, { create: true, separators: [","] });
    select.addEventListener("combobox:beforeselect", (event) => event.preventDefault());
    combo.input.value = "Alpha,tail";
    combo.input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await tick();
    await tick();
    const result = { selected: combo.getSelectedValues(), text: combo.input.value };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.selected).toEqual([]);
  expect(state.text).toBe("Alpha,tail");
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

test("a guard resolving after dispose mutates nothing", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple><option value="a" selected>A</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    let release;
    const combo = Combobox.getOrCreateInstance(select, {
      guards: { remove: () => new Promise((resolve) => (release = resolve)) },
    });
    const pending = combo.remove("a");
    combo.dispose();
    release(true);
    const result = {
      settled: await pending,
      selected: Array.from(select.selectedOptions, (o) => o.value),
    };
    form.remove();
    return result;
  });

  expect(state.settled).toBe(false);
  expect(state.selected).toEqual(["a"]);
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

test("dispose restores authored filter and source attributes", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(() => {
    const form = document.createElement("form");
    form.innerHTML =
      '<select id="audit-restore" multiple aria-invalid="true"><option value="a">A</option></select><input data-filter-for="audit-restore" disabled readonly>';
    document.body.append(form);
    const select = form.querySelector("select");
    const input = form.querySelector("input");
    const combo = Combobox.getOrCreateInstance(select);
    combo.select("a");
    combo.dispose();
    const result = {
      disabled: input.disabled,
      readOnly: input.readOnly,
      ariaInvalid: select.getAttribute("aria-invalid"),
    };
    form.remove();
    return result;
  });

  expect(state.disabled).toBe(true);
  expect(state.readOnly).toBe(true);
  expect(state.ariaInvalid).toBe("true");
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
