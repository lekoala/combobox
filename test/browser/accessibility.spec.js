import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("label/description accessibility transfer", () => {
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

  test("refresh re-resolves labels and source aria attributes added after init", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(() => {
      const source = document.createElement("select");
      source.id = "late-name";
      source.add(new Option("One", "1"));
      document.body.append(source);
      const combo = new Combobox(source);

      const label = document.createElement("label");
      label.htmlFor = source.id;
      label.textContent = "Late label";
      source.before(label);
      combo.refresh();
      const fromLabel = combo.input.getAttribute("aria-labelledby");
      const labelId = label.id;
      label.click();
      const lateLabelFocused = document.activeElement === combo.input;

      source.setAttribute("aria-label", "Late aria label");
      source.setAttribute("aria-describedby", "late-description");
      source.setAttribute("aria-labelledby", "late-heading");
      combo.refresh();
      return {
        fromLabel,
        labelId,
        lateLabelFocused,
        staleLabelIdRemoved: label.id === "",
        labelledby: combo.input.getAttribute("aria-labelledby"),
        ariaLabel: combo.input.getAttribute("aria-label"),
        describedby: combo.input.getAttribute("aria-describedby"),
      };
    });
    expect(state.fromLabel).toBe(state.labelId);
    expect(state.lateLabelFocused).toBe(true);
    expect(state.staleLabelIdRemoved).toBe(true);
    expect(state.labelledby).toBe("late-heading");
    expect(state.ariaLabel).toBeNull();
    expect(state.describedby).toBe("late-description");
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
