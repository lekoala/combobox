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

test("query-builder demo turns a suggestion into application state", async ({ page }) => {
  await page.goto("/demo/query-builder.html");

  const input = page.locator("#query");
  await input.fill("Martin");
  await page.locator(".cb-popover:visible .cb-option", { hasText: "Nom" }).click();

  await expect(page.locator(".query-token-field .query-token-key-label")).toHaveText("Nom");
  await expect(page.locator(".query-token-field .query-token-value")).toHaveText("Martin");
  await expect(input).toHaveValue("");
  const state = await page.locator("#filters-value").inputValue();
  expect(JSON.parse(state)).toEqual({
    scope: "people",
    filters: [{ field: "name", label: "Nom", query: "Martin" }],
    groupBy: null,
    favorite: false,
  });

  const tokenWidth = await page
    .locator(".query-token-field")
    .evaluate((token) => token.getBoundingClientRect().width);
  await page.locator(".query-token-field").hover();
  const hoveredWidth = await page
    .locator(".query-token-field")
    .evaluate((token) => token.getBoundingClientRect().width);
  expect(Math.abs(hoveredWidth - tokenWidth)).toBeLessThan(0.5);
  await page.locator(".query-token-edit").click();
  await page.locator("#filter-dialog-value").fill("Dubois");
  await page.locator("#filter-dialog-save").click();
  await expect(page.locator(".query-token-field .query-token-value")).toHaveText("Dubois");

  await page.locator("#picker-toggle").click();
  await page.locator('#query-menu button[data-group="salesperson"]').click();
  await expect(page.locator(".query-token-group .query-token-value")).toHaveText("Vendeur");
  const colors = await page.evaluate(() => ({
    filter: getComputedStyle(document.querySelector(".query-token-field .query-token-key")).backgroundColor,
    group: getComputedStyle(document.querySelector(".query-token-group .query-token-key")).backgroundColor,
  }));
  expect(colors.filter).not.toBe(colors.group);
});
