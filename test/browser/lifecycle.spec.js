import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await setup(page, "/test/fixtures/features.html");
  test.skip(!(await modernSupported(page)), "Modern Popover support is required");
});

for (const separators of [[], [";"]]) {
  test(`blur creation settling after dispose leaves restored options and detached UI untouched (${separators.length ? "tokens" : "plain"})`, async ({
    page,
  }) => {
    const state = await page.evaluate(async (separators) => {
      const source = document.getElementById("tags");
      source.options[0].setAttribute("data-filtered", "authored");
      source.options[0].setAttribute("data-active-option", "original");
      let release;
      let started;
      const pending = new Promise((resolve) => {
        release = resolve;
      });
      const ready = new Promise((resolve) => {
        started = resolve;
      });
      const combo = new Combobox(source, {
        createOnBlur: true,
        separators,
        create: async (label) => {
          started();
          await pending;
          return { value: label, label };
        },
      });
      combo.input.focus();
      combo.input.value = "New tag";
      const outside = document.createElement("button");
      document.body.append(outside);
      outside.focus();
      await ready;
      combo.dispose();
      const html = source.outerHTML;
      const changes = [];
      const observer = new MutationObserver((records) => changes.push(...records));
      observer.observe(source, { attributes: true, subtree: true, childList: true });
      observer.observe(combo.listbox, { attributes: true, subtree: true, childList: true });
      release();
      await new Promise((resolve) => setTimeout(resolve, 30));
      observer.disconnect();
      return {
        unchanged: html === source.outerHTML,
        changes: changes.length,
        values: [...source.selectedOptions].map((option) => option.value),
      };
    }, separators);
    expect(state).toEqual({ unchanged: true, changes: 0, values: ["1"] });
  });
}

test("dispose preserves authored markers on excluded empty options and untouched late additions", async ({
  page,
}) => {
  const state = await page.evaluate(() => {
    const source = document.getElementById("tags");
    const empty = new Option("Empty", "");
    empty.setAttribute("data-filtered", "authored");
    empty.setAttribute("data-active-option", "original");
    source.prepend(empty);
    const combo = new Combobox(source);
    const late = empty.cloneNode(true);
    late.value = "late";
    source.append(late);
    combo.dispose();
    return [empty, late].map((option) => [
      option.getAttribute("data-filtered"),
      option.getAttribute("data-active-option"),
    ]);
  });
  expect(state).toEqual([
    ["authored", "original"],
    ["authored", "original"],
  ]);
});

for (const hook of ["beforefilter", "combobox:beforeload"]) {
  test(`disposing synchronously from ${hook} stops the search without loading or writing`, async ({
    page,
  }) => {
    const state = await page.evaluate(async (hook) => {
      const source = document.getElementById("tags");
      let calls = 0;
      let restored;
      const combo = new Combobox(source, {
        load: async () => {
          calls++;
          return [];
        },
      });
      const target = hook === "beforefilter" ? combo.input : source;
      target.addEventListener(
        hook,
        () => {
          combo.dispose();
          restored = source.outerHTML;
        },
        { once: true },
      );
      await combo.search("remote", { show: true });
      return { calls, restored: restored === source.outerHTML };
    }, hook);
    expect(state).toEqual({ calls: 0, restored: true });
  });
}
