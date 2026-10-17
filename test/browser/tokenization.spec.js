import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await setup(page, "/test/fixtures/features.html");
  test.skip(!(await modernSupported(page)), "Modern Popover support is required");
});

for (const refusal of ["guard", "maxItems"]) {
  test(`a transforming custom tokenizer retains original input on partial ${refusal} refusal`, async ({
    page,
  }) => {
    const state = await page.evaluate(async (refusal) => {
      const source = document.createElement("select");
      source.multiple = true;
      document.body.append(source);
      const combo = new Combobox(source, {
        create: true,
        separators: [";"],
        maxItems: refusal === "maxItems" ? 1 : 0,
        guards: { add: ({ label }) => label !== "beta" },
        tokenize: () => ({ tokens: ["alpha", "beta"], rest: "draft" }),
      });
      const original = '"ALPHA"; "BETA"; draft';
      combo.input.value = original;
      combo.input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        text: combo.input.value,
        original,
        values: [...source.selectedOptions].map((option) => option.value),
        count: source.options.length,
      };
    }, refusal);
    expect(state.text).toBe(state.original);
    expect(state.values).toEqual(["alpha"]);
    expect(state.count).toBe(1);
  });
}

for (const action of ["Enter", "blur"]) {
  test(`custom tokenizer rest survives ${action} finalization`, async ({ page }) => {
    const state = await page.evaluate(async (action) => {
      const source = document.createElement("select");
      source.multiple = true;
      document.body.append(source);
      const combo = new Combobox(source, {
        create: true,
        createOnBlur: true,
        separators: [";"],
        tokenize: () => ({ tokens: ["alpha"], rest: "unfinished" }),
      });
      combo.input.focus();
      combo.input.value = '"ALPHA"; unfinished';
      combo.show();
      if (action === "Enter")
        combo.input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
        );
      else {
        const outside = document.createElement("button");
        document.body.append(outside);
        outside.focus();
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { text: combo.input.value, values: [...source.selectedOptions].map((option) => option.value) };
    }, action);
    expect(state).toEqual({ text: "unfinished", values: ["alpha"] });
  });
}

test("queued Enter uses the input snapshot for its pre-resolved tokens and preserves refused tail", async ({
  page,
}) => {
  const state = await page.evaluate(async () => {
    const source = document.createElement("select");
    source.multiple = true;
    document.body.append(source);
    let release;
    let started;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    const combo = new Combobox(source, {
      separators: [";"],
      guards: { add: ({ label }) => label !== "blocked" },
      create: async (label) => {
        if (label === "first") {
          started();
          await pending;
        }
        return { value: label, label };
      },
    });
    combo.input.value = "first;";
    combo.input.dispatchEvent(new Event("input", { bubbles: true }));
    await ready;
    combo.input.value = "second;blocked;tail";
    combo.show();
    combo.input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    release();
    await new Promise((resolve) => setTimeout(resolve, 30));
    return {
      text: combo.input.value,
      values: [...source.selectedOptions].map((option) => option.value),
      count: source.options.length,
    };
  });
  expect(state).toEqual({ text: "blocked;tail", values: ["first", "second"], count: 2 });
});
