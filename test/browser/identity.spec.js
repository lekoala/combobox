import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const IDENTITY_HTML = "/test/fixtures/identity.html";

test.beforeEach(async ({ page }) => {
  await setup(page, IDENTITY_HTML);
});

test("three preselected duplicate values are three chips, three selectedOptions, three values and three FormData entries", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("triple");
    const combo = Combobox.getOrCreateInstance(select);
    return {
      selected: Array.from(select.selectedOptions, (option) => option.value),
      chips: Array.from(
        document.querySelectorAll("#triple + .cb-control .cb-chip"),
        (chip) => chip.dataset.value,
      ),
      values: combo.getSelectedValues(),
      formData: new FormData(document.getElementById("form")).getAll("triple[]"),
    };
  });

  expect(state.selected).toEqual(["2", "2", "2"]);
  expect(state.chips).toEqual(["2", "2", "2"]);
  expect(state.values).toEqual(["2", "2", "2"]);
  expect(state.formData).toEqual(["2", "2", "2"]);
});

test("successive select('2') picks each distinct option, then false when exhausted", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("sequenced");
    const combo = Combobox.getOrCreateInstance(select);
    return {
      first: combo.select("2"),
      second: combo.select("2"),
      third: combo.select("2"),
      fourth: combo.select("2"),
      selected: Array.from(select.selectedOptions, (option) => option.value),
      chips: Array.from(document.querySelectorAll("#sequenced + .cb-control .cb-chip")).length,
    };
  });

  expect(state.first).toBe(true);
  expect(state.second).toBe(true);
  expect(state.third).toBe(true);
  expect(state.fourth).toBe(false);
  expect(state.selected).toEqual(["2", "2", "2"]);
  expect(state.chips).toBe(3);
});

test("two options sharing value AND label stay independent identities", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("sametwins");
    const combo = Combobox.getOrCreateInstance(select);
    return {
      first: combo.select("twin"),
      second: combo.select("twin"),
      third: combo.select("twin"),
      selected: Array.from(select.selectedOptions, (option) => option.value),
    };
  });

  expect(state.first).toBe(true);
  expect(state.second).toBe(true);
  expect(state.third).toBe(false);
  expect(state.selected).toEqual(["twin", "twin"]);
});

test("removing the middle duplicate deselects only that exact option", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(async () => {
    const select = document.getElementById("triple");
    const combo = Combobox.getOrCreateInstance(select);
    const options = Array.from(select.options);
    await combo.remove(options[1]);
    return {
      selected: Array.from(select.selectedOptions, (option) => option.value),
      chips: Array.from(
        document.querySelectorAll("#triple + .cb-control .cb-chip"),
        (chip) => chip.dataset.value,
      ),
      firstStill: options[0].selected,
      middleUnselected: options[1].selected === false,
      thirdStill: options[2].selected,
    };
  });

  expect(state.selected).toEqual(["2", "2"]);
  expect(state.chips).toEqual(["2", "2"]);
  expect(state.firstStill).toBe(true);
  expect(state.middleUnselected).toBe(true);
  expect(state.thirdStill).toBe(true);
});

test("selectionOrder:'selected' keeps the three occurrences and moves the middle identity", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("ordered");
    const combo = Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
    const options = Array.from(select.options);
    const before = combo.getSelectedItems().map((item) => options.indexOf(item.option));
    const moved = combo.move(options[1], 2);
    const after = combo.getSelectedItems().map((item) => options.indexOf(item.option));
    return { before, moved, after, catalogue: Array.from(select.options, (option) => option.value) };
  });

  expect(state.before).toEqual([0, 1, 2]);
  expect(state.moved).toBe(true);
  expect(state.after).toEqual([0, 2, 1]);
  expect(state.catalogue).toEqual(["2", "2", "2"]);
});

test("getSelectedItems() reports distinct labels despite identical values", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("sequenced");
    const combo = Combobox.getOrCreateInstance(select);
    combo.select("2");
    combo.select("2");
    combo.select("2");
    return combo.getSelectedItems().map((item) => item.label);
  });

  expect(state).toEqual(["Banana", "Banana", "Banana 2 same value"]);
});

test("form reset restores each defaultSelected occurrence", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(async () => {
    const select = document.getElementById("triple");
    const combo = Combobox.getOrCreateInstance(select);
    await combo.remove(Array.from(select.options)[0]);
    const beforeReset = combo.getSelectedValues();
    document.getElementById("form").reset();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const afterReset = combo.getSelectedValues();
    const chipCount = document.querySelectorAll("#triple + .cb-control .cb-chip").length;
    return { beforeReset, afterReset, chipCount };
  });

  expect(state.beforeReset).toEqual(["2", "2"]);
  expect(state.afterReset).toEqual(["2", "2", "2"]);
  expect(state.chipCount).toBe(3);
});

test("maxItems counts selected options, not unique values", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("maxed");
    const combo = Combobox.getOrCreateInstance(select, { maxItems: 2 });
    return {
      first: combo.select("2"),
      second: combo.select("2"),
      third: combo.select("3"),
      fourth: combo.select("2"),
      selected: Array.from(select.selectedOptions, (option) => option.value),
    };
  });

  expect(state.first).toBe(true);
  expect(state.second).toBe(true);
  expect(state.third).toBe(false);
  expect(state.fourth).toBe(false);
  expect(state.selected).toEqual(["2", "2"]);
});

test("setOptions() conserves [2,2,2] instead of deduping by value", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("rebuilt");
    const combo = Combobox.getOrCreateInstance(select);
    combo.setOptions([
      { value: "2", label: "Two a" },
      { value: "2", label: "Two b" },
      { value: "2", label: "Two c" },
    ]);
    return {
      catalogue: Array.from(select.options, (option) => option.value),
      labels: Array.from(select.options, (option) => option.textContent.trim()),
    };
  });

  expect(state.catalogue).toEqual(["2", "2", "2"]);
  expect(state.labels).toEqual(["Two a", "Two b", "Two c"]);
});

test("single-select picking the second duplicate keeps its label and selectedIndex", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("single");
    const combo = Combobox.getOrCreateInstance(select);
    const options = Array.from(select.options);
    const beforeIndex = select.selectedIndex;
    combo.select(options[1]);
    return {
      beforeIndex,
      selectedIndex: select.selectedIndex,
      selectedLabel: select.selectedOptions[0]?.textContent.trim(),
      inputLabel: combo.input.value,
    };
  });

  expect(state.beforeIndex).toBe(0);
  expect(state.selectedIndex).toBe(1);
  expect(state.selectedLabel).toBe("Banana 2 same value");
  expect(state.inputLabel).toBe("Banana 2 same value");
});
