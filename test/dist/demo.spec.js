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

test("directory demo renders rich rows and cancels navigate activations without native side effects", async ({
  page,
}) => {
  await page.goto("/demo/directory-picker.html");
  const input = page.locator("#member + .cb-control .cb-input");

  await input.fill("denis");
  const rows = page.locator(".cb-popover:visible .directory-result");
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator(".directory-avatar")).toHaveText("DL");
  await expect(rows.first()).toContainText("Designer · Platform");
  await expect(rows.first().locator(".directory-hint")).toHaveText("Profile →");

  // Keyboard activation of a navigate row: same beforeselect seam as click.
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page.locator("#directory-status")).toHaveText(/Would navigate to \/people\/denis-leonard/);
  await expect(page.locator("#member")).toHaveValue("");
  expect(await page.locator("#member option").count()).toBe(1);

  // Click parity: reload, then click the navigate row.
  await page.goto("/demo/directory-picker.html");
  const clicked = page.locator("#member + .cb-control .cb-input");
  await clicked.fill("denis");
  await page.locator(".cb-popover:visible .cb-option", { hasText: "Denis Léonard" }).first().click();
  await expect(page.locator("#directory-status")).toHaveText(/Would navigate to \/people\/denis-leonard/);
  await expect(page.locator("#member")).toHaveValue("");
  expect(await page.locator("#member option").count()).toBe(1);
});

test("directory demo selects a normal row and keeps hostile labels as text", async ({ page }) => {
  await page.goto("/demo/directory-picker.html");
  const input = page.locator("#member + .cb-control .cb-input");

  await input.fill("fredy");
  await page.locator(".cb-popover:visible .cb-option", { hasText: "Fredy Denis" }).click();
  await expect(page.locator("#member")).toHaveValue("84");
  await expect(page.locator("#directory-value")).toHaveText(/84.*Fredy Denis/);

  await input.fill("<img");
  const hostile = page.locator(".cb-popover:visible .cb-option", { hasText: "<img" });
  await expect(hostile).toHaveCount(1);
  expect(await hostile.locator("img").count()).toBe(0);
});

test("place demo gates short queries, keeps results transient, then materializes one option", async ({
  page,
}) => {
  await page.goto("/demo/place-picker.html");
  const input = page.locator("#place + .cb-control .cb-input");

  await input.fill("s");
  await expect(page.locator(".cb-popover:visible .place-result")).toHaveCount(0);
  // Below the threshold no search runs: the empty row names the wait
  // instead of reporting a miss.
  await expect(page.locator(".cb-popover:visible .cb-empty")).toHaveText(
    "Type at least 2 characters to search…",
  );
  expect(await page.locator("#place option").count()).toBe(1);

  await input.fill("saint");
  const rows = page.locator(".cb-popover:visible .place-result");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().locator(".place-result-label")).toHaveText("Saint-Gilles");
  await expect(rows.first().locator(".place-result-secondary")).toHaveText("Belgium");
  // Transient: the catalogue is untouched until a selection happens.
  expect(await page.locator("#place option").count()).toBe(1);

  await rows.first().click();
  await expect(page.locator("#place")).toHaveValue("place-1");
  await expect(page.locator("#place-value")).toHaveText(/place-1.*Saint-Gilles/);
  await expect(page.locator("#place-status")).toHaveText(/secondary: Belgium/);
  expect(await page.locator("#place option").count()).toBe(2);
});

test("place demo renders hostile labels as text", async ({ page }) => {
  await page.goto("/demo/place-picker.html");
  const input = page.locator("#place + .cb-control .cb-input");

  await input.fill("xss");
  const hostile = page.locator(".cb-popover:visible .cb-option", { hasText: "Saint-XSS" });
  await expect(hostile).toHaveCount(1);
  await expect(hostile.locator(".place-result-label")).toHaveText("<b>Saint-XSS</b>");
  expect(await hostile.locator("b").count()).toBe(0);
});

test("empty rows distinguish waiting-for-input from genuine misses", async ({ page }) => {
  await page.goto("/demo/place-picker.html");
  const place = page.locator("#place + .cb-control .cb-input");
  await place.fill("zzz-no-such-place");
  await expect(page.locator(".cb-popover:visible .cb-empty")).toHaveText('No places for "zzz-no-such-place"');

  await page.goto("/demo/directory-picker.html");
  const member = page.locator("#member + .cb-control .cb-input");
  await member.click();
  await expect(page.locator(".cb-popover:visible .cb-empty")).toHaveText("Type to search the directory…");
  await member.fill("zzz-no-such-member");
  await expect(page.locator(".cb-popover:visible .cb-empty")).toHaveText(
    'No members for "zzz-no-such-member"',
  );
});

test("position demo measures the sticky mismatch sequentially, one picker at a time", async ({ page }) => {
  await page.goto("/demo/position-modes.html");
  await page.setViewportSize({ width: 900, height: 720 });

  const EXPECTED_GAP = 4;
  const state = await page.evaluate(async () => {
    const frames = (count) =>
      new Promise((resolve) => {
        const tick = (remaining) => {
          if (remaining <= 1) resolve();
          else requestAnimationFrame(() => tick(remaining - 1));
        };
        requestAnimationFrame(() => tick(count));
      });
    const gapOf = (combo) => {
      const anchor = combo.anchor || combo.control;
      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = combo.popover.getBoundingClientRect();
      return popoverRect.top - anchorRect.bottom;
    };
    const out = {};
    for (const id of ["bad-widget", "good-widget"]) {
      const box = document.getElementById(id);
      const combo = await box.whenReady();
      window.scrollTo(0, document.getElementById("toolbar").offsetTop);
      await frames(2);
      const opened = combo.show();
      await frames(1);
      window.scrollBy(0, 300);
      const immediate = gapOf(combo); // same task: no correction has run yet
      await frames(2);
      const settled = gapOf(combo);
      combo.hide();
      out[id] = {
        opened,
        space: combo.coordinateSpace,
        position: combo.popover.style.position,
        immediate,
        settled,
      };
    }
    return { ...out, stuck: document.getElementById("toolbar").getBoundingClientRect().top <= 1 };
  });

  expect(state.stuck).toBe(true);
  expect(state["bad-widget"].opened).toBe(true);
  expect(state["good-widget"].opened).toBe(true);
  expect(state["bad-widget"].space).toBe("document");
  expect(state["bad-widget"].position).toBe("absolute");
  expect(state["good-widget"].space).toBe("viewport");
  expect(state["good-widget"].position).toBe("fixed");

  // The forced-document picker trails the stuck toolbar until the next
  // correction; the auto one never detaches. Both converge afterwards.
  expect(Math.abs(state["bad-widget"].immediate - EXPECTED_GAP)).toBeGreaterThan(100);
  expect(Math.abs(state["good-widget"].immediate - EXPECTED_GAP)).toBeLessThan(2);
  expect(Math.abs(state["bad-widget"].settled - EXPECTED_GAP)).toBeLessThan(2);
  expect(Math.abs(state["good-widget"].settled - EXPECTED_GAP)).toBeLessThan(2);

  // The demo button runs the same protocol and renders both verdicts,
  // leaving no picker open behind.
  await page.locator("#run").click();
  await expect(page.locator("#bad-result")).toHaveText(/temporarily detached/);
  await expect(page.locator("#good-result")).toHaveText(/correct coordinate model/);
  await expect(page.locator(".cb-popover:visible")).toHaveCount(0);
});
