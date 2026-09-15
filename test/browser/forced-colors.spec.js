import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";
const MODERN = "Modern Popover + floating placement support is required";

// Minimal high-contrast policy: we do not build a forced-colors theme, we only
// check the browser did not erase an essential signal (selected/check, active
// text, decorative caret, focus ring).
test.use({ forcedColors: "active" });

test.beforeEach(async ({ page }) => {
  await setup(page, FEATURES);
  await page.addStyleTag({ path: "src/combobox.css" });
  const emulated = await page.evaluate(() => matchMedia("(forced-colors: active)").matches);
  test.skip(!emulated, "Engine does not emulate forced-colors");
  test.skip(!(await modernSupported(page)), MODERN);
});

test("selected, active, check and caret keep an essential signal under forced colors", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const wrap = document.createElement("combo-box");
    wrap.setAttribute("toggle-selected", "");
    wrap.innerHTML =
      `<select multiple>` +
      `<option value="a" selected>Alpha</option>` +
      `<option value="b">Bravo</option>` +
      `</select>`;
    document.body.append(wrap);
    const combo = await wrap.whenReady();
    combo.show();

    const rows = [...combo.listbox.querySelectorAll(".cb-option")];
    const selected = rows.find((row) => row.getAttribute("aria-selected") === "true");
    const other = rows.find((row) => row.getAttribute("aria-selected") !== "true");
    other.setAttribute("data-active", "");

    const control = wrap.querySelector(".cb-control");
    const caret = getComputedStyle(control, "::after");
    return {
      activeText: getComputedStyle(other).color,
      activeBg: getComputedStyle(other).backgroundColor,
      selectedText: getComputedStyle(selected).color,
      selectedBg: getComputedStyle(selected).backgroundColor,
      selectedCheck: getComputedStyle(selected, "::after").backgroundColor,
      caretContent: caret.content,
      caretBorder: caret.borderBlockEndColor,
      controlBorder: getComputedStyle(control).borderTopColor,
    };
  });

  // The active cursor may lose its subtle fill, but never its text.
  expect(state.activeText).toBeTruthy();
  // Selected stays distinguishable from its own background.
  expect(state.selectedText).not.toBe(state.selectedBg);
  // The check mark remains painted.
  expect(state.selectedCheck).not.toBe("rgba(0, 0, 0, 0)");
  // The caret must not vanish without a replacement.
  expect(state.caretContent).toBe('""');
  expect(state.caretBorder).toBeTruthy();
  expect(state.controlBorder).toBeTruthy();
});

test("focused chip keeps a perceptible focus ring under forced colors", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const wrap = document.createElement("combo-box");
    wrap.innerHTML = `<select multiple><option value="a" selected>Alpha</option></select>`;
    document.body.append(wrap);
    await wrap.whenReady();
    const chip = wrap.querySelector(".cb-chip");
    chip.focus();
    const cs = getComputedStyle(chip);
    return {
      focused: document.activeElement === chip,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
    };
  });

  expect(state.focused).toBe(true);
  expect(state.outlineStyle).not.toBe("none");
  expect(parseFloat(state.outlineWidth)).toBeGreaterThan(0);
});
