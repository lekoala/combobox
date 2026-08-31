import { expect, test } from "@playwright/test";

const DIST_HTML = "/test/fixtures/dist.html";

test("dist bundle is a self-contained classic script: no imports, exports or globals", async ({
  request,
}) => {
  const response = await request.get("/dist/combobox.js");
  const source = await response.text();
  const check = {
    hasImportStatement: /(^|\s)import\s/m.test(source) || /import\s*\(/m.test(source),
    hasExportStatement: /^export\s/m.test(source),
    hasHelpersGlobal: source.includes("ComboboxHelpers"),
    hasWindowGlobals: /window\.(?:Combobox|ComboBoxElement|defineCombobox|LeKoalaCombobox)/.test(source),
    registers: source.includes("defineCombobox()"),
    bundlesEngine: source.includes("getOrCreateInstance"),
    bundlesWrapper: source.includes("ComboBoxElement"),
  };

  expect(response.ok()).toBe(true);
  expect(check.hasImportStatement).toBe(false);
  expect(check.hasExportStatement).toBe(false);
  expect(check.hasHelpersGlobal).toBe(false);
  expect(check.hasWindowGlobals).toBe(false);
  expect(check.registers).toBe(true);
  expect(check.bundlesEngine).toBe(true);
  expect(check.bundlesWrapper).toBe(true);
});

test("dist bundle self-registers combo-box, upgrades markup and leaks no globals", async ({ page }) => {
  await page.goto(DIST_HTML);

  const state = await page.evaluate(() => ({
    defined: typeof customElements.get("combo-box"),
    upgraded: document.querySelector("combo-box").combobox != null,
    windowCombobox: typeof window.Combobox,
    windowHelpers: typeof window.ComboboxHelpers,
  }));

  expect(state.defined).toBe("function");
  expect(state.upgraded).toBe(true);
  expect(state.windowCombobox).toBe("undefined");
  expect(state.windowHelpers).toBe("undefined");
});

test("dist bundle works from a file:// page (classic script, no module support needed)", async ({ page }) => {
  const fileUrl = new URL("../fixtures/dist.html", import.meta.url).href;
  await page.goto(fileUrl);

  const state = await page.evaluate(() => ({
    defined: typeof customElements.get("combo-box"),
    upgraded: document.querySelector("combo-box").combobox != null,
    selectUsable: document.getElementById("smoke-select") !== null,
  }));

  expect(state.defined).toBe("function");
  expect(state.upgraded).toBe(true);
  expect(state.selectUsable).toBe(true);
});
