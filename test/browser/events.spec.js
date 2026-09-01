import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";
const IDENTITY = "/test/fixtures/identity.html";
const MODERN = "Modern Popover + Anchor support is required";

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
