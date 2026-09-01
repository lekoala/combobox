import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";
const MODERN = "Modern Popover + Anchor support is required";

test.beforeEach(async ({ page }) => {
  await setup(page, FEATURES);
  test.skip(!(await modernSupported(page)), MODERN);
});

test("filter is role=combobox wired to a stable listbox id", async ({ page }) => {
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("capped")));

  const input = page.locator("#capped + .cb-control .cb-input");
  await expect(input).toHaveAttribute("role", "combobox");
  await expect(input).toHaveAttribute("aria-autocomplete", "list");
  await expect(input).toHaveAttribute("aria-expanded", "false");

  const controlsId = await input.getAttribute("aria-controls");
  const listbox = page.locator(`#${controlsId}`);
  await expect(listbox).toHaveAttribute("role", "listbox");
  expect(controlsId).toMatch(/^combobox-listbox-/);
});

test("multiple pickers are aria-multiselectable, single pickers are not", async ({ page }) => {
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("tags"));
    Combobox.getOrCreateInstance(document.getElementById("capped"));
  });

  const multiId = await page.locator("#tags + .cb-control .cb-input").getAttribute("aria-controls");
  const singleId = await page.locator("#capped + .cb-control .cb-input").getAttribute("aria-controls");
  await expect(page.locator(`#${multiId}`)).toHaveAttribute("aria-multiselectable", "true");
  expect(await page.locator(`#${singleId}`).getAttribute("aria-multiselectable")).toBeNull();
});

test("aria-expanded tracks the picker open state", async ({ page }) => {
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("capped")));

  const input = page.locator("#capped + .cb-control .cb-input");
  await input.click();
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await input.press("Escape");
  await expect(input).toHaveAttribute("aria-expanded", "false");
});

test("aria-activedescendant references an existing option and is cleared on close", async ({ page }) => {
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("capped")));

  const input = page.locator("#capped + .cb-control .cb-input");
  await input.fill("Th");
  await input.press("ArrowDown");

  const activeId = await input.getAttribute("aria-activedescendant");
  expect(activeId).not.toBeNull();
  const valid = await page.evaluate(
    (id) => !!document.getElementById(id)?.matches('[role="option"]'),
    activeId,
  );
  expect(valid).toBe(true);

  await input.press("Escape");
  await expect(input).not.toHaveAttribute("aria-activedescendant");
});

test("aria-activedescendant never references a row removed by a rerender", async ({ page }) => {
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("capped")));

  const input = page.locator("#capped + .cb-control .cb-input");
  await input.click();
  await input.press("ArrowDown");
  const activeId = await input.getAttribute("aria-activedescendant");
  expect(activeId).not.toBeNull();
  expect(await page.evaluate((id) => document.getElementById(id)?.textContent.trim(), activeId)).toBe("One");

  // The active row no longer matches the new query; the rerender must not leave
  // aria-activedescendant silently repointed at the recycled id of another row.
  await input.fill("Three");
  await expect(input).not.toHaveAttribute("aria-activedescendant");

  const state = await page.evaluate((old) => {
    const active = document.querySelector(".cb-popover [data-active]");
    const oldTarget = document.getElementById(old);
    return {
      activeRow: active?.textContent.trim() ?? null,
      oldRowStillActive: oldTarget?.getAttribute("data-active"),
      rows: Array.from(document.querySelectorAll(".cb-popover [role='option']")).map((row) =>
        row.textContent.trim(),
      ),
    };
  }, activeId);
  expect(state.activeRow).toBeNull();
  expect(state.oldRowStillActive).toBeNull();
  expect(state.rows).toEqual(["Three"]);
});

test("option rows reflect selection and disabled state", async ({ page }) => {
  await page.evaluate(() => {
    const select = document.getElementById("capped");
    select.options[2].disabled = true;
    Combobox.getOrCreateInstance(select);
  });

  const input = page.locator("#capped + .cb-control .cb-input");
  await input.click();
  await input.press("ArrowDown");
  const rows = page.locator(".cb-popover:visible [role='option']");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toHaveAttribute("aria-disabled", "true");
  await expect(rows.nth(1)).not.toHaveAttribute("aria-selected", "true");

  // Selecting a real option marks the rendered row aria-selected on reopen.
  await input.press("Enter");
  const state = await page.evaluate(() => {
    const combo = Combobox.getInstance(document.getElementById("capped"));
    combo.search("", { show: true });
    const row = Array.from(combo.listbox.querySelectorAll(".cb-option")).find((node) =>
      node.textContent.includes("One"),
    );
    return { ariaSelected: row?.getAttribute("aria-selected") ?? null };
  });
  expect(state.ariaSelected).toBe("true");
});

test("the status live region announces no-results and never executes markup", async ({ page }) => {
  await page.evaluate(() =>
    Combobox.getOrCreateInstance(document.getElementById("tags"), {
      messages: { noResults: "<b>rien</b>" },
    }),
  );

  const status = page.locator(".cb-status");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");

  const input = page.locator("#tags + .cb-control .cb-input");
  await input.fill("zzz-no-match");
  await expect(status).toHaveText("<b>rien</b>");
  await expect(status.locator("b")).toHaveCount(0);
});

test("dispose() tears down aria-controls and removes the listbox id", async ({ page }) => {
  await setup(page, "/test/fixtures/sources.html");

  // Case 1: an authored filter input — the input survives, aria-controls must not.
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("explicit")));
  const explicitBox = await page.locator("#explicit-filter").getAttribute("aria-controls");
  await expect(page.locator(`#${explicitBox}`)).toHaveAttribute("role", "listbox");

  await page.evaluate(() => Combobox.getInstance(document.getElementById("explicit")).dispose());
  await expect(page.locator("#explicit-filter")).not.toHaveAttribute("aria-controls");
  await expect(page.locator(`#${explicitBox}`)).toHaveCount(0);

  // Case 2: a generated filter input — the whole wrapper (including the input)
  // is removed, so its aria-controls reference dies with it.
  await page.evaluate(() => Combobox.getOrCreateInstance(document.getElementById("wrapped")));
  const wrappedBox = await page.locator("#wrapped + .cb-control .cb-input").getAttribute("aria-controls");
  expect(wrappedBox).toMatch(/^combobox-listbox-/);
  await page.evaluate(() => Combobox.getInstance(document.getElementById("wrapped")).dispose());
  await expect(page.locator(`#${wrappedBox}`)).toHaveCount(0);
  await expect(page.locator("#wrapped + .cb-control .cb-input")).toHaveCount(0);
});
