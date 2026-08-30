import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";

test.beforeEach(async ({ page }) => {
  await setup(page, FEATURES);
});

test("default tabSelect (false): Tab moves focus out without selecting", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("capped"));
  });

  const input = page.locator("#capped + .cb-control .cb-input");
  await input.fill("Th");
  await input.press("ArrowDown");
  await input.press("Tab");

  const state = await page.evaluate(() => {
    const select = document.getElementById("capped");
    return {
      value: select.value,
      focusLeft:
        document.activeElement !==
        document.getElementById("capped").nextElementSibling.querySelector(".cb-input"),
      pickerClosed: !document.querySelector(".cb-popover")?.matches(":popover-open"),
    };
  });
  expect(state.value).toBe("");
  expect(state.focusLeft).toBe(true);
  expect(state.pickerClosed).toBe(true);
});

test("tabSelect true: Tab commits the active option, keeps focus, hides, and fires native events once", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  await page.evaluate(() => {
    const select = document.getElementById("capped");
    window.__events = [];
    select.addEventListener("input", () => window.__events.push("input"));
    select.addEventListener("change", () => window.__events.push("change"));
    Combobox.getOrCreateInstance(select, { tabSelect: true });
  });

  const input = page.locator("#capped + .cb-control .cb-input");
  await input.fill("Th");
  await input.press("ArrowDown");
  await input.press("Tab");
  await page.waitForTimeout(40);

  const state = await page.evaluate(() => {
    const select = document.getElementById("capped");
    const filter = select.nextElementSibling.querySelector(".cb-input");
    return {
      value: select.value,
      label: filter.value,
      focusInControl: document.activeElement === filter,
      pickerOpen: document.querySelector(".cb-popover")?.matches(":popover-open") ?? false,
      events: window.__events,
    };
  });
  expect(state.value).toBe("3");
  expect(state.label).toBe("Three");
  expect(state.focusInControl).toBe(true);
  expect(state.pickerOpen).toBe(false);
  expect(state.events).toEqual(["input", "change"]);
});

test("tabSelect true: Tab with nothing to commit keeps native traversal", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  await page.evaluate(() => {
    const select = document.getElementById("capped");
    Combobox.getOrCreateInstance(select, { tabSelect: true });
  });

  const input = page.locator("#capped + .cb-control .cb-input");
  await input.fill("zzz");
  await input.press("Tab");

  const state = await page.evaluate(() => {
    const select = document.getElementById("capped");
    return {
      value: select.value,
      focusLeft: document.activeElement !== select.nextElementSibling.querySelector(".cb-input"),
    };
  });
  expect(state.value).toBe("");
  expect(state.focusLeft).toBe(true);
});

test("tabSelect true: preventDefault only when a commit is possible", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  const state = await page.evaluate(async () => {
    const select = document.getElementById("capped");

    const combo = Combobox.getOrCreateInstance(select, { tabSelect: true });
    const input = combo.input;

    // Nothing to commit: no active option (no results) -> Tab must not be blocked.
    await combo.search("zzz", { show: true });
    const noCommitPrevented = !input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );

    // Something to commit: active option exists -> Tab must be blocked and commit.
    await combo.search("Th", { show: true });
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    const commitPrevented = !input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );

    return {
      noCommitPrevented,
      commitPrevented,
      valueAfterCommit: select.value,
    };
  });

  expect(state.noCommitPrevented).toBe(false);
  expect(state.commitPrevented).toBe(true);
  expect(state.valueAfterCommit).toBe("3");
});

test("tabSelect true: IME composition never blocks or commits Tab", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  const state = await page.evaluate(async () => {
    const select = document.getElementById("capped");
    const combo = Combobox.getOrCreateInstance(select, { tabSelect: true });
    const input = combo.input;

    // Would-be commit state: an active option exists, so without the IME guard
    // this Tab would select. Composition must short-circuit before committing.
    input.value = "Th";
    await combo.search("Th", { show: true });
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    input.dispatchEvent(new CompositionEvent("compositionstart"));
    const prevented = !input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );

    return {
      prevented,
      value: select.value,
      hadActiveOption: combo.activeIndex >= 0,
      composing: combo.composing,
    };
  });

  expect(state.prevented).toBe(false);
  expect(state.value).toBe("");
  expect(state.hadActiveOption).toBe(true);
  expect(state.composing).toBe(true);
});
