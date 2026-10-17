import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/test/fixtures/features.html");
  await page.addScriptTag({ url: "/dist/combobox.js" });
});

test("registered constructor configures future instances and preserves explicit overrides", async ({
  page,
}) => {
  const state = await page.evaluate(async () => {
    const ComboBox = customElements.get("combo-box");
    const original = ComboBox.getDefaultMessages();
    ComboBox.setDefaultChipClass("badge primary");
    ComboBox.setDefaultMessages({ noResults: "Custom" });
    const copy = ComboBox.getDefaultMessages();
    copy.noResults = "Modified copy";
    const make = async (classes) => {
      const box = document.createElement("combo-box");
      if (classes !== undefined) box.setAttribute("chip-class", classes);
      box.innerHTML = '<select name="tags" multiple><option value="a" selected>Alpha</option></select>';
      document.body.append(box);
      const combo = await box.whenReady();
      return {
        classes: combo.chips.firstElementChild.className,
        message: combo.options.messages.noResults,
        values: [...box.querySelector("select").selectedOptions].map((option) => option.value),
      };
    };
    const first = await make();
    const override = await make("custom");
    const empty = await make("");
    ComboBox.setDefaultChipClass("");
    ComboBox.setDefaultMessages(original);
    const reset = await make();
    return { first, override, empty, reset, loading: copy.loading, originalLoading: original.loading };
  });
  expect(state.first.classes).toBe("cb-chip badge primary");
  expect(state.override.classes).toBe("cb-chip custom");
  expect(state.empty.classes).toBe("cb-chip cb-chip-skin");
  expect(state.first.message).toBe("Custom");
  for (const instance of [state.first, state.override, state.empty, state.reset]) {
    expect(instance.values).toEqual(["a"]);
  }
  expect(state.loading).toBe(state.originalLoading);
  expect(state.reset.classes).toBe("cb-chip cb-chip-skin");
  expect(state.reset.message).toBe("No results");
});

for (const order of ["before", "after"]) {
  test(`classic chips retain structure with author CSS ${order} library CSS`, async ({ page }) => {
    const host =
      ".x-chip { flex: none; padding-inline-end: 1rem; gap: 1rem; border: 3px solid red; text-transform: uppercase; }";
    if (order === "before") await page.addStyleTag({ content: host });
    await page.addStyleTag({ url: "/dist/combobox.css" });
    if (order === "after") await page.addStyleTag({ content: host });
    const state = await page.evaluate(async () => {
      customElements.get("combo-box").setDefaultChipClass("x-chip");
      const box = document.createElement("combo-box");
      box.style.cssText = "display:block;width:180px";
      box.innerHTML =
        '<select name="tags" multiple><option value="a" selected>A very long label that must truncate in a narrow control</option><option value="b" selected disabled>Locked</option></select>';
      document.body.append(box);
      const combo = await box.whenReady();
      const chip = combo.chips.firstElementChild;
      const label = chip.querySelector(".cb-chip-label");
      const css = getComputedStyle(chip);
      const locked = getComputedStyle(combo.chips.lastElementChild);
      return {
        mode: combo.mode,
        flex: css.flex,
        gap: parseFloat(css.gap) / parseFloat(css.fontSize),
        end: parseFloat(css.paddingInlineEnd) / parseFloat(css.fontSize),
        lockedEnd: parseFloat(locked.paddingInlineEnd) / parseFloat(locked.fontSize),
        truncated: label.scrollWidth > label.clientWidth,
        overflow: getComputedStyle(label).textOverflow,
        border: css.borderTopWidth,
        transform: css.textTransform,
        values: [...box.querySelector("select").selectedOptions].map((option) => option.value),
      };
    });
    expect(state.mode).toBe("enhanced");
    expect(state.flex).toBe("0 1 auto");
    expect(state.gap).toBeCloseTo(0.2857, 3);
    expect(state.end).toBeCloseTo(0.1429, 3);
    expect(state.lockedEnd).toBeCloseTo(0.5714, 3);
    expect(state.truncated).toBe(true);
    expect(state.overflow).toBe("ellipsis");
    expect(state.border).toBe("3px");
    expect(state.transform).toBe("uppercase");
    expect(state.values).toEqual(["a", "b"]);
  });
}
