import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const POSITION = "/test/fixtures/position.html";
const DIALOG = "/test/fixtures/dialog.html";
const MODERN = "Modern Popover + floating placement support is required";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
});

test("the default space is viewport + fixed for a normal-flow anchor", async ({ page }) => {
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
      option: combo.options.coordinateSpace,
      // The resolved space is observable through the written position style:
      // viewport space writes fixed, document space writes absolute.
      position: combo.popover.style.position,
      // Viewport coordinates track the visible rect exactly, whatever the scroll.
      topMatches: Math.abs(top - popoverRect.top) <= 2,
      leftMatches: Math.abs(left - popoverRect.left) <= 2,
      gap: popoverRect.top - anchorRect.bottom,
    };
  });

  expect(state.option).toBe("viewport");
  expect(state.position).toBe("fixed");
  expect(state.topMatches).toBe(true);
  expect(state.leftMatches).toBe(true);
  expect(Math.abs(state.gap - 4)).toBeLessThan(3);
});

test("an invalid coordinateSpace falls back to viewport with an observable effect", async ({ page }) => {
  await setup(page, POSITION);
  test.skip(!(await modernSupported(page)), MODERN);

  const state = await page.evaluate(async () => {
    document.getElementById("flow").scrollIntoView({ block: "center" });
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const out = {};
    for (const value of ["banana", "auto"]) {
      const host = document.createElement("div");
      host.innerHTML = `<select><option value="">Choose</option><option value="1">One</option></select>`;
      document.body.append(host);
      const combo = Combobox.getOrCreateInstance(host.querySelector("select"), {
        coordinateSpace: value,
      });
      combo.show();
      out[String(value)] = {
        option: combo.options.coordinateSpace,
        position: combo.popover.style.position,
      };
      combo.hide();
      combo.dispose();
      host.remove();
    }
    return out;
  });

  // Garbage (including the removed "auto") normalizes to viewport at
  // construction, and the fallback is observable, not just stored.
  for (const value of ["banana", "auto"]) {
    expect(state[value].option).toBe("viewport");
    expect(state[value].position).toBe("fixed");
  }
});

test("an explicit document space writes absolute coordinates", async ({ page }) => {
  await setup(page, POSITION);
  test.skip(!(await modernSupported(page)), MODERN);

  const state = await page.evaluate(async () => {
    document.getElementById("flow").scrollIntoView({ block: "center" });
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const combo = Combobox.getOrCreateInstance(document.getElementById("flow"), {
      coordinateSpace: "document",
    });
    combo.show();
    const popoverRect = combo.popover.getBoundingClientRect();
    const top = Number.parseFloat(combo.popover.style.top);
    const left = Number.parseFloat(combo.popover.style.left);
    const anchor = combo.anchor || combo.control;
    const anchorRect = anchor.getBoundingClientRect();
    return {
      position: combo.popover.style.position,
      // Document coordinates: the written top is the viewport rect plus the
      // page scroll; the visible gap still honors the 4px distance.
      topMatches: Math.abs(top - window.scrollY - popoverRect.top) <= 2,
      leftMatches: Math.abs(left - window.scrollX - popoverRect.left) <= 2,
      gap: popoverRect.top - anchorRect.bottom,
    };
  });

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
      position: combo.popover.style.position,
      // Viewport coordinates track the visible rect exactly, whatever the scroll.
      topMatches: Math.abs(top - popoverRect.top) <= 2,
      gap: popoverRect.top - anchorRect.bottom,
    };
  });

  expect(state.position).toBe("fixed");
  expect(state.topMatches).toBe(true);
  expect(Math.abs(state.gap - 4)).toBeLessThan(3);
});

test("no layout inference: sticky, fixed and dialog anchors default to viewport", async ({ page }) => {
  await setup(page, POSITION);
  test.skip(!(await modernSupported(page)), MODERN);

  const state = await page.evaluate(async () => {
    const out = {};
    for (const id of ["sticky", "fixedsel", "flow"]) {
      const combo = Combobox.getOrCreateInstance(document.getElementById(id));
      combo.show();
      out[id] = {
        open: combo.isOpen(),
        option: combo.options.coordinateSpace,
        position: combo.popover.style.position,
      };
      combo.hide();
    }
    return out;
  });

  // Whatever the anchor lineage, the default space is viewport + fixed.
  // Document coordinates are an explicit opt-in, never inferred.
  for (const id of ["sticky", "fixedsel", "flow"]) {
    expect(state[id].open).toBe(true);
    expect(state[id].option).toBe("viewport");
    expect(state[id].position).toBe("fixed");
  }
});

test("a modal dialog defaults to viewport; document stays an explicit override", async ({ page }) => {
  await setup(page, DIALOG);
  test.skip(!(await modernSupported(page)), MODERN);
  await page.click("#open");

  const state = await page.evaluate(async () => {
    const source = document.getElementById("fruit");
    const def = Combobox.getOrCreateInstance(source);
    def.input.focus();
    def.show();
    const resolved = {
      modal: document.getElementById("dlg").matches(":modal"),
      open: def.isOpen(),
      position: def.popover.style.position,
    };
    def.hide();
    def.dispose();

    const forced = Combobox.getOrCreateInstance(source, { coordinateSpace: "document" });
    forced.input.focus();
    forced.show();
    const overridden = {
      open: forced.isOpen(),
      position: forced.popover.style.position,
    };
    forced.hide();
    return { resolved, overridden };
  });

  expect(state.resolved.modal).toBe(true);
  expect(state.resolved.open).toBe(true);
  expect(state.resolved.position).toBe("fixed");
  expect(state.overridden.open).toBe(true);
  expect(state.overridden.position).toBe("absolute");
});

test("the space is frozen per opening: a change while open applies to the next opening", async ({ page }) => {
  await setup(page, POSITION);
  test.skip(!(await modernSupported(page)), MODERN);

  const state = await page.evaluate(async () => {
    document.getElementById("flow").scrollIntoView({ block: "center" });
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const combo = Combobox.getOrCreateInstance(document.getElementById("flow"));
    combo.show();
    const before = combo.popover.style.position;
    // Mutate mid-opening: the open picker must not drift.
    combo.options.coordinateSpace = "document";
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const during = combo.popover.style.position;
    combo.hide();
    combo.show();
    const next = combo.popover.style.position;
    combo.hide();
    return { before, during, next };
  });

  expect(state.before).toBe("fixed");
  expect(state.during).toBe("fixed");
  expect(state.next).toBe("absolute");
});

test("the popover width follows the custom anchor under the default space", async ({ page }) => {
  await setup(page, POSITION);
  test.skip(!(await modernSupported(page)), MODERN);

  const state = await page.evaluate(async () => {
    document.getElementById("anchored-shell").scrollIntoView({ block: "center" });
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const combo = Combobox.getOrCreateInstance(document.getElementById("anchored"), {
      anchor: document.getElementById("anchored-shell"),
    });
    combo.show();
    const shellWidth = document.getElementById("anchored-shell").getBoundingClientRect().width;
    const controlWidth = document.getElementById("anchored").nextElementSibling.getBoundingClientRect().width;
    return {
      open: combo.isOpen(),
      position: combo.popover.style.position,
      popoverWidth: combo.popover.getBoundingClientRect().width,
      shellWidth,
      // The padded shell is wider than the control it contains.
      shellWider: shellWidth - controlWidth > 40,
    };
  });

  expect(state.shellWider).toBe(true);
  expect(state.open).toBe(true);
  expect(state.position).toBe("fixed");
  expect(Math.abs(state.popoverWidth - state.shellWidth)).toBeLessThan(3);
});
