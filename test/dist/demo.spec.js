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
  await page.locator(".cb-popover:visible .cb-option", { hasText: "Name" }).click();

  await expect(page.locator(".query-token-field .query-token-key-label")).toHaveText("Name");
  await expect(page.locator(".query-token-field .query-token-value")).toHaveText("Martin");
  await expect(input).toHaveValue("");
  const state = await page.locator("#filters-value").inputValue();
  expect(JSON.parse(state)).toEqual({
    scope: "people",
    filters: [{ field: "name", label: "Name", query: "Martin" }],
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
  await expect(page.locator(".query-token-group .query-token-value")).toHaveText("Salesperson");
  const colors = await page.evaluate(() => ({
    filter: getComputedStyle(document.querySelector(".query-token-field .query-token-key")).backgroundColor,
    group: getComputedStyle(document.querySelector(".query-token-group .query-token-key")).backgroundColor,
  }));
  expect(colors.filter).not.toBe(colors.group);
});

test("service-options demo renders gated options with metadata and native value", async ({ page }) => {
  await page.goto("/demo/service-options.html");

  // Rich rows: duration pills and inline reasons, text-built by render.option.
  const input = page.locator("#service-option + .cb-control .cb-input");
  await input.click();
  const pills = page.locator(".cb-popover:visible .service-option-duration");
  await expect(pills).toHaveCount(4);
  await expect(pills.nth(0)).toHaveText("15 min");
  await expect(page.locator(".cb-popover:visible .service-option-reason")).toHaveCount(2);

  // Gated rows: native disabled semantics surfaced, title propagated by the
  // core, data-tooltip markup produced by the application renderer. The Actual
  // tooltip runtime itself is not under test here.
  const gated = page.locator(".cb-popover:visible .cb-option[aria-disabled='true']");
  await expect(gated).toHaveCount(2);
  await expect(gated.first()).toHaveAttribute("title", /Reserved for members/);
  const tooltipRow = page.locator(
    ".cb-popover:visible .cb-option[aria-disabled='true'] .service-option[data-tooltip]",
  );
  await expect(tooltipRow).toHaveCount(2);

  // Keyboard skips disabled rows: first ArrowDown lands on Standard session.
  await input.press("ArrowDown");
  const activeId = await input.getAttribute("aria-activedescendant");
  const activeText = await page.locator(`#${activeId}`).innerText();
  expect(activeText).toContain("Standard session");

  // Selecting commits the native value exactly once.
  await input.press("Enter");
  await expect(page.locator("#service-option")).toHaveValue("standard-45");
  await expect(page.locator("#service-option-status")).toHaveText(/standard-45/);
});

test("Actual CSS bridge keeps SVG chip removal visible and functional", async ({ page }) => {
  await page.goto("/demo/actual-css.html");

  const remove = page.locator("#skills + .cb-control .cb-chip-remove").first();
  await expect(remove).toBeVisible();
  const geometry = await remove.evaluate((button) => ({
    button: button.getBoundingClientRect().width,
    icon: button.querySelector("svg").getBoundingClientRect().width,
  }));
  expect(geometry.button).toBeGreaterThan(0);
  expect(geometry.icon).toBeGreaterThan(0);

  await remove.click();
  await expect(page.locator("#skills + .cb-control .cb-chip")).toHaveCount(2);
});
