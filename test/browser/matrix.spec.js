import { expect, test } from "@playwright/test";
import { setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";

test("auto mode selects enhanced when Popover is supported and native fallback otherwise", async ({
  page,
}) => {
  await setup(page, FEATURES);

  const state = await page.evaluate(() => {
    const select = document.getElementById("tags");
    const combo = Combobox.getOrCreateInstance(select);
    const sibling = select.nextElementSibling;
    return {
      supported: Combobox.supported,
      mode: combo.mode,
      hasControl: sibling?.classList?.contains("cb-control") ?? false,
      popoverCount: document.querySelectorAll(".cb-popover").length,
    };
  });

  expect(state.supported === (state.mode === "enhanced")).toBe(true);
  if (state.supported) {
    expect(state.hasControl).toBe(true);
    expect(state.popoverCount).toBe(1);
  } else {
    expect(state.hasControl).toBe(false);
    expect(state.popoverCount).toBe(0);
  }
});

test("forced fallback keeps the native control and the unnamed creatable input", async ({ page }) => {
  await setup(page, FEATURES);

  const state = await page.evaluate(() => {
    const select = document.getElementById("tags");
    const combo = Combobox.getOrCreateInstance(select, { mode: "fallback", create: true });
    const control = select.nextElementSibling;
    return {
      mode: combo.mode,
      visible: getComputedStyle(select).display !== "none",
      popoverCount: document.querySelectorAll(".cb-popover").length,
      fallbackCreate: control?.classList.contains("cb-fallback-create") ?? false,
      unnamed: control?.querySelector("input")?.hasAttribute("name") ?? true,
    };
  });

  expect(state.mode).toBe("fallback");
  expect(state.visible).toBe(true);
  expect(state.popoverCount).toBe(0);
  expect(state.fallbackCreate).toBe(true);
  expect(state.unnamed).toBe(false);
});

test("native submission reflects the selection in enhanced and fallback modes alike", async ({ page }) => {
  await setup(page, FEATURES);

  const state = await page.evaluate(() => {
    const form = document.getElementById("form");
    const combo = Combobox.getOrCreateInstance(document.getElementById("tags"));
    const before = new FormData(form).getAll("tags[]");
    combo.select("2");
    const after = new FormData(form).getAll("tags[]");
    return { mode: combo.mode, before, after };
  });

  expect(state.before).toEqual(["1"]);
  expect(state.after).toEqual(["1", "2"]);
});
