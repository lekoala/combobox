import { expect, test } from "@playwright/test";
import { setup } from "./helpers.js";

const FIXTURE = "/test/fixtures/elements.html";

test("keyboard activation avoids catalogue reads and restores authored markers on dispose", async ({
  page,
}) => {
  await setup(page, FIXTURE);
  const state = await page.evaluate(async () => {
    const select = document.createElement("select");
    select.multiple = true;
    select.innerHTML =
      '<option value="a" data-active-option="authored" data-filtered="original">Alpha</option><option value="b">Beta</option><option value="c">Gamma</option>';
    document.body.append(select);
    const combo = new Combobox(select, { autoselectFirst: false });
    combo.input.focus();
    await combo.search("");
    let reads = 0;
    for (const option of select.options) {
      const data = option.dataset;
      Object.defineProperty(option, "dataset", {
        configurable: true,
        get() {
          reads++;
          return data;
        },
      });
    }
    for (let index = 0; index < 2; index++) {
      combo.input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    }
    const active = Array.from(select.options, (option) => option.hasAttribute("data-active-option"));
    const descendant = document.getElementById(
      combo.input.getAttribute("aria-activedescendant"),
    )?.textContent;
    const navigationReads = reads;
    await combo.search("Gamma");
    const cleared = Array.from(select.options).every((option) => !option.hasAttribute("data-active-option"));
    combo.dispose();
    return {
      active,
      descendant,
      navigationReads,
      cleared,
      markers: Array.from(select.options, (option) => [
        option.getAttribute("data-active-option"),
        option.getAttribute("data-filtered"),
      ]),
      selected: Array.from(select.selectedOptions, (option) => option.value),
    };
  });
  expect(state.active).toEqual([false, true, false]);
  expect(state.descendant).toBe("Beta");
  expect(state.navigationReads).toBe(0);
  expect(state.cleared).toBe(true);
  expect(state.markers).toEqual([
    ["authored", "original"],
    [null, null],
    [null, null],
  ]);
  expect(state.selected).toEqual([]);
});

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

test("enhanced token creation skips disabled matches without creating duplicates", async ({ page }) => {
  await setup(page, FIXTURE);
  const state = await page.evaluate(async () => {
    const select = document.createElement("select");
    select.multiple = true;
    select.innerHTML =
      '<option value="be" disabled>Belgium</option><option value="be">Belgium</option><option value="blocked" disabled>Blocked</option>';
    document.body.append(select);
    const combo = new Combobox(select, { create: true, separators: [";"] });
    combo.input.value = "Belgium;Blocked;";
    combo.input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    return {
      text: combo.input.value,
      selected: Array.from(select.options, (option) => option.selected),
      count: select.options.length,
    };
  });
  expect(state).toEqual({ text: "Blocked;", selected: [false, true, false], count: 3 });
});
