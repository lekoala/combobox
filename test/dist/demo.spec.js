import { expect, test } from "@playwright/test";

const DEMO_HTML = "/demo/index.html";

test("demo page works over http(s) from the dist bundle in enhanced mode", async ({ page }) => {
  await page.goto(DEMO_HTML);

  const state = await page.evaluate(() => ({
    defined: typeof customElements.get("combo-box"),
    widgets: document.querySelectorAll("combo-box").length,
    enhancedModes: [...document.querySelectorAll("combo-box")].filter(
      (item) => item.combobox?.mode === "enhanced",
    ).length,
  }));

  expect(state.defined).toBe("function");
  expect(state.widgets).toBeGreaterThan(5);
  expect(state.enhancedModes).toBe(state.widgets);
  await expect(page.locator("#support-status")).toHaveText(/Enhanced mode active/);
});

test("demo page respects ?native=1 fallback from the dist bundle", async ({ page }) => {
  await page.goto(`${DEMO_HTML}?native=1`);

  const modes = await page.evaluate(() =>
    [...document.querySelectorAll("combo-box")].map((item) => item.combobox?.mode),
  );

  expect(modes.length).toBeGreaterThan(5);
  expect(modes.every((mode) => mode === "fallback")).toBe(true);
  await expect(page.locator("#support-status")).toHaveText(/Basic fallback forced/);
});

test("demo page works directly from file:// via the dist bundle", async ({ page }) => {
  const fileUrl = new URL("../../demo/index.html", import.meta.url).href;
  await page.goto(fileUrl);

  const state = await page.evaluate(() => ({
    defined: typeof customElements.get("combo-box"),
    upgraded: document.getElementById("doctor-widget").combobox != null,
    formUsable: document.getElementById("demo-form") !== null,
  }));

  expect(state.defined).toBe("function");
  expect(state.upgraded).toBe(true);
  expect(state.formUsable).toBe(true);
});
