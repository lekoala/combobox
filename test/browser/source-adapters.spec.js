import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

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

test.describe("lifecycle / dispose hardening", () => {
  test("input without a datalist fails clearly", async ({ page }) => {
    const message = await page.evaluate(() => {
      try {
        new Combobox(document.getElementById("nolist"));
        return null;
      } catch (error) {
        return error.message;
      }
    });
    expect(message).toContain("datalist");
  });

  test("dispose restores the select, the explicit filter input and source attributes", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "explicit");

    const before = await page.evaluate(() => {
      const select = document.getElementById("explicit");
      const input = document.getElementById("explicit-filter");
      return {
        controlMoved: input.parentElement?.classList.contains("cb-control"),
        unnamed: !input.hasAttribute("name"),
        visible: !input.hasAttribute("hidden"),
        sourceHidden: select.classList.contains("cb-source-hidden"),
        sourceAriaHidden: select.getAttribute("aria-hidden"),
      };
    });
    expect(before.controlMoved).toBe(true);
    expect(before.unnamed).toBe(true);
    expect(before.visible).toBe(true);
    expect(before.sourceHidden).toBe(true);
    expect(before.sourceAriaHidden).toBe("true");

    await page.evaluate(() => Combobox.getInstance(document.getElementById("explicit")).dispose());

    const after = await page.evaluate(() => {
      const select = document.getElementById("explicit");
      const input = document.getElementById("explicit-filter");
      return {
        backInForm: input.parentElement === document.querySelector("#source-form"),
        hiddenAgain: input.hasAttribute("hidden"),
        controlGone: select.nextElementSibling?.classList.contains("cb-control") === false,
        sourceVisible: !select.classList.contains("cb-source-hidden"),
        ariaHiddenGone: !select.hasAttribute("aria-hidden"),
        tabindexGone: !select.hasAttribute("tabindex"),
        popoverGone: document.querySelectorAll(".cb-popover").length === 0,
      };
    });
    expect(after.backInForm).toBe(true);
    expect(after.hiddenAgain).toBe(true);
    expect(after.controlGone).toBe(true);
    expect(after.sourceVisible).toBe(true);
    expect(after.ariaHiddenGone).toBe(true);
    expect(after.tabindexGone).toBe(true);
    expect(after.popoverGone).toBe(true);
  });

  test("dispose is idempotent and safe on a detached subtree", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(async () => {
      const source = document.getElementById("wrapped");
      const combo = Combobox.getOrCreateInstance(source, { observeSource: true });
      const holder = document.createElement("div");
      holder.append(source);
      combo.dispose();
      const second = await (async () => {
        try {
          combo.dispose();
          return "ok";
        } catch (error) {
          return error.message;
        }
      })();
      return {
        second,
        instanceGone: Combobox.getInstance(source) === null,
        controlGone: document.querySelectorAll(".cb-control").length === 0,
        popoverGone: document.querySelectorAll(".cb-popover").length === 0,
        observerGone: combo._sourceObserver === null,
        sourceRestored: !source.hasAttribute("aria-hidden"),
      };
    });
    expect(state.second).toBe("ok");
    expect(state.instanceGone).toBe(true);
    expect(state.controlGone).toBe(true);
    expect(state.popoverGone).toBe(true);
    expect(state.observerGone).toBe(true);
    expect(state.sourceRestored).toBe(true);
  });

  test("a generated filter input is removed with the wrapper on dispose", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "wrapped");
    expect(await page.locator("#wrapped + .cb-control .cb-input").count()).toBe(1);

    await page.evaluate(() => Combobox.getInstance(document.getElementById("wrapped")).dispose());
    await expect(page.locator("#wrapped + .cb-control .cb-input")).toHaveCount(0);
  });
});

test.describe("select single/multiple source mapping", () => {
  test("single select filter shows the selected label and owns the native value", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "wrapped");
    const input = page.locator(control("wrapped"));
    await input.fill("Wiz");
    await page.locator(".cb-popover:visible .cb-option", { hasText: "Wizard" }).click();
    await page.waitForTimeout(40);

    expect(await input.inputValue()).toBe("Wizard");
    expect(await page.locator("#wrapped").inputValue()).toBe("w1");
  });

  test("explicit filter input is reused, unnamed and restored hidden on dispose", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "explicit");
    expect(await page.locator("#explicit + .cb-control .cb-input#explicit-filter").count()).toBe(1);

    await page.evaluate(() => Combobox.getInstance(document.getElementById("explicit")).dispose());
    await expect(page.locator("#explicit-filter")).toHaveAttribute("hidden", /.*/);
  });

  test("input[data-filter-for=id] discovery works", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "disc");
    await expect(page.locator("#disc + .cb-control .cb-input#disc-filter")).toHaveCount(1);
  });
});

