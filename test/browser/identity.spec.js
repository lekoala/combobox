import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Native option identity", () => {
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

  test("setOptions(preserveSelected) keeps a selected occurrence also present in the payload", async ({
    page,
  }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(() => {
      const select = document.createElement("select");
      select.multiple = true;
      document.body.append(select);
      const combo = Combobox.getOrCreateInstance(select);
      // A materialized selection (creation/remote), now a real native option.
      combo.addOption({ value: "plum", label: "Plum" }, { selected: true });
      const before = {
        values: Array.from(select.selectedOptions, (o) => o.value),
        count: select.options.length,
      };

      // The new catalogue legitimately contains the same value again. There is no
      // value-based dedupe: the preserved selected option and the fresh payload
      // occurrence are two distinct native options, one selected.
      combo.setOptions([{ value: "plum", label: "Plum (catalogue)" }]);

      return {
        before,
        values: Array.from(select.options, (o) => o.value),
        labels: Array.from(select.options, (o) => o.textContent.trim()),
        selectedValues: Array.from(select.selectedOptions, (o) => o.value),
        selectedLabels: Array.from(select.selectedOptions, (o) => o.textContent.trim()),
      };
    });

    expect(state.before).toEqual({ values: ["plum"], count: 1 });
    expect(state.values).toEqual(["plum", "plum"]);
    expect(state.labels).toEqual(["Plum", "Plum (catalogue)"]);
    expect(state.selectedValues).toEqual(["plum"]);
    expect(state.selectedLabels).toEqual(["Plum"]);
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
});

test.describe("Duplicate choices", () => {
  const FEATURES = "/test/fixtures/features.html";

  function control(id) {
    return `#${id} + .cb-control .cb-input`;
  }

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("duplicate values are distinct option identities in chips and selection", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
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

  test("same label with different values stays two selectable identities", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(() => {
      const select = document.getElementById("twinlabels");
      const combo = Combobox.getOrCreateInstance(select);
      const a = combo.select("a");
      const b = combo.select("b");
      return {
        a,
        b,
        selected: Array.from(select.selectedOptions, (o) => o.value),
        values: combo.getSelectedValues(),
      };
    });
    expect(state.a).toBe(true);
    expect(state.b).toBe(true);
    expect(state.selected).toEqual(["a", "b"]);
  });
});

test.describe("Transient result identity", () => {
  const FIXTURE = "/test/fixtures/elements.html";

  test("transient results keep first-value resolution and exact duplicate option identity", async ({
    page,
  }) => {
    await setup(page, FIXTURE);
    const state = await page.evaluate(async () => {
      const select = document.createElement("select");
      select.multiple = true;
      select.innerHTML = '<option value="same">First</option><option value="same" selected>Second</option>';
      document.body.append(select);
      const [first, second] = select.options;
      const combo = new Combobox(select, { toggleSelected: true, maxOptions: 2 });
      combo.setResults([
        { value: "same", label: "Plain" },
        { value: "same", label: "Exact", option: second },
        ...Array.from({ length: 500 }, (_, index) => ({ value: String(index), label: String(index) })),
      ]);
      await combo.search("");
      return {
        identities: [combo.filteredItems[0].option === first, combo.filteredItems[1].option === second],
        selected: combo.filteredItems.slice(0, 2).map((item) => item.selected),
        count: select.options.length,
        results: combo.filteredItems.length,
        rendered: combo.listbox.querySelectorAll(".cb-option[data-index]").length,
        nativeSelected: Array.from(select.options, (option) => option.selected),
      };
    });
    expect(state).toEqual({
      identities: [true, true],
      selected: [false, true],
      count: 2,
      results: 502,
      rendered: 2,
      nativeSelected: [false, true],
    });
  });
});
