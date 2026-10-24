import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("external sync()", () => {
  const FEATURES = "/test/fixtures/sources.html";

  function init(page, id, options) {
    return page.evaluate(
      ([id, options]) => Combobox.getOrCreateInstance(document.getElementById(id), options),
      [id, options],
    );
  }

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("sync() reflects externally added and removed options", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "syncs");

    const state = await page.evaluate(() => {
      const combo = Combobox.getInstance(document.getElementById("syncs"));
      const select = document.getElementById("syncs");
      select.append(new Option("Four", "4"));
      combo.sync();
      const added = combo.filteredItems.some((item) => item.value === "4");

      select.querySelector('option[value="4"]').selected = true;
      combo.sync();
      const selectedAfterSelect = combo.getSelectedValues();
      const chipsAfterSelect = Array.from(document.querySelectorAll(".cb-chip")).map((chip) =>
        chip.getAttribute("data-value"),
      );

      select.querySelector('option[value="4"]').remove();
      combo.sync();
      const chipsAfterRemove = Array.from(document.querySelectorAll(".cb-chip")).map((chip) =>
        chip.getAttribute("data-value"),
      );
      return { added, selectedAfterSelect, chipsAfterSelect, chipsAfterRemove };
    });

    expect(state.added).toBe(true);
    expect(state.selectedAfterSelect).toContain("4");
    expect(state.chipsAfterSelect).toContain("4");
    expect(state.chipsAfterRemove).toEqual(["1"]);
  });

  test("removing an unselected option leaves the selection model untouched", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(() => {
      const select = document.getElementById("syncs");
      const combo = Combobox.getOrCreateInstance(select);
      select.append(new Option("Four", "4"));
      combo.sync();

      // Remove the unselected catalogue option directly from the DOM.
      select.querySelector('option[value="4"]').remove();
      combo.sync();

      return {
        selection: combo.getSelectedValues(),
        chips: Array.from(document.querySelectorAll(".cb-chip")).map((chip) =>
          chip.getAttribute("data-value"),
        ),
        catalogue: Array.from(select.options, (o) => o.value),
        nativeSelected: Array.from(select.selectedOptions, (o) => o.value),
      };
    });

    expect(state.selection).toEqual(["1"]);
    expect(state.chips).toEqual(["1"]);
    expect(state.catalogue).toEqual(["1", "2", "3"]);
    expect(state.nativeSelected).toEqual(["1"]);
  });

  test("sync() drops transient results back to the source catalogue", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(() => {
      const combo = Combobox.getOrCreateInstance(document.getElementById("syncs"));
      combo.setResults([{ value: "x", label: "Transient" }]);
      combo.applyFilter("", { show: false });
      const during = combo.filteredItems.map((item) => item.value);
      combo.sync();
      return { during, after: combo.filteredItems.map((item) => item.value) };
    });
    expect(state.during).toEqual(["x"]);
    // The picker excludes the already-selected "1" for a multiple select.
    expect(state.after.sort()).toEqual(["2", "3"]);
  });

  test("selectionOrder=selected reconciles externally selected options in native order", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await page.evaluate(() => {
      const select = document.getElementById("syncs");
      Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
      select.querySelector('option[value="3"]').selected = true;
      Combobox.getInstance(select).sync();
    });
    const order = await page.evaluate(() =>
      Combobox.getInstance(document.getElementById("syncs")).getSelectedValues(),
    );
    expect(order).toEqual(["1", "3"]);
  });

  test("sync() reflects disabled/required/readonly toggled after init", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(() => {
      const dis = document.getElementById("dis");
      const disCombo = Combobox.getOrCreateInstance(dis);
      dis.disabled = false;
      disCombo.sync();
      const enabled = !disCombo.input.disabled;

      const req = document.getElementById("req");
      const reqCombo = Combobox.getOrCreateInstance(req);
      req.required = false;
      reqCombo.sync();
      const requiredGone = !reqCombo.input.hasAttribute("aria-required");
      return { enabled, requiredGone };
    });
    expect(state.enabled).toBe(true);
    expect(state.requiredGone).toBe(true);
  });
});

