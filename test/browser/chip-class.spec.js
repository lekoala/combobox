import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await setup(page, "/test/fixtures/features.html");
  test.skip(!(await modernSupported(page)), "Modern Popover support is required");
});

for (const order of ["before", "after"]) {
  test(`author chip skin works with host CSS loaded ${order} library CSS`, async ({ page }) => {
    const host = ".x-chip { border: 3px solid red; text-transform: uppercase; }";
    if (order === "before") await page.addStyleTag({ content: host });
    await page.addStyleTag({ path: "src/combobox.css" });
    if (order === "after") await page.addStyleTag({ content: host });
    const styles = await page.evaluate(() => {
      const combo = new Combobox(document.getElementById("tags"), { chipClass: "  x-chip\t badge  " });
      const chip = combo.chips.firstElementChild;
      const cs = getComputedStyle(chip);
      return {
        classes: [...chip.classList],
        border: cs.borderTopWidth,
        borderColor: cs.borderTopColor,
        transform: cs.textTransform,
        background: cs.backgroundColor,
        radius: cs.borderTopLeftRadius,
        remove: !!chip.querySelector(".cb-chip-remove"),
      };
    });
    expect(styles).toEqual({
      classes: ["cb-chip", "x-chip", "badge"],
      border: "3px",
      borderColor: "rgb(255, 0, 0)",
      transform: "uppercase",
      background: "rgba(0, 0, 0, 0)",
      radius: "0px",
      remove: true,
    });
  });
}

test("author classes survive value and catalogue updates, reset and disposal", async ({ page }) => {
  const states = await page.evaluate(async () => {
    const source = document.getElementById("tags");
    source.className = "authored";
    const attributes = () =>
      Object.fromEntries([...source.attributes].map((attr) => [attr.name, attr.value]));
    const original = attributes();
    const combo = new Combobox(source, { chipClass: "badge primary" });
    const states = [];
    const record = () =>
      states.push({
        values: [...source.selectedOptions].map((option) => option.value),
        classes: [...combo.chips.children].map((chip) => chip.className),
      });
    record();
    await combo.select("2");
    record();
    await combo.remove("1");
    record();
    combo.sync();
    record();
    source.form.reset();
    await new Promise((resolve) => setTimeout(resolve, 20));
    record();
    // A selected authored option keeps its identity and reset baseline when
    // the catalogue is replaced; unselected absent options may be dropped.
    combo.setOptions([{ value: "4", label: "Cherry" }]);
    record();
    source.form.reset();
    await new Promise((resolve) => setTimeout(resolve, 20));
    record();
    combo.dispose();
    return {
      states,
      original,
      restored: attributes(),
      controls: source.parentElement.querySelectorAll(".cb-control").length,
    };
  });
  expect(states.states.map((state) => state.values)).toEqual([
    ["1"],
    ["1", "2"],
    ["2"],
    ["2"],
    ["1"],
    ["1"],
    ["1"],
  ]);
  for (const state of states.states) {
    expect(state.classes).toEqual(state.values.map(() => "cb-chip badge primary"));
  }
  expect(states.restored).toEqual(states.original);
  expect(states.controls).toBe(0);
});

test("global default is a construction snapshot and explicit empty classes restore the skin", async ({
  page,
}) => {
  const state = await page.evaluate(() => {
    const make = (options = {}) => {
      const select = document.createElement("select");
      select.multiple = true;
      select.append(new Option("Alpha", "a", true, true));
      document.body.append(select);
      return new Combobox(select, options);
    };
    Combobox.setDefaultChipClass("badge primary");
    const first = make();
    const override = make({ chipClass: "custom" });
    const empty = make({ chipClass: " \t " });
    Combobox.setDefaultChipClass("");
    first.sync();
    return [first, override, empty, make()].map((combo) => combo.chips.firstElementChild.className);
  });
  expect(state).toEqual([
    "cb-chip badge primary",
    "cb-chip custom",
    "cb-chip cb-chip-skin",
    "cb-chip cb-chip-skin",
  ]);
});

test("fallback keeps the native select and creates no chips", async ({ page }) => {
  const state = await page.evaluate(() => {
    const source = document.getElementById("tags");
    const original = source.outerHTML;
    const combo = new Combobox(source, { mode: "fallback", chipClass: "badge" });
    const chips = combo.chips;
    combo.dispose();
    return { chips, restored: source.outerHTML === original };
  });
  expect(state).toEqual({ chips: null, restored: true });
});
