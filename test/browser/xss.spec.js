import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const XSS = "/test/fixtures/xss.html";

const PAY_IMG = '<img src=x onerror="window.__xss=1">';
const PAY_ATTR = '" onfocus="window.__xss=1';
const PAY_SVG = '<svg onload="window.__xss=1">';

test.beforeEach(async ({ page }) => {
  await setup(page, XSS);
});

test("hostile option labels, values and optgroup labels render literally and never execute", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const state = await page.evaluate(
    ({ PAY_IMG, PAY_ATTR, PAY_SVG }) => {
      const select = document.getElementById("xss-tags");
      const group = document.createElement("optgroup");
      group.label = PAY_SVG;
      const option = document.createElement("option");
      option.value = PAY_ATTR;
      option.textContent = PAY_IMG;
      group.append(option);
      select.append(group);

      const combo = Combobox.getOrCreateInstance(select);
      combo.search("", { show: true });
      const popover = document.querySelector(".cb-popover");
      const row = Array.from(combo.listbox.querySelectorAll(".cb-option")).find((node) =>
        node.textContent.includes("onerror"),
      );
      return {
        rowText: row?.textContent ?? null,
        markupCount: popover.querySelectorAll("script, img, svg, [onerror], [onload], [onfocus]").length,
        xss: window.__xss,
      };
    },
    { PAY_IMG, PAY_ATTR, PAY_SVG },
  );

  expect(state.rowText).toContain(PAY_IMG);
  expect(state.markupCount).toBe(0);
  expect(state.xss).toBe(0);
  expect(errors).toEqual([]);
});

test("hostile remote labels, values and data stay literal in rows and materialized options", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const state = await page.evaluate(
    async ({ PAY_ATTR }) => {
      const select = document.getElementById("xss-tags");
      const combo = Combobox.getOrCreateInstance(select, {
        debounce: 0,
        shouldLoad: (query) => query.length > 0,
        load: async () => [
          {
            value: PAY_ATTR,
            label: `<img src=x onerror="window.__xss=1"> alpha`,
            data: { note: "<b>bold</b>" },
          },
        ],
      });
      const input = combo.input;
      input.focus();
      input.value = "alpha";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 40));

      const row = Array.from(combo.listbox.querySelectorAll(".cb-option")).find((node) =>
        node.textContent.includes("onerror"),
      );
      const before = {
        rowText: row?.textContent ?? null,
        markupCount: combo.listbox.querySelectorAll("script, img, svg, [onload], [onerror]").length,
      };

      row?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const option = Array.from(select.options).find((node) => node.textContent.includes("onerror"));
      return {
        before,
        optionValue: option?.value ?? null,
        optionText: option?.textContent ?? null,
        datasetNote: option?.dataset.note ?? null,
        markupCount: select.querySelectorAll("script, img, svg, [onload], [onerror]").length,
        xss: window.__xss,
      };
    },
    { PAY_IMG, PAY_ATTR },
  );

  expect(state.before.rowText).toContain(PAY_IMG);
  expect(state.before.markupCount).toBe(0);
  expect(state.optionValue).toBe(PAY_ATTR);
  expect(state.optionText).toContain("onerror");
  expect(state.datasetNote).toBe("<b>bold</b>");
  expect(state.markupCount).toBe(0);
  expect(state.xss).toBe(0);
  expect(errors).toEqual([]);
});

test("hostile create and state-message text renders literally", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const state = await page.evaluate(
    async ({ PAY_IMG, PAY_SVG }) => {
      const select = document.getElementById("xss-tags");
      const combo = Combobox.getOrCreateInstance(select, {
        create: true,
        createFilter: (value) => !value.includes("none"),
        messages: {
          create: () => PAY_SVG,
          noResults: '<b onmouseover="window.__xss=1">none</b>',
        },
      });
      const input = combo.input;
      input.focus();

      input.value = PAY_IMG;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const createLabel =
        combo.listbox.querySelector(".cb-option.cb-create .cb-option-label")?.textContent ?? null;

      input.value = "none";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const noResultsRow = combo.listbox.querySelector(".cb-empty")?.textContent ?? null;

      return {
        createLabel,
        noResultsRow,
        statusText: combo.status.textContent,
        markupCount: document
          .querySelector(".cb-popover")
          .querySelectorAll("script, img, svg, [onload], [onerror], [onmouseover]").length,
        xss: window.__xss,
      };
    },
    { PAY_IMG, PAY_SVG },
  );

  expect(state.createLabel).toContain(PAY_SVG);
  expect(state.noResultsRow).toContain("none");
  expect(state.statusText).toContain("none");
  expect(state.markupCount).toBe(0);
  expect(state.xss).toBe(0);
  expect(errors).toEqual([]);
});

test("hostile input initial value is preserved as data, never executed or re-rendered", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const state = await page.evaluate(
    ({ PAY_IMG }) => {
      const input = document.getElementById("xss-city");
      input.value = PAY_IMG;
      const datalist = document.getElementById("xss-cities");
      for (const label of [PAY_IMG, "<script>window.__xss=1</script>"]) {
        const option = document.createElement("option");
        option.value = label;
        option.label = label;
        datalist.append(option);
      }
      const combo = Combobox.getOrCreateInstance(input);
      combo.search("", { show: true });
      return {
        value: input.value,
        xss: window.__xss,
        datalistMarkup: Array.from(datalist.options, (option) =>
          String(option.label || option.value).includes("<"),
        ),
        popoverCount: document.querySelectorAll(".cb-popover").length,
      };
    },
    { PAY_IMG },
  );

  expect(state.value).toBe(PAY_IMG);
  expect(state.xss).toBe(0);
  expect(state.datalistMarkup.every(Boolean)).toBe(true);
  expect(errors).toEqual([]);
});
