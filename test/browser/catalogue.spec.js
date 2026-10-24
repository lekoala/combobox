import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Catalogue identity and adoption", () => {
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

  test("addOption/select adopt a detached or foreign option node for real", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice" multiple><option value="a">A</option></select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      // multiple: a plain <select>'s first option is auto-selected by the
      // platform, and adoption must preserve the node's own state.
      const other = document.createElement("select");
      other.multiple = true;
      other.innerHTML = `<option value="f">Foreign</option>`;
      document.body.append(other);
      const combo = Combobox.getOrCreateInstance(select);

      const detached = new Option("Detached", "d");
      combo.addOption({ value: "d", label: "Detached", option: detached });
      const detachedInSelect = detached.closest("select") === select;

      const foreign = other.options[0];
      combo.addOption({ value: "f", label: "Foreign", option: foreign });
      const foreignMoved = foreign.closest("select") === select && other.options.length === 0;

      const viaSelect = new Option("ViaSelect", "v");
      const selectedViaSelect = combo.select({ value: "v", label: "ViaSelect", option: viaSelect });
      const viaSelectLanded = viaSelect.closest("select") === select && viaSelect.selected;

      const result = {
        detachedInSelect,
        foreignMoved,
        selectedViaSelect,
        viaSelectLanded,
        values: combo.getSelectedValues(),
      };
      combo.dispose();
      form.remove();
      other.remove();
      return result;
    });

    expect(state.detachedInSelect).toBe(true);
    expect(state.foreignMoved).toBe(true);
    expect(state.selectedViaSelect).toBe(true);
    expect(state.viaSelectLanded).toBe(true);
    expect(state.values).toEqual(["v"]);
  });

  test("setOptions preserves distinct same-label optgroups for selected option identities", async ({
    page,
  }) => {
    const state = await page.evaluate(() => {
      const select = document.createElement("select");
      select.multiple = true;
      const enabled = document.createElement("optgroup");
      enabled.label = "Same";
      enabled.append(new Option("A", "a", true, true));
      const disabled = document.createElement("optgroup");
      disabled.label = "Same";
      disabled.disabled = true;
      disabled.append(new Option("B", "b", true, true));
      select.append(enabled, disabled);
      document.body.append(select);
      const options = [...select.selectedOptions];
      const combo = new Combobox(select);
      combo.setOptions([]);
      return {
        groups: [...select.querySelectorAll("optgroup")].map((group) => ({
          sameEnabled: group === enabled,
          sameDisabled: group === disabled,
          disabled: group.disabled,
          values: [...group.children].map((option) => option.value),
        })),
        optionsKept: options.every((option) => option.closest("select") === select),
      };
    });
    expect(state).toEqual({
      groups: [
        { sameEnabled: true, sameDisabled: false, disabled: false, values: ["a"] },
        { sameEnabled: false, sameDisabled: true, disabled: true, values: ["b"] },
      ],
      optionsKept: true,
    });
  });
});
