import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const POSITION = "/test/fixtures/position.html";
const DIALOG = "/test/fixtures/dialog.html";
const MODERN = "Modern Popover + floating placement support is required";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
});

test("auto resolves document + absolute for a normal-flow anchor", async ({ page }) => {
  await setup(page, POSITION);
  test.skip(!(await modernSupported(page)), MODERN);

  const state = await page.evaluate(async () => {
    // Bring the anchor mid-viewport first so the picker fits below it
    // (no flip) and the 4px distance is directly measurable.
    document.getElementById("flow").scrollIntoView({ block: "center" });
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const combo = Combobox.getOrCreateInstance(document.getElementById("flow"));
    combo.show();
    const anchor = combo.anchor || combo.control;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = combo.popover.getBoundingClientRect();
    const top = Number.parseFloat(combo.popover.style.top);
    const left = Number.parseFloat(combo.popover.style.left);
    return {
      space: combo.coordinateSpace,
      position: combo.popover.style.position,
      // Document coordinates: the written top is the viewport rect plus the
      // page scroll; the visible gap still honors the 4px distance.
      topMatches: Math.abs(top - window.scrollY - popoverRect.top) <= 2,
      leftMatches: Math.abs(left - window.scrollX - popoverRect.left) <= 2,
      gap: popoverRect.top - anchorRect.bottom,
    };
  });

  expect(state.space).toBe("document");
  expect(state.position).toBe("absolute");
  expect(state.topMatches).toBe(true);
  expect(state.leftMatches).toBe(true);
  expect(Math.abs(state.gap - 4)).toBeLessThan(3);
});

test("a forced viewport keeps fixed coordinates after scrolling", async ({ page }) => {
  await setup(page, POSITION);
  test.skip(!(await modernSupported(page)), MODERN);

  const state = await page.evaluate(async () => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("flow"), {
      coordinateSpace: "viewport",
    });
    document.getElementById("flow").scrollIntoView({ block: "center" });
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    combo.show();
    // Scroll with the picker open: fixed coordinates must track the
    // visible rect exactly, whatever the page scroll.
    window.scrollBy(0, 200);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const anchor = combo.anchor || combo.control;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = combo.popover.getBoundingClientRect();
    const top = Number.parseFloat(combo.popover.style.top);
    return {
      space: combo.coordinateSpace,
      position: combo.popover.style.position,
      // Viewport coordinates track the visible rect exactly, whatever the scroll.
      topMatches: Math.abs(top - popoverRect.top) <= 2,
      gap: popoverRect.top - anchorRect.bottom,
    };
  });

  expect(state.space).toBe("viewport");
  expect(state.position).toBe("fixed");
  expect(state.topMatches).toBe(true);
  expect(Math.abs(state.gap - 4)).toBeLessThan(3);
});

test("auto resolves viewport for sticky and fixed lineages, even unstuck", async ({ page }) => {
  await setup(page, POSITION);
  test.skip(!(await modernSupported(page)), MODERN);

  const state = await page.evaluate(async () => {
    const out = {};
    for (const id of ["sticky", "fixedsel"]) {
      const combo = Combobox.getOrCreateInstance(document.getElementById(id));
      combo.show();
      out[id] = {
        open: combo.isOpen(),
        space: combo.coordinateSpace,
        position: combo.popover.style.position,
      };
      combo.hide();
    }
    return out;
  });

  // No scroll: the sticky bar is not stuck yet, but sticky counts anyway
  // because it may stick mid-opening while the mode stays frozen.
  expect(state.sticky.open).toBe(true);
  expect(state.sticky.space).toBe("viewport");
  expect(state.sticky.position).toBe("fixed");
  expect(state.fixedsel.open).toBe(true);
  expect(state.fixedsel.space).toBe("viewport");
  expect(state.fixedsel.position).toBe("fixed");
});

test("a modal dialog resolves viewport under auto and honors a document override", async ({ page }) => {
  await setup(page, DIALOG);
  test.skip(!(await modernSupported(page)), MODERN);
  await page.click("#open");

  const state = await page.evaluate(async () => {
    const source = document.getElementById("fruit");
    const auto = Combobox.getOrCreateInstance(source);
    auto.input.focus();
    auto.show();
    const resolved = {
      modal: document.getElementById("dlg").matches(":modal"),
      open: auto.isOpen(),
      space: auto.coordinateSpace,
      position: auto.popover.style.position,
    };
    auto.hide();
    auto.dispose();

    const forced = Combobox.getOrCreateInstance(source, { coordinateSpace: "document" });
    forced.input.focus();
    forced.show();
    const overridden = {
      open: forced.isOpen(),
      space: forced.coordinateSpace,
      position: forced.popover.style.position,
    };
    forced.hide();
    return { resolved, overridden };
  });

  expect(state.resolved.modal).toBe(true);
  expect(state.resolved.open).toBe(true);
  expect(state.resolved.space).toBe("viewport");
  expect(state.resolved.position).toBe("fixed");
  expect(state.overridden.open).toBe(true);
  expect(state.overridden.space).toBe("document");
  expect(state.overridden.position).toBe("absolute");
});
