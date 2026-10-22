import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Readonly interaction and programmatic values", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("a readonly select locks interaction but keeps the programmatic API", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const form = document.createElement("form");
      form.innerHTML = `<select id="ro-multi" name="ro" multiple readonly>
      <option value="a" selected>A</option>
      <option value="b" selected>B</option>
    </select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select);

      const removeButtons = form.querySelectorAll(".cb-chip-remove").length;

      combo.input.focus();
      await tick(30);
      const openOnFocus = combo.isOpen();

      // Backspace in the empty input must not remove the last selection either.
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
      await tick(30);
      const afterInputBackspace = Array.from(select.selectedOptions, (o) => o.value);

      const chip = form.querySelector(".cb-chip");
      chip.focus();
      chip.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
      await tick(30);
      const afterChipBackspace = Array.from(select.selectedOptions, (o) => o.value);

      const removed = await combo.remove("a");
      const result = {
        removeButtons,
        openOnFocus,
        afterInputBackspace,
        afterChipBackspace,
        removed,
        afterRemove: Array.from(select.selectedOptions, (o) => o.value),
      };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.removeButtons).toBe(0);
    expect(state.openOnFocus).toBe(false);
    expect(state.afterInputBackspace).toEqual(["a", "b"]);
    expect(state.afterChipBackspace).toEqual(["a", "b"]);
    expect(state.removed).toBe(true);
    expect(state.afterRemove).toEqual(["b"]);
  });
});

test.describe("Native disabled and readonly reflection", () => {
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

  test("disabled and readonly source state is reflected on the filter input", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "dis");
    await init(page, "ro");
    expect(await page.locator(control("dis")).isDisabled()).toBe(true);
    expect(await page.locator(control("ro")).getAttribute("readonly")).not.toBeNull();

    await page.evaluate(() => {
      const select = document.getElementById("dis");
      select.disabled = false;
      Combobox.getInstance(select).refresh();
    });
    expect(await page.locator(control("dis")).isDisabled()).toBe(false);
  });
});

test.describe("Readonly input+datalist", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, "/test/fixtures/identity.html");
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  });

  test("a readonly input never opens or commits through the picker but keeps the API", async ({ page }) => {
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML = `<input id="ro-text" list="ro-list" readonly><datalist id="ro-list"><option value="other"></option></datalist>`;
      document.body.append(host);
      window.roEvents = 0;
      const source = host.querySelector("input");
      source.addEventListener("change", () => window.roEvents++);
      new Combobox(source);
    });
    const input = page.locator("#ro-text");
    await input.focus();
    await input.press("ArrowDown");
    await input.press("Enter");
    const state = await page.evaluate(() => {
      const source = document.getElementById("ro-text");
      const combo = Combobox.getInstance(source);
      const interaction = { value: source.value, open: combo.isOpen(), events: window.roEvents };
      const api = combo.select({ value: "other", label: "other" });
      return { interaction, api, value: source.value, readOnly: source.readOnly };
    });
    expect(state).toEqual({
      interaction: { value: "", open: false, events: 0 },
      api: true,
      value: "other",
      readOnly: true,
    });
  });
});

test.describe("Interaction lock on disabled and readonly sources", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("a select in a disabled fieldset disables the input and renders no remove button", async ({
    page,
  }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML = `<fieldset disabled><select name="fs" multiple>
      <option value="a" selected>A</option>
      <option value="b">B</option>
    </select></fieldset><input data-filter-for="fs-select">`;
      document.body.append(form);
      const select = form.querySelector("select");
      select.id = "fs-select";
      const combo = Combobox.getOrCreateInstance(select);
      const result = {
        idlDisabled: select.disabled,
        inputDisabled: combo.input.disabled,
        removeButtons: form.querySelectorAll(".cb-chip-remove").length,
      };
      combo.dispose();
      result.restoredInputDisabled = form.querySelector("input[data-filter-for]").disabled;
      form.remove();
      return result;
    });

    expect(state.idlDisabled).toBe(false);
    expect(state.inputDisabled).toBe(true);
    expect(state.removeButtons).toBe(0);
    expect(state.restoredInputDisabled).toBe(false);
  });

  test("chip Delete/Backspace and Alt+Arrow reorder are locked on disabled and readonly selects", async ({
    page,
  }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const results = {};
      for (const lock of ["disabled", "readonly"]) {
        const form = document.createElement("form");
        form.innerHTML = `<select name="locked" multiple ${lock}>
        <option value="a" selected>A</option>
        <option value="b" selected>B</option>
      </select>`;
        document.body.append(form);
        const select = form.querySelector("select");
        const combo = Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
        let events = 0;
        for (const type of ["input", "change", "combobox:reorder"])
          select.addEventListener(type, () => events++);

        const chip = form.querySelector(".cb-chip");
        chip.focus();
        chip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }));
        for (const key of ["Delete", "Backspace"]) {
          form.querySelector(".cb-chip").dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        }
        await tick(30);
        results[lock] = { values: combo.getSelectedValues(), events };
        combo.dispose();
        form.remove();
      }
      return results;
    });

    for (const lock of ["disabled", "readonly"]) {
      expect(state[lock].values).toEqual(["a", "b"]);
      expect(state[lock].events).toBe(0);
    }
  });

  test("a programmatically opened readonly picker ignores Enter, Tab and option clicks", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const form = document.createElement("form");
      form.innerHTML = `<select name="ro" readonly>
      <option value="a" selected>A</option>
      <option value="b">B</option>
    </select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select, { tabSelect: true, autoselectFirst: true });
      combo.input.focus();
      combo.show();
      await tick(30);
      const option = combo.listbox.querySelector('.cb-option[data-index="1"]');
      option.click();
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      const valueAfterEnter = select.value;
      combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      await tick(30);
      const result = { valueAfterEnter, value: select.value, open: combo.isOpen() };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.valueAfterEnter).toBe("a");
    expect(state.value).toBe("a");
    expect(state.open).toBe(false);
  });

  test("ArrowDown on a readonly input+datalist writes no active-option state", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML = `<input name="city" list="ro-cities" readonly>
      <datalist id="ro-cities"><option value="Brussels"></option><option value="Paris"></option></datalist>`;
      document.body.append(form);
      const input = form.querySelector("input");
      const combo = Combobox.getOrCreateInstance(input);
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      const result = {
        open: combo.isOpen(),
        activeIndex: combo.activeIndex,
        activedescendant: input.getAttribute("aria-activedescendant"),
      };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.open).toBe(false);
    expect(state.activeIndex).toBe(-1);
    expect(state.activedescendant).toBeNull();
  });
});