test.describe("observeSource", () => {
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

  test("observeSource is opt-in and defaults to off", async ({ page }) => {
    await init(page, "syncs");
    const observed = await page.evaluate(() => {
      const combo = Combobox.getInstance(document.getElementById("syncs"));
      const observed = combo._sourceObserver;
      return { option: combo.options.observeSource, observer: observed };
    });
    expect(observed.option).toBe(false);
    expect(observed.observer).toBeNull();
  });

  test("external mutations are batched into a single refresh", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "syncs", { observeSource: true });
    const result = await page.evaluate(async () => {
      const combo = Combobox.getInstance(document.getElementById("syncs"));
      window.__renders = 0;
      new MutationObserver(() => window.__renders++).observe(combo.listbox, { childList: true });
      const select = document.getElementById("syncs");
      for (let i = 0; i < 50; i++) select.append(new Option(`Added ${i}`, `a${i}`));
      await new Promise((resolve) => setTimeout(resolve, 250));
      // 3 source options, one of them selected ("1") so the picker shows 52.
      return { renders: window.__renders, count: combo.filteredItems.length };
    });
    expect(result.renders).toBe(1);
    expect(result.count).toBe(52);
  });

  test("observed accessible-name changes refresh without clearing transient results", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(async () => {
      const select = document.getElementById("syncs");
      const combo = Combobox.getOrCreateInstance(select, { observeSource: true });
      combo.setResults([{ value: "remote", label: "Remote result" }]).applyFilter("");
      select.setAttribute("aria-labelledby", "updated-heading");
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        results: combo.results?.map((item) => item.value),
        rows: combo.filteredItems.map((item) => item.value),
        labelledBy: combo.input.getAttribute("aria-labelledby"),
      };
    });
    expect(state).toEqual({
      results: ["remote"],
      rows: ["remote"],
      labelledBy: "updated-heading",
    });
  });

  test("observeSource covers attributes and structure; programmatic selection still needs sync()", async ({
    page,
  }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(async () => {
      const select = document.getElementById("syncs");
      const combo = Combobox.getOrCreateInstance(select, { observeSource: true });
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const watchRenders = () => {
        window.__mo?.disconnect();
        window.__renders = 0;
        window.__mo = new MutationObserver(() => window.__renders++);
        window.__mo.observe(combo.listbox, { childList: true });
      };

      // Structural mutation (append) is observed automatically.
      watchRenders();
      select.append(new Option("Four", "4"));
      await wait(250);
      const afterAppend = window.__renders;
      const listHasFour = combo.filteredItems.some((item) => item.value === "4");

      // Attribute mutation (source state) is observed automatically.
      watchRenders();
      select.required = true;
      await wait(250);
      const afterRequired = window.__renders;

      // A programmatic .selected property change is neither an attribute nor a
      // structural mutation, so MutationObserver cannot see it: sync() remains
      // the explicit contract for live-selection changes.
      watchRenders();
      select.querySelector('option[value="2"]').selected = true;
      await wait(250);
      const afterProperty = window.__renders;
      const chipsBeforeSync = Array.from(document.querySelectorAll(".cb-chip")).map((chip) =>
        chip.getAttribute("data-value"),
      );

      combo.sync();
      const chipsAfterSync = Array.from(document.querySelectorAll(".cb-chip")).map((chip) =>
        chip.getAttribute("data-value"),
      );
      return {
        afterAppend,
        listHasFour,
        afterRequired,
        afterProperty,
        chipsBeforeSync,
        chipsAfterSync,
      };
    });
    expect(state.afterAppend).toBe(1);
    expect(state.listHasFour).toBe(true);
    expect(state.afterRequired).toBe(1);
    expect(state.afterProperty).toBe(0);
    expect(state.chipsBeforeSync).toEqual(["1"]);
    expect(state.chipsAfterSync).toContain("2");
  });

  test("engine mutations are suppressed from a duplicated refresh", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const counts = await page.evaluate(async () => {
      const select = document.getElementById("syncs");
      const combo = Combobox.getOrCreateInstance(select, { observeSource: true });
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const watchRenders = () => {
        window.__mo?.disconnect();
        window.__renders = 0;
        window.__mo = new MutationObserver(() => window.__renders++);
        window.__mo.observe(combo.listbox, { childList: true });
      };

      // addOption does not refresh itself: the observer must surface it once.
      watchRenders();
      combo.addOption({ value: "x", label: "Standalone" });
      await wait(250);
      const afterAdd = window.__renders;

      // setOptions refreshes itself and must not be echoed by the observer.
      watchRenders();
      combo.setOptions([
        { value: "1", label: "One" },
        { value: "2", label: "Two" },
        { value: "3", label: "Three" },
      ]);
      await wait(250);
      const afterSetOptions = window.__renders;

      // select refreshes itself and must not be echoed by the observer.
      watchRenders();
      combo.select("3");
      await wait(250);
      const afterSelect = window.__renders;
      return { afterAdd, afterSetOptions, afterSelect };
    });

    expect(counts.afterAdd).toBe(1);
    expect(counts.afterSetOptions).toBe(1);
    expect(counts.afterSelect).toBe(1);
  });

  test("syncing while search is focused preserves focus and query", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "syncs", { observeSource: true });
    const input = page.locator(control("syncs"));
    await input.fill("Tw");
    await input.click();

    await page.evaluate(() => {
      const select = document.getElementById("syncs");
      for (let i = 0; i < 30; i++) select.append(new Option(`Extra ${i}`, `e${i}`));
    });
    await page.waitForTimeout(250);

    const state = await page.evaluate(() => ({
      focused: document.activeElement === document.querySelector("#syncs + .cb-control .cb-input"),
      query: document.querySelector("#syncs + .cb-control .cb-input").value,
      matches: Combobox.getInstance(document.getElementById("syncs")).filteredItems.filter((item) =>
        item.label.toLowerCase().includes("tw"),
      ).length,
    }));
    expect(state.focused).toBe(true);
    expect(state.query).toBe("Tw");
    expect(state.matches).toBeGreaterThan(0);
  });

  test("input+datalist stays discoverable, is observed and relinks on dispose", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(async () => {
      const source = document.getElementById("city2");
      const combo = Combobox.getOrCreateInstance(source, { observeSource: true });
      const datalist = combo.datalist;
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const discoverableWhileEnhanced = document.getElementById("city2-list") === datalist;
      datalist.append(
        (() => {
          const option = document.createElement("option");
          option.value = "Namur";
          return option;
        })(),
      );
      await wait(250);
      const observesCatalogue = combo.filteredItems.some((item) => item.value === "Namur");

      combo.dispose();
      const restoredInDocument = document.getElementById("city2-list") !== null;
      const listLinked = source.getAttribute("list") === "city2-list";
      const instanceGone = Combobox.getInstance(source) === null;
      return { discoverableWhileEnhanced, observesCatalogue, restoredInDocument, listLinked, instanceGone };
    });
    expect(state.discoverableWhileEnhanced).toBe(true);
    expect(state.observesCatalogue).toBe(true);
    expect(state.restoredInDocument).toBe(true);
    expect(state.listLinked).toBe(true);
    expect(state.instanceGone).toBe(true);
  });

  test("multiple attribute changes are ignored while required is observed", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const counts = await page.evaluate(async () => {
      const select = document.getElementById("syncs");
      const combo = Combobox.getOrCreateInstance(select, { observeSource: true });
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const watchRenders = () => {
        window.__mo?.disconnect();
        window.__renders = 0;
        window.__mo = new MutationObserver(() => window.__renders++);
        window.__mo.observe(combo.listbox, { childList: true });
      };

      watchRenders();
      select.multiple = false;
      await wait(250);
      const afterMultiple = window.__renders;

      watchRenders();
      select.required = true;
      await wait(250);
      const afterRequired = window.__renders;
      return { afterMultiple, afterRequired };
    });
    expect(counts.afterMultiple).toBe(0);
    expect(counts.afterRequired).toBe(1);
  });
});