test.describe("optgroup / disabled propagation", () => {
  test("disabled option and disabled optgroup children cannot be selected by mouse", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "grouped");
    await page.locator(control("grouped")).click();
    await page.waitForTimeout(40);

    const disabledRows = page.locator(".cb-popover:visible .cb-option[aria-disabled='true']");
    expect(await disabledRows.allTextContents()).toEqual(["Banana (disabled)", "Carrot"]);

    await page
      .locator(".cb-popover:visible .cb-option", { hasText: "Banana (disabled)" })
      .dispatchEvent("click");
    await page.locator(".cb-popover:visible .cb-option", { hasText: "Carrot" }).dispatchEvent("click");
    expect(await page.locator("#grouped").inputValue()).toBe("");

    await page.locator(".cb-popover:visible .cb-option", { hasText: "Apple" }).dispatchEvent("click");
    expect(await page.locator("#grouped").inputValue()).toBe("apple");
  });

  test("keyboard navigation skips disabled options and disabled optgroup children", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "grouped");
    await page.locator(control("grouped")).click();
    await page.waitForTimeout(40);

    await page.evaluate(async () => {
      const combo = Combobox.getInstance(document.getElementById("grouped"));
      const input = combo.input;
      const active = [];
      combo.input.focus();
      for (let i = 0; i < 6; i++) {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (combo.activeIndex >= 0) active.push(combo.activeIndex);
      }
      window.__activePath = active;
    });

    const path = await page.evaluate(() => {
      const combo = Combobox.getInstance(document.getElementById("grouped"));
      return {
        activePath: window.__activePath,
        neverDisabled: window.__activePath.every((index) => {
          const item = combo.visibleItems[index];
          return item && !item.disabled;
        }),
      };
    });
    expect(path.activePath.length).toBeGreaterThan(0);
    expect(path.neverDisabled).toBe(true);
  });

  test("group headers render only for groups with visible results", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "grouped");
    const input = page.locator(control("grouped"));
    await input.click();

    const headers = page.locator(".cb-popover:visible .cb-group");
    expect(await headers.allTextContents()).toEqual(["Fruits", "Veggies"]);
    await input.fill("Carrot");
    expect(await page.locator(".cb-popover:visible .cb-group").allTextContents()).toEqual(["Veggies"]);
    await input.fill("zzz");
    expect(await page.locator(".cb-popover:visible .cb-group").allTextContents()).toEqual([]);
  });
});

