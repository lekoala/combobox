import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";
const IDENTITY = "/test/fixtures/identity.html";
const MODERN = "Modern Popover + floating placement support is required";

test("single reselect of the exact current option emits no native events", async ({ page }) => {
  await setup(page, FEATURES);
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(() => {
    const select = document.getElementById("capped");
    const events = [];
    select.addEventListener("input", () => events.push("input"));
    select.addEventListener("change", () => events.push("change"));
    const combo = Combobox.getOrCreateInstance(select);
    const first = combo.select(select.options[1]);
    const afterFirst = [...events];
    const again = combo.select(select.options[1]);
    const afterReselect = [...events];
    const comboboxEvents = [];
    select.addEventListener("combobox:select", () => comboboxEvents.push("select"));
    const bare = combo.select(select.value);
    return {
      first,
      afterFirst,
      again,
      afterReselect,
      bare,
      comboboxEvents,
      value: select.value,
    };
  });
  expect(state.first).toBe(true);
  expect(state.afterFirst).toEqual(["input", "change"]);
  expect(state.again).toBe(false);
  expect(state.afterReselect).toEqual(["input", "change"]);
  expect(state.bare).toBe(false);
  expect(state.comboboxEvents).toEqual([]);
  expect(state.value).toBe("1");
});

test("no-op remove() of an unselected value fires nothing", async ({ page }) => {
  await setup(page, IDENTITY);
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const select = document.getElementById("sequenced");
    const events = [];
    select.addEventListener("input", () => events.push("input"));
    select.addEventListener("change", () => events.push("change"));
    const combo = Combobox.getOrCreateInstance(select);
    const result = await combo.remove("2");
    return {
      result,
      events,
      selected: Array.from(select.selectedOptions, (o) => o.value),
    };
  });
  expect(state.result).toBe(false);
  expect(state.events).toEqual([]);
  expect(state.selected).toEqual([]);
});

test("clear() on an already-empty combobox fires nothing", async ({ page }) => {
  await setup(page, IDENTITY);
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const select = document.getElementById("sequenced");
    const events = [];
    select.addEventListener("input", () => events.push("input"));
    select.addEventListener("change", () => events.push("change"));
    const combo = Combobox.getOrCreateInstance(select);
    const result = await combo.clear();
    return { result, events };
  });
  expect(state.result).toBe(false);
  expect(state.events).toEqual([]);
});

test("programmatic select/remove/clear each emit exactly one input then one change", async ({ page }) => {
  await setup(page, FEATURES);
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const select = document.getElementById("tags");
    const combo = Combobox.getOrCreateInstance(select);
    const record = () => {
      const events = [];
      const onInput = () => events.push("input");
      const onChange = () => events.push("change");
      select.addEventListener("input", onInput);
      select.addEventListener("change", onChange);
      return () => {
        select.removeEventListener("input", onInput);
        select.removeEventListener("change", onChange);
        return [...events];
      };
    };

    const option = select.querySelector('option[value="2"]');

    const selectRecord = record();
    combo.select(option);
    const selectEvents = selectRecord();

    const removeRecord = record();
    await combo.remove(option);
    const removeEvents = removeRecord();

    const clearRecord = record();
    await combo.clear();
    const clearEvents = clearRecord();

    return { selectEvents, removeEvents, clearEvents };
  });
  expect(state.selectEvents).toEqual(["input", "change"]);
  expect(state.removeEvents).toEqual(["input", "change"]);
  expect(state.clearEvents).toEqual(["input", "change"]);
});

test.describe("single-select clear semantics (investigation)", () => {
  test("clear() on a single select: measured native state, with and without an empty option", async ({
    page,
  }) => {
    await setup(page, FEATURES);
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const make = (html) => {
        const form = document.createElement("form");
        const select = document.createElement("select");
        select.name = "s";
        select.innerHTML = html;
        form.append(select);
        document.body.append(form);
        return { form, select };
      };
      const withEmpty = make(
        `<option value="">Choose</option><option value="1">One</option><option value="2">Two</option>`,
      );
      const noEmpty = make(`<option value="a">A</option><option value="b">B</option>`);

      const comboA = Combobox.getOrCreateInstance(withEmpty.select);
      const comboB = Combobox.getOrCreateInstance(noEmpty.select);
      comboA.select("1");
      comboB.select("b");

      const read = (form, select) => ({
        value: select.value,
        index: select.selectedIndex,
        selectedCount: select.selectedOptions.length,
        label: select.nextElementSibling?.querySelector(".cb-input")?.value ?? null,
        formData: new FormData(form).get("s") ?? null,
      });

      const beforeA = read(withEmpty.form, withEmpty.select);
      const beforeB = read(noEmpty.form, noEmpty.select);
      const resultA = await comboA.clear();
      const resultB = await comboB.clear();
      return {
        resultA,
        resultB,
        withEmpty: { before: beforeA, after: read(withEmpty.form, withEmpty.select) },
        noEmpty: { before: beforeB, after: read(noEmpty.form, noEmpty.select) },
      };
    });
    expect(state.resultA).toBe(true);
    expect(state.resultB).toBe(true);
    // Measured contract (2026-09): after clear() the browser collapses a single
    // select to its first option — the blank placeholder stays blank, but a
    // select without a value="" placeholder re-selects its first real option,
    // so clear() is value-preserving there (b -> a). selectedIndex is never -1.
    expect(state.withEmpty.after).toEqual({
      value: "",
      index: 0,
      selectedCount: 1,
      label: "",
      formData: "",
    });
    expect(state.noEmpty.after).toEqual({
      value: "a",
      index: 0,
      selectedCount: 1,
      label: "A",
      formData: "a",
    });
  });
});
