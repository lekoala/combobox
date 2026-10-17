import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("browser autofill", () => {
  const FEATURES = "/test/fixtures/sources.html";

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("autocomplete is defaulted to off, never forced over an authored token", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    // "off" is only a default: Chrome ignores it on fields its heuristics read
    // as address or payment, so a page must stay free to declare an escape
    // token (usually "new-password") on the field it types into.
    const values = await page.evaluate(() => {
      const enhanceInput = (id, autocomplete) => {
        const input = document.createElement("input");
        input.setAttribute("list", `${id}-list`);
        if (autocomplete) input.setAttribute("autocomplete", autocomplete);
        const datalist = document.createElement("datalist");
        datalist.id = `${id}-list`;
        datalist.innerHTML = '<option value="Brussels"></option>';
        document.body.append(input, datalist);
        Combobox.getOrCreateInstance(input);
        return input.getAttribute("autocomplete");
      };

      const enhanceSelect = (id, autocomplete) => {
        const select = document.createElement("select");
        select.id = id;
        select.innerHTML = '<option value="Brussels">Brussels</option>';
        const filter = document.createElement("input");
        filter.dataset.filterFor = id;
        if (autocomplete) filter.setAttribute("autocomplete", autocomplete);
        document.body.append(select, filter);
        Combobox.getOrCreateInstance(select);
        return filter.getAttribute("autocomplete");
      };

      return {
        input: enhanceInput("ac-plain", null),
        authoredInput: enhanceInput("ac-authored", "new-password"),
        filter: enhanceSelect("ac-select-plain", null),
        authoredFilter: enhanceSelect("ac-select-authored", "new-password"),
      };
    });

    expect(values.input).toBe("off");
    expect(values.authoredInput).toBe("new-password");
    expect(values.filter).toBe("off");
    expect(values.authoredFilter).toBe("new-password");
  });
});