test.describe("required / invalid / reset", () => {
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
    await page.waitForTimeout(40);

    await page.evaluate(() => document.querySelector("#source-form").reset());
    await page.waitForTimeout(40);

    const state = await page.evaluate(() => ({
      reqValue: document.getElementById("req").value,
      reqLabel: document.querySelector("#req + .cb-control .cb-input").value,
      city2: document.getElementById("city2").value,
      chips: Array.from(document.querySelectorAll("#syncs + .cb-control .cb-chip")).map((chip) =>
        chip.getAttribute("data-value"),
      ),
    }));
    expect(state.reqValue).toBe("");
    expect(state.reqLabel).toBe("");
    expect(state.city2).toBe("");
    expect(state.chips).toEqual(["1"]);
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

test.describe("label/description accessibility transfer", () => {
  test("accessible name comes from a for-label; invented ids are stripped on dispose", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "explicit");

    const during = await page.evaluate(() => {
      const label = document.querySelector('label[for="explicit"]');
      const input = document.querySelector("#explicit + .cb-control .cb-input");
      return { id: label.id, labelledby: input.getAttribute("aria-labelledby") };
    });
    expect(during.id).toMatch(/^combobox-label-/);
    expect(during.labelledby).toBe(during.id);

    await page.evaluate(() => Combobox.getInstance(document.getElementById("explicit")).dispose());
    const after = await page.evaluate(() => ({
      labelId: document.querySelector('label[for="explicit"]').id,
      discKept: document.getElementById("disc-real-label").id,
    }));
    expect(after.labelId).toBe("");
    expect(after.discKept).toBe("disc-real-label");
  });

  test("wrapped label (no for) names the combobox without an id", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "wrapped");
    const state = await page.evaluate(() => {
      const input = document.querySelector("#wrapped + .cb-control .cb-input");
      return {
        labelledby: input.getAttribute("aria-labelledby"),
        wrapHasId: document.getElementById("wrapped-wrap").id,
      };
    });
    expect(state.labelledby).toBe("wrapped-wrap");
    expect(state.wrapHasId).toBe("wrapped-wrap");
  });

  test("aria-label is used as fallback when there is no label association", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "arialabel");
    expect(await page.locator(control("arialabel")).getAttribute("aria-label")).toBe("Accessible label test");
  });

  test("source aria-labelledby wins as the accessible name", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    // DataGrid names its filter selects after the column header: <th id> +
    // aria-labelledby, with no <label> in sight. The enhanced input must reuse
    // that association verbatim and never fall back to aria-label.
    await init(page, "labelled");
    const state = await page.evaluate(() => {
      const input = document.querySelector("#labelled + .cb-control .cb-input");
      return {
        labelledby: input.getAttribute("aria-labelledby"),
        ariaLabel: input.getAttribute("aria-label"),
        headingId: document.getElementById("col-heading").id,
      };
    });
    expect(state.labelledby).toBe("col-heading");
    expect(state.ariaLabel).toBeNull();
    expect(state.headingId).toBe("col-heading");
  });

  test("aria-labelledby is restored on dispose for an authored filter input", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "labelledby-author");
    expect(await page.locator("#labelled-filter").getAttribute("aria-labelledby")).toBe("col-heading");

    await page.evaluate(() => Combobox.getInstance(document.getElementById("labelledby-author")).dispose());
    await expect(page.locator("#labelled-filter")).not.toHaveAttribute("aria-labelledby");
  });

  test("aria-describedby propagates to the filter input", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "described");
    expect(await page.locator(control("described")).getAttribute("aria-describedby")).toBe("desc-text");
  });

  test("label click focuses the enhanced filter input", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "explicit");
    await page.locator('label[for="explicit"]').click();
    const focused = await page.evaluate(
      () => document.activeElement === document.querySelector("#explicit + .cb-control .cb-input"),
    );
    expect(focused).toBe(true);
  });
});

test.describe("external sync()", () => {
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

test.describe("free-form pattern / FormData envelope", () => {
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

test.describe("input+datalist blur with open picker", () => {
  test("blurring an open input combobox closes cleanly without a select-backed call", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await init(page, "city2");
    const result = await page.evaluate(async () => {
      const combo = Combobox.getInstance(document.getElementById("city2"));
      combo.input.focus();
      const wasOpen = combo.isOpen() || combo.show();
      await new Promise((resolve) => setTimeout(resolve, 20));
      document.activeElement?.blur();
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { wasOpen, stillOpen: combo.isOpen(), value: document.getElementById("city2").value };
    });
    expect(result.wasOpen).toBe(true);
    expect(result.stillOpen).toBe(false);
    expect(pageErrors).toEqual([]);
  });
});

test.describe("observeSource", () => {
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

  test("input+datalist observes the detached datalist and restores on dispose", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(async () => {
      const source = document.getElementById("city2");
      const combo = Combobox.getOrCreateInstance(source, { observeSource: true });
      const datalist = combo.datalist;
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      // The datalist is detached in enhanced mode; the observer watches it anyway.
      datalist.append(
        (() => {
          const option = document.createElement("option");
          option.value = "Namur";
          return option;
        })(),
      );
      await wait(250);
      const observesDetached = combo.filteredItems.some((item) => item.value === "Namur");

      combo.dispose();
      const restoredInDocument = document.getElementById("city2-list") !== null;
      const listLinked = source.getAttribute("list") === "city2-list";
      const instanceGone = Combobox.getInstance(source) === null;
      return { observesDetached, restoredInDocument, listLinked, instanceGone };
    });
    expect(state.observesDetached).toBe(true);
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
