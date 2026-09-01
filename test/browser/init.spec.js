import { expect, test } from "@playwright/test";
import { setup } from "./helpers.js";

const FEATURES = "/test/fixtures/features.html";

test.beforeEach(async ({ page }) => {
  await setup(page, FEATURES);
});

test("init(selector) enhances and returns one instance per source", async ({ page }) => {
  const state = await page.evaluate(() => {
    const first = Combobox.init("select");
    // Document order: twinlabels, mixedclear, tags, overlimit, dupes, capped.
    const ids = ["twinlabels", "mixedclear", "tags", "overlimit", "dupes", "capped"].map((id) =>
      Combobox.getInstance(document.getElementById(id)),
    );
    return {
      count: first.length,
      allRegistered: ids.every((instance, index) => instance === first[index]),
    };
  });
  expect(state.count).toBe(6);
  expect(state.allRegistered).toBe(true);
});

test("init(root, selector) scopes discovery to the root and applies options", async ({ page }) => {
  const state = await page.evaluate(() => {
    const form = document.querySelector("#form");
    const instances = Combobox.init(form, "select", { maxItems: 2 });
    return {
      count: instances.length,
      maxItems: instances.every((instance) => instance.options.maxItems === 2),
      scoped: instances.every((instance) => form.contains(instance.source)),
    };
  });
  expect(state.count).toBe(6);
  expect(state.maxItems).toBe(true);
  expect(state.scoped).toBe(true);
});

test("init is idempotent and never reconfigures an existing instance", async ({ page }) => {
  const state = await page.evaluate(() => {
    const select = document.getElementById("tags");
    const first = Combobox.init("select", { maxItems: 3 });
    const again = Combobox.init([select], { maxItems: 10 });
    const bySelector = Combobox.init(select.parentElement, "#tags");
    const tags = Combobox.getInstance(select);
    return {
      sameInstance: again[0] === first.find((instance) => instance.source === select),
      notReconfigured: tags.options.maxItems === 3,
      bySelectorSame: bySelector[0] === tags,
    };
  });
  expect(state.sameInstance).toBe(true);
  expect(state.notReconfigured).toBe(true);
  expect(state.bySelectorSame).toBe(true);
});

test("init accepts a NodeList and ignores unsupported elements", async ({ page }) => {
  const state = await page.evaluate(() => {
    const fromNodeList = Combobox.init(document.querySelectorAll("select"));
    const mixed = Combobox.init([document.querySelector("#form"), document.getElementById("capped")]);
    return {
      nodeListCount: fromNodeList.length,
      mixedCount: mixed.length,
      mixedIsEnhancer: mixed[0] instanceof Combobox,
    };
  });
  expect(state.nodeListCount).toBe(6);
  expect(state.mixedCount).toBe(1);
  expect(state.mixedIsEnhancer).toBe(true);
});

test("init() without an explicit selector discovers nothing; unknown selectors degrade safely", async ({
  page,
}) => {
  const state = await page.evaluate(() => {
    const defaults = Combobox.init();
    // An element root alone is not a discovery scope: a selector is required.
    const rootOnly = Combobox.init(document.querySelector("#form"));
    const rootWithOptions = Combobox.init(document.querySelector("#form"), { maxItems: 1 });
    const none = Combobox.init("#does-not-exist");
    return {
      defaults: defaults.length,
      rootOnly: rootOnly.length,
      rootWithOptions: rootWithOptions.length,
      none: none.length,
    };
  });
  expect(state.defaults).toBe(0);
  expect(state.rootOnly).toBe(0);
  expect(state.rootWithOptions).toBe(0);
  expect(state.none).toBe(0);
});

test("init() handles dozens of controls and dispose() cleans up fully", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.evaluate(() => {
    const form = document.getElementById("form");
    for (let i = 0; i < 36; i++) {
      const select = document.createElement("select");
      select.className = "cb-many";
      select.name = `many-${i}[]`;
      select.multiple = true;
      select.innerHTML = `<option value="a${i}">A ${i}</option><option value="b${i}" selected>B ${i}</option>`;
      form.append(select);
    }
  });

  const initialized = await page.evaluate(() => {
    const form = document.getElementById("form");
    const instances = Combobox.init(form, "select.cb-many");
    const allEnhanced = instances.every((instance) => instance.mode === "enhanced");
    const allRegistered = Array.from(document.querySelectorAll("select.cb-many")).every(
      (select) => Combobox.getInstance(select) !== null,
    );
    return {
      count: instances.length,
      allEnhanced,
      allRegistered,
      controls: document.querySelectorAll(".cb-control").length,
    };
  });
  expect(initialized.count).toBe(36);
  expect(initialized.allEnhanced).toBe(true);
  expect(initialized.allRegistered).toBe(true);
  expect(initialized.controls).toBe(36);

  const disposed = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll("select.cb-many"));
    for (const select of selects) Combobox.getInstance(select).dispose();
    return {
      controls: document.querySelectorAll(".cb-control").length,
      popovers: document.querySelectorAll(".cb-popover").length,
      live: selects.filter((select) => Combobox.getInstance(select) !== null).length,
    };
  });
  expect(disposed.controls).toBe(0);
  expect(disposed.popovers).toBe(0);
  expect(disposed.live).toBe(0);
  expect(pageErrors).toEqual([]);
});
