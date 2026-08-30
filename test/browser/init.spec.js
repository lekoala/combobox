import { expect, test } from "@playwright/test";

const FEATURES = "/test/fixtures/features.html";

test.beforeEach(async ({ page }) => {
  await page.goto(FEATURES);
});

test("init(selector) enhances and returns one instance per source", async ({ page }) => {
  const state = await page.evaluate(() => {
    const first = Combobox.init("select");
    const ids = ["tags", "overlimit", "dupes", "capped"].map((id) =>
      Combobox.getInstance(document.getElementById(id)),
    );
    return {
      count: first.length,
      allRegistered: ids.every((instance, index) => instance === first[index]),
    };
  });
  expect(state.count).toBe(4);
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
  expect(state.count).toBe(4);
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
  expect(state.nodeListCount).toBe(4);
  expect(state.mixedCount).toBe(1);
  expect(state.mixedIsEnhancer).toBe(true);
});

test("init() default selector and unknown selectors degrade safely", async ({ page }) => {
  const state = await page.evaluate(() => {
    const defaults = Combobox.init();
    const none = Combobox.init("#does-not-exist");
    return { defaults: defaults.length, none: none.length };
  });
  expect(state.defaults).toBe(0);
  expect(state.none).toBe(0);
});
